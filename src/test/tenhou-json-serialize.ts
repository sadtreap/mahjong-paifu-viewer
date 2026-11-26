/**
 * Test-only GameLog -> tenhou.net/6 JSON serializer, written from the format as
 * src/formats/tenhou-json/parse.ts reads it and as Tenhou's own JSON export writes it. It lets the
 * tenhou.net/6 parser be tested on whole games, and the other formats be cross-checked against it:
 * parseTenhouJson(toTenhouJson(game)) gives back stripTenhouJsonUnsupported(game).
 *
 * The output follows Tenhou's export (official key order ver, ref, log, ratingc, rule, lobby, dan,
 * rate, sx, sc, name): each round is [[kyoku, honba, kyotaku], scores, dora indicators, ura
 * indicators, then each seat's starting hand (in Tenhou's order, see tenhouHandOrder), takes and
 * discards, then the result], with
 * kyoku = 4 x wind + dealer. Takes are draws (tile ids) and call strings whose letter position
 * names the discarder with four-seat geometry ("p252525" from the left, "25p2525" from across,
 * "2525p25" from the right; chi "c" first; open kan "m"). Discards are tile ids, 60 for the tile
 * just drawn, "r" before a riichi discard, 0 for the turn of an open kan, "424242a42" for a closed
 * kan, the pon's string with "k" and the added tile in place of "p" for an added kan, and "f44"
 * for a North set aside (kita), whose replacement draw is the seat's next take.
 *
 * Three-player games are written as Tenhou writes them: four seat slots, seat 3 with empty lists,
 * 0 points and 0 deltas, name "", rank 新人, rating 1500 and sx "C"; ratingc "PF3" (four-player:
 * "PF4"); score texts are the four-player ones (Tenhou's tsumo loss: "1000-2000点" is worth 3000
 * with two payers), and a seat 0 / seat 2 call uses the across position.
 *
 * Results: ["和了", deltas, [winner, from, pao or winner, score text, ...yaku], ...] (one pair per
 * winner); ["流局", deltas] for an exhaustive draw, ["全員聴牌"] / ["全員不聴"] when every / no
 * playing seat is tenpai; the abortive draws by their Tenhou names, with deltas only when someone
 * pays; a round that ends with an unknown result without payments has no result entry. Yaku use
 * Tenhou's names (tenhouYakuName), and an unknown yaku its raw text.
 *
 * What the model does not keep is written as Tenhou would: ver 2.3, lobby 0, sx "M"; dan and rate
 * only when every playing seat has one; rule.aka51-53 1 with red fives, else 0; rule.disp is
 * rules.description, or Tenhou's rule text for the rules when room and length are known; sc pairs
 * the final points with Tenhou's ranked-game result (tenhouUma).
 *
 * Throws on what tenhou.net/6 cannot express or the events contradict: unknown tiles, more than one
 * starting dora indicator, a tsumogiri discard that is not the tile just drawn, a call on one's own
 * discard, a chi not from the left, an added kan without a pon, a kita that is not a North or is in
 * a four-player game, a tsumo whose points do not split into Tenhou's payments, a yaku that has no
 * Tenhou name and no raw text, a kyoku number above 15, and an unknown result with payments.
 */
import type {
  CallEvent,
  GameLog,
  LimitName,
  PlayerCount,
  PlayerInfo,
  Quad,
  Round,
  RoundEvent,
  RyukyokuEvent,
  RyukyokuReason,
  Seat,
  WinEvent,
  YakuEntry,
} from "../core/model";
import { activeSeats, isActiveSeat } from "../core/players";
import { tenpaiFromDeltas } from "../core/tenpai";
import { isRedFive, type KnownTile, sortTiles, type Tile, tileKind } from "../core/tile";
import { tenhouYakuName } from "../core/yaku";
import { parseTenhouRuleText, tenhouDanIndex, tenhouRuleText } from "../formats/tenhou-labels";
import { tenhouUma } from "./mjlog-serialize";

/** A tenhou.net/6 take or discard entry: a tile id, 60, 0 or a call string. */
type Entry = number | string;

const TSUMOGIRI = 60;
const KITA = "f44";

