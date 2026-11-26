/**
 * Compact builders for hand-made rounds in tests. Four-player by default; for three-player (sanma)
 * rounds and games use makeSanmaRound, sampleSanmaRound, `wallRound({ playerCount: 3 })` and
 * `makeGame(rounds, { playerCount: 3 })` (or makeSanmaGame), which keep seat 3 as the empty chair
 * with the canonical placeholders of model.ts.
 */

import type {
  AnkanEvent,
  CallEvent,
  DiscardEvent,
  DoraEvent,
  DrawEvent,
  GameLog,
  KakanEvent,
  KitaEvent,
  PlayerCount,
  Quad,
  RiichiAcceptedEvent,
  Round,
  RoundEvent,
  RyukyokuEvent,
  RyukyokuReason,
  Seat,
  WinEvent,
} from "../core/model";
import { nextSeat, SANMA_UNUSED_KINDS } from "../core/players";
import { isTile, type KnownTile, type Tile, tileFromKind } from "../core/tile";

/** Parses compact mpsz: "123m0p?" -> 1m 2m 3m 0p ?. Spaces are ignored. */
export function tiles(spec: string): Tile[] {
  const result: Tile[] = [];
  let digits = "";
  for (const char of spec.replace(/\s+/g, "")) {
    if (char === "?") {
      result.push("?");
    } else if (/[0-9]/.test(char)) {
      digits += char;
    } else if (/[mpsz]/.test(char) && digits !== "") {
      for (const digit of digits) {
        const tile = `${digit}${char}`;
        if (!isTile(tile)) {
          throw new Error(`Invalid tile ${tile} in "${spec}"`);
        }
        result.push(tile);
      }
      digits = "";
    } else {
      throw new Error(`Invalid tile spec "${spec}"`);
    }
  }
  if (digits !== "") {
    throw new Error(`Missing suit in "${spec}"`);
  }
  return result;
}

export const draw = (seat: Seat, tile: Tile): DrawEvent => ({ type: "draw", seat, tile });

export function discard(
  seat: Seat,
  tile: Tile,
  options: { tsumogiri?: boolean; riichi?: boolean } = {},
): DiscardEvent {
  return {
    type: "discard",
    seat,
    tile,
    tsumogiri: options.tsumogiri ?? false,
    riichi: options.riichi ?? false,
  };
}

/** Discard of the tile just drawn. */
export const tsumogiri = (seat: Seat, tile: Tile): DiscardEvent =>
  discard(seat, tile, { tsumogiri: true });

const call =
  (type: CallEvent["type"]) =>
  (seat: Seat, from: Seat, tile: Tile, consumed: string): CallEvent => ({
    type,
    seat,
    from,
    tile,
    consumed: tiles(consumed),
  });

export const chi = call("chi");
export const pon = call("pon");
export const daiminkan = call("daiminkan");

export const ankan = (seat: Seat, spec: string): AnkanEvent => ({
  type: "ankan",
  seat,
  tiles: tiles(spec),
});

export const kakan = (seat: Seat, tile: Tile): KakanEvent => ({ type: "kakan", seat, tile });

export const riichiAccepted = (seat: Seat): RiichiAcceptedEvent => ({
  type: "riichiAccepted",
  seat,
});

export const dora = (indicator: KnownTile): DoraEvent => ({ type: "dora", indicator });

/** Three-player: sets a North aside (the replay takes the drawn tile when it is a North). */
export const kita = (seat: Seat, tile: Tile = "4z"): KitaEvent => ({ type: "kita", seat, tile });

export function win(
  seat: Seat,
  from: Seat,
  deltas: Quad<number>,
  extra: Partial<Omit<WinEvent, "type" | "seat" | "from" | "deltas">> = {},
): WinEvent {
  return { type: "win", seat, from, deltas, ...extra };
}

