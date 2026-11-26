import {
  type GameLog,
  type GameRules,
  type PlayerCount,
  type PlayerInfo,
  type Quad,
  type Round,
  type RoundEvent,
  type RyukyokuEvent,
  SEATS,
  type Seat,
  type Wind,
  type WinEvent,
} from "../../core/model";
import { isActiveSeat } from "../../core/players";
import { isRedFive, type KnownTile, sortTiles, type Tile } from "../../core/tile";
import { LogParseError } from "../errors";
import { MAX_ROUND_EVENTS } from "../limits";
import { parseTenhouRuleText, tenhouDanIndex } from "../tenhou-labels";
import { parseSeatActions, type SeatActions, tileFromTenhou } from "./actions";
import { type Interleaved, interleaveRound } from "./interleave";
import { parseRoundResult, type RoundResult } from "./result";

/**
 * A round is [[kyoku, honba, kyotaku], scores, dora, ura, then haipai / takes / discards for each
 * of the four seats, then the result]. Three-player rounds keep the four seats with empty lists for
 * seat 3 (Tenhou, tensoul) or leave seat 3's lists out (tensoul-py: 14 entries, result at 13).
 */
const ROUND_LENGTH = 17;
const SEAT_FIELDS_START = 4;
const RESULT_INDEX = 16;
/** Index of seat 3's starting hand, where a round without seat 3's lists has its result. */
const SEAT_3_START = SEAT_FIELDS_START + 3 * 3;
const SHORT_ROUND_LENGTH = ROUND_LENGTH - 3;

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

function isEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

/**
 * The number of players a round's layout shows: three when seat 3's lists are left out (13 or 14
 * entries, without or with the result), or when seat 3 has no starting hand and no points (or no
 * score at all). Undefined for a value that is not a round at all.
 */
function roundLayout(raw: unknown): PlayerCount | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  if (raw.length === SHORT_ROUND_LENGTH || raw.length === SHORT_ROUND_LENGTH - 1) {
    return 3;
  }
  const scores: unknown = raw[1];
  const emptyChair =
    isEmptyList(raw[SEAT_3_START]) &&
    Array.isArray(scores) &&
    (scores.length === 3 || scores[3] === 0);
  return emptyChair ? 3 : 4;
}

/**
 * What the log says about its players outside the rounds: Tenhou's rating class ("PF3" / "PF4"),
 * the 三 or 四 that starts a rule text ("三鳳南喰赤"; four-player Tenhou text usually has neither)
 * and tensoul-py's three names. An empty name for seat 3 says nothing, since a four-player log can
 * have one too.
 */
function declaredPlayerCounts(data: JsonObject, disp: string | undefined): Set<PlayerCount> {
  const declared = new Set<PlayerCount>();
  if (
    data.ratingc === "PF3" ||
    (disp !== undefined && /^三|3-?player|sanma/i.test(disp)) ||
    (Array.isArray(data.name) && data.name.length === 3)
  ) {
    declared.add(3);
  }
  if (data.ratingc === "PF4" || disp?.startsWith("四")) {
    declared.add(4);
  }
  return declared;
}

/**
 * Three or four players, from the layout of the rounds, which every round and everything the log
 * declares about its players must agree with (otherwise the player count is unsupported, as in the
 * other parsers). A North set aside ("f44") in a four-player round is rejected as invalid when the
 * round is parsed, like any other action a four-player round cannot have.
 */
function detectPlayerCount(
  data: JsonObject,
  rounds: readonly unknown[],
  disp: string | undefined,
): PlayerCount {
  const layouts = new Set(rounds.map(roundLayout));
  layouts.delete(undefined);
  if (layouts.size > 1) {
    throw new LogParseError(
      "unsupportedPlayers",
      "Some rounds are laid out for three players and others for four",
    );
  }
  const [playerCount] = layouts;
  if (playerCount === undefined) {
    // No round is even a list; parsing the first one reports it.
    return 4;
  }
  for (const declared of declaredPlayerCounts(data, disp)) {
    if (declared !== playerCount) {
      throw new LogParseError(
        "unsupportedPlayers",
        `The log says ${declared} players, but its rounds are laid out for ${playerCount}`,
      );
    }
  }
  return playerCount;
}