const LIMIT_TEXT: Record<LimitName, string> = {
  mangan: "満貫",
  haneman: "跳満",
  baiman: "倍満",
  sanbaiman: "三倍満",
  yakuman: "役満",
};

const RYUKYOKU_TEXT: Record<Exclude<RyukyokuReason, "exhaustive" | "unknown">, string> = {
  nagashiMangan: "流し満貫",
  kyuushuKyuuhai: "九種九牌",
  suufonRenda: "四風連打",
  suuchaRiichi: "四家立直",
  suukaikan: "四槓散了",
  sanchaHou: "三家和了",
};

const YAKUMAN_TEXT: Record<number, string> = { 13: "役満", 26: "ダブル役満", 39: "トリプル役満" };

/** Tenhou tile id: 11-19 man, 21-29 pin, 31-39 sou, 41-47 honors, 51-53 red fives. */
export function tenhouTileId(tile: Tile): number {
  const kind = tileKind(tile);
  if (kind < 0) {
    throw new Error("toTenhouJson: tenhou.net/6 cannot record an unknown tile");
  }
  if (isRedFive(tile)) {
    return 51 + Math.floor(kind / 9);
  }
  return kind >= 27 ? 41 + kind - 27 : 11 + Math.floor(kind / 9) * 10 + (kind % 9);
}

/**
 * Tiles in the order of Tenhou's starting hands: by kind, with a red five after the plain fives
 * (unlike sortTiles, which follows mjlog's tile ids).
 */
export function tenhouHandOrder(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort(
    (a, b) => tileKind(a) - tileKind(b) || Number(isRedFive(a)) - Number(isRedFive(b)),
  );
}

function ids(tiles: readonly Tile[]): string {
  return tiles.map((tile) => String(tenhouTileId(tile))).join("");
}

/**
 * A call string: the letter goes before the called tile, first for a call from the left, second
 * from across and last from the right (four-seat geometry, also with three players).
 */
function callString(event: CallEvent): string {
  const letter = { chi: "c", pon: "p", daiminkan: "m" }[event.type];
  const called = `${letter}${tenhouTileId(event.tile)}`;
  const consumed = event.consumed.map((tile) => String(tenhouTileId(tile)));
  const relative = (event.from - event.seat + 4) % 4;
  if (relative === 0) {
    throw new Error(`toTenhouJson: seat ${event.seat} calls its own discard`);
  }
  if (event.type === "chi" && relative !== 3) {
    throw new Error(`toTenhouJson: seat ${event.seat} calls chi from seat ${event.from}`);
  }
  const position = relative === 3 ? 0 : relative === 2 ? 1 : consumed.length;
  consumed.splice(position, 0, called);
  return consumed.join("");
}

/** The per-payer amounts of a tsumo worth `points` in total, as Tenhou's score text has them. */
function tsumoPayment(points: number, dealerWins: boolean, playerCount: PlayerCount): string {
  const payers = playerCount - 1;
  if (dealerWins) {
    if (points % (payers * 100) !== 0) {
      throw new Error(`toTenhouJson: a dealer tsumo of ${points} points does not split evenly`);
    }
    return `${points / payers}点∀`;
  }
  // The dealer pays twice the base rounded up (2X or 2X - 100), each other non-dealer X.
  const nonDealers = playerCount - 2;
  for (const dealerShare of [0, 100]) {
    const each = (points + dealerShare) / (nonDealers + 2);
    if (Number.isInteger(each / 100)) {
      return `${each}-${2 * each - dealerShare}点`;
    }
  }
  throw new Error(`toTenhouJson: a tsumo of ${points} points does not split into payments`);
}

function scoreText(win: WinEvent, dealer: Seat, playerCount: PlayerCount): string | undefined {
  if (win.points === undefined) {
    return undefined;
  }
  const payment =
    win.seat === win.from
      ? tsumoPayment(win.points, win.seat === dealer, playerCount)
      : `${win.points}点`;
  if (win.limit !== undefined) {
    return `${LIMIT_TEXT[win.limit]}${payment}`;
  }
  const fu = win.fu === undefined ? "" : `${win.fu}符`;
  const han = win.han === undefined ? "" : `${win.han}飜`;
  return `${fu}${han}${payment}`;
}