export function ryukyoku(
  reason: RyukyokuReason,
  deltas: Quad<number> = [0, 0, 0, 0],
  extra: Partial<Omit<RyukyokuEvent, "type" | "reason" | "deltas">> = {},
): RyukyokuEvent {
  return { type: "ryukyoku", reason, deltas, ...extra };
}

/** A round with plain defaults (East 1, dealer 0, 25000 each, dora indicator 1z). */
export function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    wind: 0,
    number: 1,
    dealer: 0,
    honba: 0,
    riichiSticks: 0,
    scores: [25000, 25000, 25000, 25000],
    doraIndicators: ["1z"],
    hands: [
      tiles("1112345678999m"),
      tiles("1112345678999p"),
      tiles("1112345678999s"),
      tiles("1122334455667z"),
    ],
    events: [],
    ...overrides,
  };
}

/** Start scores of a three-player game: 35000 each, 0 for the empty chair (spread to copy). */
export const SANMA_SCORES = [35000, 35000, 35000, 0] as const;

/**
 * A three-player round with plain defaults (East 1, dealer 0, 35000 each, dora indicator 1z). The
 * hands have no 2m-8m and no North, so kita tests add the Norths they need; seat 3 has none.
 */
export function makeSanmaRound(overrides: Partial<Round> = {}): Round {
  return makeRound({
    scores: [...SANMA_SCORES],
    hands: [tiles("1112345678999p"), tiles("1112345678999s"), tiles("1199m112233556z"), []],
    ...overrides,
  });
}

/**
 * A game of these rounds, four-player unless `extra.playerCount` is 3, which makes player slot 3
 * the empty chair `{ name: "" }` (players in `extra` still replace the defaults).
 */
export function makeGame(rounds: Round[], extra: Partial<GameLog> = {}): GameLog {
  const playerCount = extra.playerCount ?? 4;
  return {
    format: "tenhou-json",
    playerCount,
    players: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: playerCount === 3 ? "" : "D" }],
    rules: { redFives: true },
    rounds,
    ...extra,
  };
}

/** A three-player game of these rounds: `makeGame` with `playerCount` 3. */
export function makeSanmaGame(rounds: Round[], extra: Partial<GameLog> = {}): GameLog {
  return makeGame(rounds, { playerCount: 3, ...extra });
}

/**
 * All 136 tiles (one red five per suit) in a fixed pseudo-random order; with three players the 108
 * tiles without 2m-8m (so the red fives are 0p and 0s).
 */
export function shuffledWall(seed = 1, playerCount: PlayerCount = 4): KnownTile[] {
  const wall: KnownTile[] = [];
  for (let kind = 0; kind < 34; kind++) {
    if (playerCount === 3 && SANMA_UNUSED_KINDS.has(kind)) {
      continue;
    }
    for (let copy = 0; copy < 4; copy++) {
      wall.push(tileFromKind(kind, copy === 0 && kind < 27 && kind % 9 === 4));
    }
  }
  let state = seed >>> 0 || 1;
  for (let i = wall.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [wall[i], wall[j]] = [wall[j] as KnownTile, wall[i] as KnownTile];
  }
  return wall;
}

export interface WallRoundOptions extends Partial<Omit<Round, "hands" | "doraIndicators">> {
  seed?: number;
  /**
   * The wall to deal from instead of `shuffledWall(seed, playerCount)`: 13 tiles for each playing
   * seat from the dealer on in turn order, then the dora indicator, then the draws.
   */
  wall?: readonly KnownTile[];
  /**
   * 3 deals a three-player round from the 108-tile wall: seats 0-2 play in turn, seat 3 gets no
   * tiles and the start scores default to SANMA_SCORES.
   */
  playerCount?: PlayerCount;
  /** Number of draws, replacement draws included; at most 70 (55 with three players). */
  draws: number;
  /** Draw numbers (0-based) whose discard declares riichi, accepted right away. */
  riichiAt?: number[];
  /**
   * Three-player: a drawn North is set aside as kita and the same seat draws the next wall tile as
   * its replacement (which also counts as a draw), except at a riichiAt draw and the last draw,
   * which are discarded as usual. Norths drawn in riichi are set aside too.
   */
  kita?: boolean;
  /** Leave the last draw in hand (for a tsumo) instead of discarding it. */
  keepLastDraw?: boolean;
  /** Events appended after the draws, usually the result. */
  results?: RoundEvent[];
}

