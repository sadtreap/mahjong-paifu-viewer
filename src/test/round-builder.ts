/** Compact builders for hand-made rounds in replay tests. */

import type {
  AnkanEvent,
  CallEvent,
  DiscardEvent,
  DoraEvent,
  DrawEvent,
  GameLog,
  KakanEvent,
  Quad,
  RiichiAcceptedEvent,
  Round,
  RoundEvent,
  RyukyokuEvent,
  RyukyokuReason,
  Seat,
  WinEvent,
} from "../core/model";
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

export function makeGame(rounds: Round[], extra: Partial<GameLog> = {}): GameLog {
  return {
    format: "tenhou-json",
    players: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
    rules: { redFives: true },
    rounds,
    ...extra,
  };
}

/** All 136 tiles (one red five per suit) in a fixed pseudo-random order. */
export function shuffledWall(seed = 1): KnownTile[] {
  const wall: KnownTile[] = [];
  for (let kind = 0; kind < 34; kind++) {
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
  /** Number of draws, in turn order from the dealer; at most 70. */
  draws: number;
  /** Draw numbers (0-based) whose discard declares riichi, accepted right away. */
  riichiAt?: number[];
  /** Leave the last draw in hand (for a tsumo) instead of discarding it. */
  keepLastDraw?: boolean;
  /** Events appended after the draws, usually the result. */
  results?: RoundEvent[];
}

/**
 * A consistent round dealt from `shuffledWall` where every seat draws and discards its drawn tile
 * (tsumogiri). With 70 draws the wall is exhausted.
 */
export function wallRound(options: WallRoundOptions): Round {
  const { seed, draws, riichiAt = [], keepLastDraw = false, results = [], ...overrides } = options;
  const wall = shuffledWall(seed);
  const dealer = overrides.dealer ?? 0;
  const hands: Quad<Tile[]> = [[], [], [], []];
  for (let offset = 0; offset < 4; offset++) {
    hands[((dealer + offset) % 4) as Seat] = wall.slice(offset * 13, offset * 13 + 13);
  }
  const events: RoundEvent[] = [];
  for (let n = 0; n < draws; n++) {
    const seat = ((dealer + n) % 4) as Seat;
    const tile = wall[53 + n] as KnownTile;
    events.push(draw(seat, tile));
    if (keepLastDraw && n === draws - 1) {
      break;
    }
    const riichi = riichiAt.includes(n);
    events.push(discard(seat, tile, { tsumogiri: true, riichi }));
    if (riichi) {
      events.push(riichiAccepted(seat));
    }
  }
  events.push(...results);
  return makeRound({
    number: dealer + 1,
    ...overrides,
    dealer,
    hands,
    doraIndicators: [wall[52] as KnownTile],
    events,
  });
}

/** The tile a `wallRound` with the same seed deals as draw number `n` (0-based). */
export function wallDraw(n: number, seed?: number): KnownTile {
  return shuffledWall(seed)[53 + n] as KnownTile;
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