function yakuText(entry: YakuEntry): string {
  const name = entry.key === null ? entry.raw : tenhouYakuName(entry.key);
  if (name === undefined) {
    throw new Error(`toTenhouJson: no Tenhou name for the yaku ${entry.key ?? "without a key"}`);
  }
  if (entry.yakuman) {
    const value = YAKUMAN_TEXT[entry.han];
    if (value === undefined) {
      throw new Error(`toTenhouJson: a yakuman worth ${entry.han} han`);
    }
    return `${name}(${value})`;
  }
  return `${name}(${entry.han}飜)`;
}

function winEntry(win: WinEvent, dealer: Seat, playerCount: PlayerCount): [Quad<number>, Entry[]] {
  const info: Entry[] = [win.seat, win.from, win.pao ?? win.seat];
  const text = scoreText(win, dealer, playerCount);
  if (text !== undefined) {
    info.push(text, ...(win.yaku ?? []).map(yakuText));
  }
  return [[...win.deltas], info];
}

const isZero = (deltas: Quad<number>) => deltas.every((delta) => delta === 0);

/** A result entry: its name, then deltas and win details. */
type Result = Array<string | Quad<number> | Entry[]>;

function ryukyokuEntry(event: RyukyokuEvent, playerCount: PlayerCount): Result | undefined {
  const deltas: Quad<number>[] = isZero(event.deltas) ? [] : [[...event.deltas]];
  switch (event.reason) {
    case "unknown":
      if (deltas.length > 0) {
        throw new Error(
          "toTenhouJson: tenhou.net/6 has no result for an unknown draw with payments",
        );
      }
      return undefined;
    case "exhaustive": {
      const tenpai = event.tenpai;
      if (deltas.length === 0 && tenpai?.length === activeSeats(playerCount).length) {
        return ["全員聴牌"];
      }
      if (deltas.length === 0 && tenpai?.length === 0) {
        return ["全員不聴"];
      }
      return ["流局", ...deltas];
    }
    default:
      return [RYUKYOKU_TEXT[event.reason], ...deltas];
  }
}

function roundResult(round: Round, playerCount: PlayerCount): Result | undefined {
  const wins = round.events.filter((event): event is WinEvent => event.type === "win");
  if (wins.length > 0) {
    return ["和了", ...wins.flatMap((win) => winEntry(win, round.dealer, playerCount))];
  }
  const draw = round.events.find((event): event is RyukyokuEvent => event.type === "ryukyoku");
  return draw === undefined ? undefined : ryukyokuEntry(draw, playerCount);
}