/** A three-player round in the 17-entry layout: tensoul-py's short rounds get seat 3's lists. */
function withSeat3Lists(raw: unknown): unknown {
  if (
    !Array.isArray(raw) ||
    (raw.length !== SHORT_ROUND_LENGTH && raw.length !== SHORT_ROUND_LENGTH - 1)
  ) {
    return raw;
  }
  return [...raw.slice(0, SEAT_3_START), [], [], [], ...raw.slice(SEAT_3_START)];
}

/**
 * The scores at the start of a round: four, or with three players 0 for the empty seat 3, which
 * some converters leave out.
 */
function parseScores(value: unknown, playerCount: PlayerCount): Quad<number> | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((score) => typeof score === "number" && Number.isFinite(score))
  ) {
    return undefined;
  }
  const scores = value as number[];
  if (playerCount === 3 && scores.length === 3) {
    return [...scores, 0] as Quad<number>;
  }
  return scores.length === 4 && (playerCount === 4 || scores[3] === 0)
    ? ([...scores] as Quad<number>)
    : undefined;
}

/**
 * Whether the replay ends the way the result says: a tsumo on the winner's draw, a ron on a
 * discard, on an added kan (chankan), on a closed kan (only kokushi musou may rob one) or on a
 * North set aside as kita.
 */