/**
 * A consistent round dealt from `shuffledWall` (or the given wall) where every seat draws and
 * discards its drawn tile (tsumogiri). With 70 draws (55 with three players) the wall is exhausted.
 */
export function wallRound(options: WallRoundOptions): Round {
  const {
    seed,
    wall: givenWall,
    playerCount = 4,
    draws,
    riichiAt = [],
    kita: setAsideNorths = false,
    keepLastDraw = false,
    results = [],
    ...overrides
  } = options;
  const wall = givenWall ?? shuffledWall(seed, playerCount);
  const dealer = overrides.dealer ?? 0;
  const hands: Quad<Tile[]> = [[], [], [], []];
  for (let offset = 0; offset < playerCount; offset++) {
    hands[((dealer + offset) % playerCount) as Seat] = wall.slice(offset * 13, offset * 13 + 13);
  }
  const firstDraw = playerCount * 13 + 1;
  const events: RoundEvent[] = [];
  let seat = dealer;
  for (let n = 0; n < draws; n++) {
    const tile = wall[firstDraw + n] as KnownTile;
    events.push(draw(seat, tile));
    if (keepLastDraw && n === draws - 1) {
      break;
    }
    const riichi = riichiAt.includes(n);
    if (setAsideNorths && tile === "4z" && !riichi && n < draws - 1) {
      events.push(kita(seat));
      continue;
    }
    events.push(discard(seat, tile, { tsumogiri: true, riichi }));
    if (riichi) {
      events.push(riichiAccepted(seat));
    }
    seat = nextSeat(seat, playerCount);
  }
  events.push(...results);
  return makeRound({
    number: dealer + 1,
    ...(playerCount === 3 ? { scores: [...SANMA_SCORES] } : {}),
    ...overrides,
    dealer,
    hands,
    doraIndicators: [wall[playerCount * 13] as KnownTile],
    events,
  });
}

/** The tile a `wallRound` with the same seed and player count deals as draw number `n` (0-based). */
export function wallDraw(n: number, seed?: number, playerCount: PlayerCount = 4): KnownTile {
  return shuffledWall(seed, playerCount)[playerCount * 13 + 1 + n] as KnownTile;
}

/**
 * A consistent East 1 with every kind of event: chi with a red five (event 2), pon (4), riichi and
 * its acceptance (7, 8), daiminkan with a rinshan draw and kan dora (11-14), kakan upgrading the pon
 * (16-19), ankan in riichi (21-24) and a ron (27). Seat 0 ends with 37000 points.
 */
export function sampleRound(): Round {
  return makeRound({
    doraIndicators: ["2z"],
    hands: [
      tiles("3m9m123789p222s66z"),
      tiles("40m88p11s5679s333z"),
      tiles("123m50p99p1s78s444z"),
      tiles("234678m456p99s77z"),
    ],
    events: [
      draw(0, "1z"), // 0
      discard(0, "3m"),
      chi(1, 0, "3m", "40m"),
      discard(1, "9s"),
      pon(3, 1, "9s", "99s"),
      discard(3, "2m"), // 5
      draw(0, "9m"),
      discard(0, "1z", { riichi: true }),
      riichiAccepted(0),
      draw(1, "4z"),
      tsumogiri(1, "4z"), // 10
      daiminkan(2, 1, "4z", "444z"),
      draw(2, "6s"),
      discard(2, "1s"),
      dora("3p"),
      draw(3, "9s"), // 15
      kakan(3, "9s"),
      draw(3, "5m"),
      tsumogiri(3, "5m"),
      dora("8s"),
      draw(0, "2s"), // 20
      ankan(0, "2222s"),
      dora("1m"),
      draw(0, "7m"),
      tsumogiri(0, "7m"),
      draw(1, "6z"), // 25
      tsumogiri(1, "6z"),
      win(0, 1, [13000, -12000, 0, 0], {
        tile: "6z",
        hand: tiles("99m123789p666z"),
        han: 4,
        fu: 40,
        points: 12000,
        uraIndicators: ["4s", "2p", "8m", "3s"],
      }),
    ],
  });
}