function roundToTenhou(round: Round, playerCount: PlayerCount): unknown[] {
  const kyoku = round.wind * 4 + round.dealer;
  if (kyoku > 15) {
    throw new Error(`toTenhouJson: kyoku number ${kyoku} is above 15`);
  }
  if (round.doraIndicators.length !== 1) {
    throw new Error("toTenhouJson: a round needs exactly one starting dora indicator");
  }
  const dora = [...round.doraIndicators];
  const takes: Quad<Entry[]> = [[], [], [], []];
  const discards: Quad<Entry[]> = [[], [], [], []];
  const drawn: Quad<Tile | null> = [null, null, null, null];
  // Each seat's pon strings by tile kind, which an added kan rewrites.
  const pons = new Map<string, string>();

  for (const event of round.events) {
    switch (event.type) {
      case "draw":
        takes[event.seat].push(tenhouTileId(event.tile));
        drawn[event.seat] = event.tile;
        continue;
      case "chi":
      case "pon":
      case "daiminkan": {
        const text = callString(event);
        takes[event.seat].push(text);
        if (event.type === "pon") {
          pons.set(`${event.seat}:${tileKind(event.tile)}`, text);
        } else if (event.type === "daiminkan") {
          discards[event.seat].push(0);
        }
        break;
      }
      case "discard": {
        if (event.tsumogiri && drawn[event.seat] !== event.tile) {
          throw new Error(
            `toTenhouJson: seat ${event.seat} discards ${event.tile} as tsumogiri but drew ${drawn[event.seat]}`,
          );
        }
        const value = event.tsumogiri ? TSUMOGIRI : tenhouTileId(event.tile);
        discards[event.seat].push(event.riichi ? `r${value}` : value);
        break;
      }
      case "ankan": {
        const text = ids(event.tiles);
        discards[event.seat].push(`${text.slice(0, 6)}a${text.slice(6)}`);
        break;
      }
      case "kakan": {
        const pon = pons.get(`${event.seat}:${tileKind(event.tile)}`);
        if (pon === undefined) {
          throw new Error(`toTenhouJson: seat ${event.seat} adds ${event.tile} without a pon`);
        }
        discards[event.seat].push(pon.replace("p", `k${tenhouTileId(event.tile)}`));
        break;
      }
      case "kita":
        if (playerCount !== 3 || tileKind(event.tile) !== tileKind("4z")) {
          throw new Error(`toTenhouJson: seat ${event.seat} sets aside ${event.tile} as kita`);
        }
        discards[event.seat].push(KITA);
        break;
      case "dora":
        dora.push(event.indicator);
        continue;
      case "riichiAccepted":
      case "win":
      case "ryukyoku":
        continue;
    }
    drawn[event.seat] = null;
  }

  const ura = round.events.find(
    (event): event is WinEvent => event.type === "win" && (event.uraIndicators?.length ?? 0) > 0,
  )?.uraIndicators;
  const seats = ([0, 1, 2, 3] as const).flatMap((seat) => [
    tenhouHandOrder(round.hands[seat]).map(tenhouTileId),
    takes[seat],
    discards[seat],
  ]);
  const entries: unknown[] = [
    [kyoku, round.honba, round.riichiSticks],
    [...round.scores],
    dora.map(tenhouTileId),
    (ura ?? []).map(tenhouTileId),
    ...seats,
  ];
  const result = roundResult(round, playerCount);
  if (result !== undefined) {
    entries.push(result);
  }
  return entries;
}

/** Whether every playing seat has the field, so tenhou.net/6 can list it for all of them. */
function everyPlayer(game: GameLog, has: (player: PlayerInfo) => boolean): boolean {
  return activeSeats(game.playerCount).every((seat) => has(game.players[seat]));
}

/** The rule text tenhou.net/6 carries for a game (see the top of this file). */
function ruleText(game: GameLog): string | undefined {
  const { rules } = game;
  if (rules.description !== undefined) {
    return rules.description;
  }
  if (rules.room === undefined || rules.length === undefined) {
    return undefined;
  }
  return tenhouRuleText({
    players: game.playerCount,
    room: rules.room,
    length: rules.length,
    openTanyao: rules.openTanyao ?? true,
    redFives: rules.redFives,
    fast: rules.fast ?? false,
  });
}

/** The tenhou.net/6 JSON object of a three- or four-player game (see the top of this file). */
export function toTenhouJsonObject(game: GameLog): Record<string, unknown> {
  const { playerCount } = game;
  const empty = (seat: number) => !isActiveSeat(seat as Seat, playerCount);
  const data: Record<string, unknown> = { ver: 2.3 };
  if (game.id !== undefined) {
    data.ref = game.id;
  }
  data.log = game.rounds.map((round) => roundToTenhou(round, playerCount));
  data.ratingc = `PF${playerCount}`;
  const aka = game.rules.redFives ? 1 : 0;
  const disp = ruleText(game);
  data.rule = { ...(disp === undefined ? {} : { disp }), aka53: aka, aka52: aka, aka51: aka };
  data.lobby = 0;
  if (everyPlayer(game, (player) => player.rank !== undefined)) {
    data.dan = game.players.map((player, seat) => (empty(seat) ? "新人" : player.rank));
  }
  if (everyPlayer(game, (player) => player.rating !== undefined)) {
    data.rate = game.players.map((player, seat) => (empty(seat) ? 1500 : player.rating));
  }
  data.sx = game.players.map((_, seat) => (empty(seat) ? "C" : "M"));
  if (game.finalScores) {
    const uma = tenhouUma(game.finalScores, playerCount);
    data.sc = game.finalScores.flatMap((points, seat) => [points, Number(uma[seat as Seat])]);
  }
  data.name = game.players.map((player, seat) => (empty(seat) ? "" : player.name));
  return data;
}

