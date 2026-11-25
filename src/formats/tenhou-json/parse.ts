import type {
  GameLog,
  GameRules,
  PlayerInfo,
  Quad,
  Round,
  RoundEvent,
  RyukyokuEvent,
  Seat,
  Wind,
  WinEvent,
} from "../../core/model";
import { isRedFive, type KnownTile, sortTiles, type Tile } from "../../core/tile";
import { LogParseError } from "../errors";
import { MAX_ROUND_EVENTS } from "../limits";
import { parseTenhouRuleText, tenhouDanIndex } from "../tenhou-labels";
import { parseSeatActions, type SeatActions, tileFromTenhou } from "./actions";
import { type Interleaved, interleaveRound } from "./interleave";
import { parseRoundResult, type RoundResult } from "./result";

/**
 * A round is [[kyoku, honba, kyotaku], scores, dora, ura, then haipai / takes / discards for each
 * of the four seats, then the result].
 */
const ROUND_LENGTH = 17;
const SEAT_FIELDS_START = 4;
const RESULT_INDEX = 16;

type JsonObject = Record<string, unknown>;

function invalid(detail: string): never {
  throw new LogParseError("invalid", detail);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseTiles(value: unknown, what: string): KnownTile[] {
  if (!Array.isArray(value)) {
    return invalid(`${what} is not a list of tiles`);
  }
  return value.map(tileFromTenhou);
}

function isThreePlayer(data: JsonObject, disp: string | undefined): boolean {
  if (disp !== undefined && /三|3-?player|sanma/i.test(disp)) {
    return true;
  }
  if (Array.isArray(data.name) && data.name.length === 3) {
    return true;
  }
  return (data.log as unknown[]).some(
    (round) =>
      Array.isArray(round) &&
      (round.length === ROUND_LENGTH - 4 ||
        round.length === ROUND_LENGTH - 3 ||
        (Array.isArray(round[1]) && round[1].length === 3) ||
        (Array.isArray(round[13]) && round[13].length === 0)),
  );
}

/**
 * Whether the replay ends the way the result says: a tsumo on the winner's draw, a ron on a
 * discard, on an added kan (chankan) or on a closed kan (only kokushi musou may rob one).
 */
function endMatchesResult(result: RoundResult, last: RoundEvent | undefined): boolean {
  if (result.kind === "win") {
    return result.wins.every((win) =>
      win.seat === win.from
        ? last?.type === "draw" && last.seat === win.seat
        : (last?.type === "discard" || last?.type === "kakan" || last?.type === "ankan") &&
          last.seat === win.from,
    );
  }
  switch (result.reason) {
    case "kyuushuKyuuhai":
      return last?.type === "draw";
    case "unknown":
      return true;
    default:
      return last?.type === "discard";
  }
}

function hasDeclaredRiichi(events: readonly RoundEvent[], seat: Seat): boolean {
  return events.some((event) => event.type === "discard" && event.seat === seat && event.riichi);
}

function resultEvents(
  result: RoundResult,
  replay: Interleaved,
  ura: readonly KnownTile[],
): Array<WinEvent | RyukyokuEvent> {
  if (result.kind === "ryukyoku") {
    const event: RyukyokuEvent = { type: "ryukyoku", reason: result.reason, deltas: result.deltas };
    if (result.tenpai) {
      event.tenpai = result.tenpai;
    }
    return [event];
  }
  const last = replay.events.at(-1);
  const winningTile: Tile | undefined =
    last?.type === "draw" || last?.type === "discard" || last?.type === "kakan"
      ? last.tile
      : last?.type === "ankan"
        ? last.tiles[0]
        : undefined;
  return result.wins.map(({ seat, from, deltas, ...details }) => {
    const event: WinEvent = { type: "win", seat, from, deltas, ...details };
    if (winningTile) {
      event.tile = winningTile;
      // The source has no hands at the win, but the replay knows them when it tracked every tile.
      if (replay.handsChecked) {
        const hand: Tile[] = [...replay.hands[seat]];
        if (seat !== from) {
          hand.push(winningTile);
        }
        event.hand = sortTiles(hand);
      }
    }
    // Like mjlog, ura dora belong to the wins of players in riichi.
    if (ura.length > 0 && hasDeclaredRiichi(replay.events, seat)) {
      event.uraIndicators = [...ura];
    }
    return event;
  });
}

function parseRound(raw: unknown, index: number): Round {
  const where = `round ${index + 1}`;
  if (!Array.isArray(raw) || raw.length < ROUND_LENGTH - 1) {
    return invalid(`${where} is malformed`);
  }
  const [meta, scores, doraIds, uraIds] = raw as unknown[];
  if (!Array.isArray(meta) || !meta.slice(0, 3).every(isNonNegativeInteger) || meta.length < 3) {
    return invalid(`${where} has an invalid [kyoku, honba, kyotaku] entry`);
  }
  const [kyoku, honba, riichiSticks] = meta as [number, number, number];
  if (kyoku > 15) {
    return invalid(`${where} has an invalid kyoku number ${kyoku}`);
  }
  if (
    !Array.isArray(scores) ||
    scores.length !== 4 ||
    !scores.every((score) => typeof score === "number" && Number.isFinite(score))
  ) {
    return invalid(`${where} has invalid scores`);
  }
  const doraIndicators = parseTiles(doraIds, `The dora list of ${where}`);
  const uraIndicators = parseTiles(uraIds, `The ura dora list of ${where}`);

  const haipai = [0, 1, 2, 3].map((seat) => {
    const hand = parseTiles(raw[SEAT_FIELDS_START + seat * 3], `The starting hand of ${where}`);
    if (hand.length !== 13) {
      return invalid(`Seat ${seat} of ${where} does not start with 13 tiles`);
    }
    return hand;
  }) as Quad<KnownTile[]>;
  const seats = ([0, 1, 2, 3] as const).map((seat) =>
    parseSeatActions(
      seat,
      raw[SEAT_FIELDS_START + seat * 3 + 1],
      raw[SEAT_FIELDS_START + seat * 3 + 2],
    ),
  ) as Quad<SeatActions>;
  // Every take and discard becomes at least one event. Checked before the replay, whose search over
  // turn orders costs more the longer the round is.
  const actions = seats.reduce((sum, seat) => sum + seat.takes.length + seat.discards.length, 0);
  if (actions > MAX_ROUND_EVENTS) {
    return invalid(`${where} has ${actions} actions, more than any real game`);
  }

  const result = parseRoundResult(raw[RESULT_INDEX]);
  const dealer = (kyoku % 4) as Seat;
  const replay = interleaveRound({
    dealer,
    haipai,
    seats,
    doraIndicators,
    acceptEnd: (last) => endMatchesResult(result, last),
  });
  if (!replay) {
    return invalid(`The actions of ${where} do not form a valid turn order`);
  }

  const events = [...replay.events];
  // A riichi discard that ends the round is accepted unless it was won on (four riichi, for
  // instance, places the fourth stick before the abortive draw).
  if (
    replay.pendingRiichi !== null &&
    result.kind === "ryukyoku" &&
    result.reason !== "sanchaHou"
  ) {
    events.push({ type: "riichiAccepted", seat: replay.pendingRiichi });
  }
  for (const indicator of replay.unrevealedDora) {
    events.push({ type: "dora", indicator });
  }
  events.push(...resultEvents(result, replay, uraIndicators));

  return {
    wind: Math.floor(kyoku / 4) as Wind,
    number: (kyoku % 4) + 1,
    dealer,
    honba,
    riichiSticks,
    scores: [...scores] as Quad<number>,
    doraIndicators: doraIndicators.slice(0, 1),
    hands: haipai,
    events,
  };
}

function parsePlayers(data: JsonObject): Quad<PlayerInfo> {
  const names = Array.isArray(data.name) ? data.name : [];
  const dans = Array.isArray(data.dan) ? data.dan : [];
  const rates = Array.isArray(data.rate) ? data.rate : [];
  return ([0, 1, 2, 3] as const).map((seat) => {
    const name = names[seat];
    const player: PlayerInfo = { name: typeof name === "string" ? name : "" };
    const dan = dans[seat];
    if (typeof dan === "string" && dan !== "") {
      // The label as written; Tenhou's own labels also give the dan index the UI localizes.
      player.rank = dan;
      const danIndex = tenhouDanIndex(dan);
      if (danIndex !== undefined) {
        player.danIndex = danIndex;
      }
    }
    const rate = rates[seat];
    if (typeof rate === "number" && Number.isFinite(rate)) {
      player.rating = rate;
    }
    return player;
  }) as Quad<PlayerInfo>;
}

function hasRedFive(rounds: readonly Round[]): boolean {
  return rounds.some(
    (round) =>
      round.hands.some((hand) => hand.some(isRedFive)) ||
      round.events.some(
        (event) => "tile" in event && event.tile !== undefined && isRedFive(event.tile),
      ),
  );
}

function parseRules(
  rule: JsonObject,
  disp: string | undefined,
  rounds: readonly Round[],
): GameRules {
  const akaCount = ["aka", "aka51", "aka52", "aka53"].reduce((sum, key) => {
    const value = rule[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
  const rules: GameRules = { redFives: akaCount > 0 || hasRedFive(rounds) };
  if (disp) {
    if (/南|south|hanchan/i.test(disp)) {
      rules.length = "south";
    } else if (/東|east|tonpuu/i.test(disp)) {
      rules.length = "east";
    }
    // Tenhou's own rule text ("鳳南喰赤") says more; other text (e.g. Mahjong Soul room names
    // written by tensoul) is only kept as the description.
    const tenhou = parseTenhouRuleText(disp);
    if (tenhou) {
      rules.room = tenhou.room;
      rules.openTanyao = tenhou.openTanyao;
      rules.fast = tenhou.fast;
    }
    rules.description = disp;
  }
  return rules;
}

/** "sc" interleaves final points and final results: [points0, result0, points1, result1, ...]. */
function parseFinalScores(sc: unknown): Quad<number> | undefined {
  if (!Array.isArray(sc) || sc.length !== 8 || !sc.every((value) => typeof value === "number")) {
    return undefined;
  }
  const points = [sc[0], sc[2], sc[4], sc[6]] as Quad<number>;
  const total = points.reduce((sum, value) => sum + value, 0);
  // Some exports give the points in hundreds, like mjlog's "owari".
  return Math.abs(total) < 10000
    ? (points.map((value) => Math.round(value * 100)) as Quad<number>)
    : points;
}

/** Parses a tenhou.net/6 JSON log (the object with `log`, `name`, `rule`, ...). */
export function parseTenhouJson(text: string): GameLog {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return invalid(`Not valid JSON: ${String(error)}`);
  }
  if (!isObject(data) || !Array.isArray(data.log)) {
    return invalid("A tenhou.net/6 log needs a log array");
  }
  const rule = isObject(data.rule) ? data.rule : {};
  const disp = typeof rule.disp === "string" ? rule.disp : undefined;
  if (isThreePlayer(data, disp)) {
    throw new LogParseError("unsupportedPlayers", "Three-player logs are not supported");
  }
  if (data.log.length === 0) {
    return invalid("The log has no rounds");
  }
  const rounds = data.log.map(parseRound);
  const game: GameLog = {
    format: "tenhou-json",
    players: parsePlayers(data),
    rules: parseRules(rule, disp, rounds),
    rounds,
  };
  if (typeof data.ref === "string" && data.ref !== "") {
    game.id = data.ref;
  }
  const finalScores = parseFinalScores(data.sc);
  if (finalScores) {
    game.finalScores = finalScores;
  }
  return game;
}