/**
 * A consistent three-player East 1 (dora indicator 1m, so 9m is dora): seat 0 sets aside the North
 * it draws (event 1) and draws a replacement (2); seat 1 sets aside a dealt North from its hand (5)
 * before its replacement draw (6); seat 0 pons seat 2's discard across the empty chair (10); seat 1
 * declares riichi (13, 14); seat 0 declares an ankan with kan dora and a rinshan draw (18-20); seat
 * 1 sets aside a North while in riichi (23) and seat 2 wins by ron on that North (24), collecting
 * the riichi deposit. End scores: 35000, 28800, 41200, 0.
 */
export function sampleSanmaRound(): Round {
  return makeSanmaRound({
    doraIndicators: ["1m"],
    hands: [tiles("99m234678s66777z"), tiles("9p789s222333554z"), tiles("123406789p111s4z"), []],
    events: [
      draw(0, "4z"), // 0
      kita(0),
      draw(0, "5p"),
      tsumogiri(0, "5p"),
      draw(1, "5z"),
      kita(1), // 5
      draw(1, "1s"),
      tsumogiri(1, "1s"),
      draw(2, "6z"),
      tsumogiri(2, "6z"),
      pon(0, 2, "6z", "66z"), // 10
      discard(0, "9m"),
      draw(1, "9m"),
      discard(1, "9p", { riichi: true }),
      riichiAccepted(1),
      draw(2, "3p"), // 15
      tsumogiri(2, "3p"),
      draw(0, "7z"),
      ankan(0, "7777z"),
      dora("8p"),
      draw(0, "2p"), // 20
      tsumogiri(0, "2p"),
      draw(1, "4z"),
      kita(1),
      win(2, 1, [0, -5200, 6200, 0], {
        tile: "4z",
        hand: tiles("123406789p111s44z"),
        han: 3,
        fu: 40,
        points: 5200,
        yaku: [
          { key: "ittsu", han: 2 },
          { key: "akaDora", han: 1 },
        ],
      }),
    ],
  });
}

/**
 * A consistent three-player game, final scores 32900, 27700, 44400, 0. Round 0 is
 * sampleSanmaRound. Round 1 (East 2, dealer 1): the dealer declares riichi on the first discard,
 * four Norths are set aside (one right after another, two of them by the dealer in riichi) and
 * the wall runs out after 55 draws with only the dealer tenpai. Round 2 (East 2, honba 1): seat 2
 * wins a 1000-2000 tsumo, paid by the two other seats plus honba, and collects the deposit.
 */
export function sampleSanmaGame(): GameLog {
  const exhaustive = wallRound({
    playerCount: 3,
    seed: 33,
    number: 2,
    dealer: 1,
    scores: [35000, 28800, 41200, 0],
    draws: 55,
    riichiAt: [0],
    kita: true,
    results: [ryukyoku("exhaustive", [-1000, 2000, -1000, 0], { tenpai: [1] })],
  });
  const tsumo = wallRound({
    playerCount: 3,
    number: 2,
    dealer: 1,
    honba: 1,
    riichiSticks: 1,
    scores: [34000, 29800, 40200, 0],
    draws: 2,
    keepLastDraw: true,
    results: [win(2, 2, [-1100, -2100, 4200, 0], { tile: wallDraw(1, undefined, 3) })],
  });
  return makeSanmaGame([sampleSanmaRound(), exhaustive, tsumo], {
    finalScores: [32900, 27700, 44400, 0],
  });
}