export function toTenhouJson(game: GameLog): string {
  return JSON.stringify(toTenhouJsonObject(game));
}

/** Concealed tiles of a seat right before `end` (an index into round.events). */
function concealedBefore(round: Round, seat: Seat, end: number): Tile[] {
  const hand = [...round.hands[seat]];
  const remove = (tile: Tile) => {
    const at = hand.indexOf(tile);
    if (at >= 0) {
      hand.splice(at, 1);
    }
  };
  for (const event of round.events.slice(0, end)) {
    if (!("seat" in event) || event.seat !== seat) {
      continue;
    }
    switch (event.type) {
      case "draw":
        hand.push(event.tile);
        break;
      case "discard":
      case "kakan":
      case "kita":
        remove(event.tile);
        break;
      case "chi":
      case "pon":
      case "daiminkan":
        event.consumed.forEach(remove);
        break;
      case "ankan":
        event.tiles.forEach(remove);
        break;
    }
  }
  return hand;
}

/** The tile the replay wins on: the tile of the event before the result. */
function winningTile(round: Round, index: number): Tile | undefined {
  const last = round.events.slice(0, index).findLast((event) => event.type !== "win");
  switch (last?.type) {
    case "draw":
    case "discard":
    case "kakan":
    case "kita":
      return last.tile;
    case "ankan":
      return last.tiles[0];
    default:
      return undefined;
  }
}

function stripWin(round: Round, index: number, win: WinEvent, ura: readonly KnownTile[]): WinEvent {
  const stripped: WinEvent = {
    type: "win",
    seat: win.seat,
    from: win.from,
    deltas: [...win.deltas],
  };
  const tile = win.tile ?? winningTile(round, index);
  if (tile !== undefined) {
    stripped.tile = tile;
    const hand = win.hand ?? [
      ...concealedBefore(round, win.seat, index),
      ...(win.seat === win.from ? [] : [tile]),
    ];
    stripped.hand = sortTiles(hand);
  }
  const riichi = round.events.some(
    (event) => event.type === "discard" && event.seat === win.seat && event.riichi,
  );
  if (riichi && ura.length > 0) {
    stripped.uraIndicators = [...ura];
  }
  if (win.pao !== undefined && win.pao !== win.seat && win.pao !== win.from) {
    stripped.pao = win.pao;
  }
  if (win.points === undefined) {
    return stripped;
  }
  const yaku = (win.yaku ?? []).map((entry): YakuEntry => {
    const kept: YakuEntry = { key: entry.key, han: entry.han };
    if (entry.key === null && entry.raw !== undefined) {
      kept.raw = entry.raw;
    }
    if (entry.yakuman) {
      kept.yakuman = true;
    }
    return kept;
  });
  const yakuHan = yaku.length > 0 ? yaku.reduce((sum, entry) => sum + entry.han, 0) : undefined;
  if (win.limit === undefined) {
    if (win.fu !== undefined) {
      stripped.fu = win.fu;
    }
    const han = win.han ?? yakuHan;
    if (han !== undefined) {
      stripped.han = han;
    }
  } else if (yakuHan !== undefined) {
    stripped.han = yakuHan;
  }
  const limit = win.limit ?? (yaku.some((entry) => entry.yakuman) ? "yakuman" : undefined);
  if (limit !== undefined) {
    stripped.limit = limit;
  }
  stripped.points = win.points;
  stripped.yaku = yaku;
  return stripped;
}

function stripRyukyoku(event: RyukyokuEvent, playerCount: PlayerCount): RyukyokuEvent {
  const stripped: RyukyokuEvent = {
    type: "ryukyoku",
    reason: event.reason,
    deltas: [...event.deltas],
  };
  if (event.reason === "exhaustive") {
    const entry = ryukyokuEntry(event, playerCount);
    const tenpai =
      entry?.[0] === "全員聴牌"
        ? [...activeSeats(playerCount)]
        : entry?.[0] === "全員不聴"
          ? []
          : tenpaiFromDeltas(event.deltas, playerCount);
    if (tenpai !== undefined) {
      stripped.tenpai = tenpai;
    }
  }
  return stripped;
}