function endMatchesResult(result: RoundResult, last: RoundEvent | undefined): boolean {
  if (result.kind === "win") {
    return result.wins.every((win) =>
      win.seat === win.from
        ? last?.type === "draw" && last.seat === win.seat
        : (last?.type === "discard" ||
            last?.type === "kakan" ||
            last?.type === "ankan" ||
            last?.type === "kita") &&
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
    last?.type === "draw" ||
    last?.type === "discard" ||
    last?.type === "kakan" ||
    last?.type === "kita"
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

/**
 * Parses one round. With three players, seat 3 is the empty chair: no tiles, 0 points, and the
 * dealer (kyoku % 4, as Tenhou numbers three-player rounds 0-2, 4-6, 8-10) is never seat 3.
 */
function parseRound(input: unknown, index: number, playerCount: PlayerCount): Round {
  const where = `round ${index + 1}`;
  const raw = playerCount === 3 ? withSeat3Lists(input) : input;
  if (!Array.isArray(raw) || raw.length < ROUND_LENGTH - 1) {
    return invalid(`${where} is malformed`);
  }
  const [meta, rawScores, doraIds, uraIds] = raw as unknown[];
  if (!Array.isArray(meta) || !meta.slice(0, 3).every(isNonNegativeInteger) || meta.length < 3) {
    return invalid(`${where} has an invalid [kyoku, honba, kyotaku] entry`);
  }
  const [kyoku, honba, riichiSticks] = meta as [number, number, number];
  if (kyoku > 15) {
    return invalid(`${where} has an invalid kyoku number ${kyoku}`);
  }
  const dealer = (kyoku % 4) as Seat;
  if (!isActiveSeat(dealer, playerCount)) {
    return invalid(`${where} has kyoku number ${kyoku}, whose dealer would be the empty seat 3`);
  }
  const scores = parseScores(rawScores, playerCount);
  if (!scores) {
    return invalid(`${where} has invalid scores`);
  }
  const doraIndicators = parseTiles(doraIds, `The dora list of ${where}`);
  const uraIndicators = parseTiles(uraIds, `The ura dora list of ${where}`);

  const haipai = SEATS.map((seat) => {
    const hand = parseTiles(raw[SEAT_FIELDS_START + seat * 3], `The starting hand of ${where}`);
    if (hand.length !== 13 && isActiveSeat(seat, playerCount)) {
      return invalid(`Seat ${seat} of ${where} does not start with 13 tiles`);
    }
    return hand;
  }) as Quad<KnownTile[]>;
  if (playerCount === 3 && ![0, 1, 2].every((field) => isEmptyList(raw[SEAT_3_START + field]))) {
    return invalid(`The empty seat 3 of ${where} has tiles`);
  }
  const seats = SEATS.map((seat) =>
    parseSeatActions(
      seat,
      raw[SEAT_FIELDS_START + seat * 3 + 1],
      raw[SEAT_FIELDS_START + seat * 3 + 2],
      playerCount,
    ),
  ) as Quad<SeatActions>;
  // Every take and discard becomes at least one event. Checked before the replay, whose search over
  // turn orders costs more the longer the round is.
  const actions = seats.reduce((sum, seat) => sum + seat.takes.length + seat.discards.length, 0);
  if (actions > MAX_ROUND_EVENTS) {
    return invalid(`${where} has ${actions} actions, more than any real game`);
  }

  const result = parseRoundResult(raw[RESULT_INDEX], playerCount);
  const replay = interleaveRound({
    playerCount,
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
    scores,
    doraIndicators: doraIndicators.slice(0, 1),
    hands: haipai,
    events,
  };
}

/**
 * Names, ranks and ratings. The empty seat 3 of a three-player game is `{ name: "" }`, whatever
 * Tenhou writes for it (rank 新人 and rating 1500) or tensoul (rating 0).
 */
function parsePlayers(data: JsonObject, playerCount: PlayerCount): Quad<PlayerInfo> {
  const names = Array.isArray(data.name) ? data.name : [];
  const dans = Array.isArray(data.dan) ? data.dan : [];
  const rates = Array.isArray(data.rate) ? data.rate : [];
  return SEATS.map((seat) => {
    if (!isActiveSeat(seat, playerCount)) {
      return { name: "" };
    }
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
    // written by tensoul) is only kept as the description. The player count it gives is not a
    // rule: GameLog.playerCount comes from the rounds.
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

/**
 * "sc" interleaves final points and final results: [points0, result0, points1, result1, ...]. With
 * three players the empty seat 3's pair is 0, 0, or left out (tensoul-py).
 */
function parseFinalScores(sc: unknown, playerCount: PlayerCount): Quad<number> | undefined {
  if (!Array.isArray(sc) || !sc.every((value) => typeof value === "number")) {
    return undefined;
  }
  const values: number[] = playerCount === 3 && sc.length === 6 ? [...sc, 0, 0] : sc;
  if (values.length !== 8 || (playerCount === 3 && values[6] !== 0)) {
    return undefined;
  }
  const points = [values[0], values[2], values[4], values[6]] as Quad<number>;
  const total = points.reduce((sum, value) => sum + value, 0);
  // Some exports give the points in hundreds, like mjlog's "owari".
  return Math.abs(total) < 10000
    ? (points.map((value) => Math.round(value * 100)) as Quad<number>)
    : points;
}

/**
 * Parses a tenhou.net/6 JSON log (the object with `log`, `name`, `rule`, ...), with four or three
 * players.
 */
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
  if (data.log.length === 0) {
    return invalid("The log has no rounds");
  }
  const playerCount = detectPlayerCount(data, data.log, disp);
  const rounds = data.log.map((round, index) => parseRound(round, index, playerCount));
  const game: GameLog = {
    format: "tenhou-json",
    playerCount,
    players: parsePlayers(data, playerCount),
    rules: parseRules(rule, disp, rounds),
    rounds,
  };
  if (typeof data.ref === "string" && data.ref !== "") {
    game.id = data.ref;
  }
  const finalScores = parseFinalScores(data.sc, playerCount);
  if (finalScores) {
    game.finalScores = finalScores;
  }
  return game;
}