function stripRound(round: Round, playerCount: PlayerCount): Round {
  const ura =
    round.events.find(
      (event): event is WinEvent => event.type === "win" && (event.uraIndicators?.length ?? 0) > 0,
    )?.uraIndicators ?? [];
  const events = round.events.map((event, index): RoundEvent => {
    switch (event.type) {
      case "win":
        return stripWin(round, index, event, ura);
      case "ryukyoku":
        return stripRyukyoku(event, playerCount);
      case "chi":
      case "pon":
      case "daiminkan":
        return { ...event, consumed: [...event.consumed] };
      case "ankan":
        return { ...event, tiles: [...event.tiles] };
      default:
        return { ...event };
    }
  });
  return {
    wind: round.wind,
    number: round.dealer + 1,
    dealer: round.dealer,
    honba: round.honba,
    riichiSticks: round.riichiSticks,
    scores: [...round.scores],
    doraIndicators: [...round.doraIndicators],
    hands: round.hands.map(tenhouHandOrder) as Quad<Tile[]>,
    events,
  };
}

/**
 * What parseTenhouJson(toTenhouJson(game)) gives back: `game` without what tenhou.net/6 cannot
 * carry, and with what it states that the model may leave out. Changed:
 * - format is "tenhou-json";
 * - players: rank only when every playing seat has one, with the dan index Tenhou's label gives
 *   (none for other labels); rating only when every playing seat has one; the empty seat 3 of a
 *   three-player game is { name: "" };
 * - rules: what the rule text (see ruleText) says, read as parseTenhouJson reads it: description
 *   is the text, length from 東 or 南 in it, room, open tanyao and fast only from Tenhou's own text;
 * - rounds: number is dealer + 1 (Tenhou's kyoku numbering); starting hands in Tenhou's order
 *   (tenhouHandOrder);
 * - win: tile and hand (sorted) filled in from the replay; ura indicators (the round's, from the
 *   first win that has any) only for winners who declared riichi; a pao equal to the winner or
 *   dealer-in dropped; without points, no score details at all; else fu only for hands below
 *   mangan, han the sum of the yaku for limit hands, limit "yakuman" when a yaku is, raw text only
 *   for unknown yaku;
 * - ryukyoku: no hands; tenpai only for exhaustive draws, from 全員聴牌 / 全員不聴 or the payments.
 *
 * Not handled here (they change event order, not fields): kan dora and riichiAccepted must already
 * be where parseTenhouJson places them (Tenhou's timing; every parser emits them there).
 */
export function stripTenhouJsonUnsupported(game: GameLog): GameLog {
  const { playerCount } = game;
  const ranked = everyPlayer(game, (player) => player.rank !== undefined);
  const rated = everyPlayer(game, (player) => player.rating !== undefined);
  const players = game.players.map((player, seat): PlayerInfo => {
    if (!isActiveSeat(seat as Seat, playerCount)) {
      return { name: "" };
    }
    const stripped: PlayerInfo = { name: player.name };
    if (ranked && player.rank !== undefined) {
      stripped.rank = player.rank;
      const danIndex = tenhouDanIndex(player.rank);
      if (danIndex !== undefined) {
        stripped.danIndex = danIndex;
      }
    }
    if (rated && player.rating !== undefined) {
      stripped.rating = player.rating;
    }
    return stripped;
  }) as Quad<PlayerInfo>;

  const rules: GameLog["rules"] = { redFives: game.rules.redFives };
  const disp = ruleText(game);
  if (disp !== undefined) {
    if (/南|south|hanchan/i.test(disp)) {
      rules.length = "south";
    } else if (/東|east|tonpuu/i.test(disp)) {
      rules.length = "east";
    }
    const tenhou = parseTenhouRuleText(disp);
    if (tenhou) {
      rules.room = tenhou.room;
      rules.openTanyao = tenhou.openTanyao;
      rules.fast = tenhou.fast;
    }
    rules.description = disp;
  }

  const stripped: GameLog = {
    format: "tenhou-json",
    playerCount,
    players,
    rules,
    rounds: game.rounds.map((round) => stripRound(round, playerCount)),
  };
  if (game.id !== undefined) {
    stripped.id = game.id;
  }
  if (game.finalScores) {
    stripped.finalScores = [...game.finalScores];
  }
  return stripped;
}
