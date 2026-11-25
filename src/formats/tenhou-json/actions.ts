/**
 * Decoding of the per-seat action lists of a tenhou.net/6 round: the "取" (takes) list of draws
 * and calls, and the "出" (discards) list of discards, riichi declarations and closed/added kans.
 */

import type { Seat } from "../../core/model";
import { type KnownTile, tileFromKind, tileKind } from "../../core/tile";
import { LogParseError } from "../errors";

/** Discard-list value meaning "the tile just drawn was discarded". */
const TSUMOGIRI = 60;

/** An entry of the takes list. */
export type Take =
  | { kind: "draw"; tile: KnownTile }
  | {
      kind: "chi" | "pon" | "daiminkan";
      /** Seat whose discard was called. */
      from: Seat;
      tile: KnownTile;
      consumed: KnownTile[];
    };

/** An entry of the discards list. */
export type Action =
  | { kind: "discard"; tile: KnownTile; tsumogiri: boolean; riichi: boolean }
  | { kind: "ankan"; tiles: KnownTile[] }
  | { kind: "kakan"; tile: KnownTile }
  /** The placeholder (0) that stands in the discard list for the turn of an open kan. */
  | { kind: "kanSlot" };

export interface SeatActions {
  takes: Take[];
  discards: Action[];
}

function invalid(detail: string): never {
  throw new LogParseError("invalid", detail);
}

/**
 * Tenhou tile ids: 11-19 man, 21-29 pin, 31-39 sou, 41-47 East..Red dragon, 51/52/53 red fives.
 */
export function tileFromTenhou(id: unknown): KnownTile {
  if (typeof id === "number" && Number.isInteger(id)) {
    const suit = Math.floor(id / 10);
    const value = id % 10;
    if (suit >= 1 && suit <= 3 && value >= 1) {
      return tileFromKind((suit - 1) * 9 + value - 1);
    }
    if (suit === 4 && value >= 1 && value <= 7) {
      return tileFromKind(27 + value - 1);
    }
    if (suit === 5 && value >= 1 && value <= 3) {
      return tileFromKind((value - 1) * 9 + 4, true);
    }
  }
  return invalid(`Invalid tile id ${JSON.stringify(id)}`);
}

/** Splits the digits of a call string into tile ids; the letter marks the tile that follows it. */
function splitCall(text: string, letter: string): { tiles: KnownTile[]; marked: number } {
  const position = text.indexOf(letter);
  const digits = text.slice(0, position) + text.slice(position + 1);
  if (position % 2 !== 0 || !/^(?:\d\d)+$/.test(digits)) {
    return invalid(`Invalid call string "${text}"`);
  }
  const tiles = (digits.match(/\d\d/g) ?? []).map((pair) => tileFromTenhou(Number(pair)));
  return { tiles, marked: position / 2 };
}

function relativeSeat(seat: Seat, offset: number): Seat {
  return ((seat + offset) % 4) as Seat;
}

function allSameKind(tiles: readonly KnownTile[]): boolean {
  const kind = tileKind(tiles[0] ?? "?");
  return tiles.every((tile) => tileKind(tile) === kind);
}

function isSequence(tiles: readonly KnownTile[]): boolean {
  const kinds = tiles.map(tileKind).sort((a, b) => a - b);
  const [low, mid, high] = kinds as [number, number, number];
  return (
    low < 27 && Math.floor(low / 9) === Math.floor(high / 9) && mid === low + 1 && high === low + 2
  );
}

/**
 * Decodes a call in the takes list. The position of the letter tells who discarded the called
 * tile (it marks the called tile): first = kamicha, second = toimen, last = shimocha.
 * "c275226" chi 7p with 0p 6p; "p252525" / "12p1212" / "3737p37" pon; "m39393939" /
 * "26m262626" / "131313m13" open kan.
 */
function parseCall(text: string, seat: Seat): Take {
  const letter = /[cpm]/.exec(text)?.[0];
  if (!letter || text.replace(letter, "").search(/\D/) >= 0) {
    return invalid(`Invalid call string "${text}" in the takes list`);
  }
  const { tiles, marked } = splitCall(text, letter);
  const tile = tiles[marked];
  const consumed = tiles.filter((_, index) => index !== marked);
  if (letter === "c") {
    if (tiles.length !== 3 || marked !== 0 || !tile || !isSequence(tiles)) {
      return invalid(`Invalid chi "${text}"`);
    }
    return { kind: "chi", from: relativeSeat(seat, 3), tile, consumed };
  }
  const kind = letter === "p" ? "pon" : "daiminkan";
  const size = kind === "pon" ? 3 : 4;
  if (tiles.length !== size || !tile || !allSameKind(tiles)) {
    return invalid(`Invalid ${kind} "${text}"`);
  }
  let offset: number;
  if (marked === 0) {
    offset = 3;
  } else if (marked === 1) {
    offset = 2;
  } else if (marked === size - 1) {
    offset = 1;
  } else {
    return invalid(`Invalid ${kind} "${text}"`);
  }
  return { kind, from: relativeSeat(seat, offset), tile, consumed };
}

/**
 * Decodes an entry of the discards list: a tile id, 60 (tsumogiri), 0 (open kan placeholder),
 * "r35" / "r60" (riichi), "k16161616" (added kan: the tile after "k" is the added one, the rest is
 * the pon) or "424242a42" (closed kan).
 */
function parseDiscard(item: unknown, seat: Seat, index: number, takes: readonly Take[]): Action {
  const drawn = (): KnownTile => {
    const take = takes[index];
    if (take?.kind !== "draw") {
      return invalid(`Seat ${seat} discards the drawn tile at turn ${index} without a draw`);
    }
    return take.tile;
  };
  if (item === 0) {
    return { kind: "kanSlot" };
  }
  if (item === TSUMOGIRI) {
    return { kind: "discard", tile: drawn(), tsumogiri: true, riichi: false };
  }
  if (typeof item === "number") {
    return { kind: "discard", tile: tileFromTenhou(item), tsumogiri: false, riichi: false };
  }
  if (typeof item !== "string") {
    return invalid(`Invalid discard ${JSON.stringify(item)}`);
  }
  const riichi = /^r(\d\d)$/.exec(item);
  if (riichi) {
    const id = Number(riichi[1]);
    return id === TSUMOGIRI
      ? { kind: "discard", tile: drawn(), tsumogiri: true, riichi: true }
      : { kind: "discard", tile: tileFromTenhou(id), tsumogiri: false, riichi: true };
  }
  const letter = /[ka]/.exec(item)?.[0];
  if (!letter || item.replace(letter, "").search(/\D/) >= 0) {
    return invalid(`Invalid call string "${item}" in the discards list`);
  }
  const { tiles, marked } = splitCall(item, letter);
  const added = tiles[marked];
  if (tiles.length !== 4 || !added || !allSameKind(tiles)) {
    return invalid(`Invalid kan "${item}"`);
  }
  return letter === "a" ? { kind: "ankan", tiles } : { kind: "kakan", tile: added };
}

/** Decodes one seat's takes and discards; tsumogiri entries get the drawn tile filled in. */
export function parseSeatActions(seat: Seat, takes: unknown, discards: unknown): SeatActions {
  if (!Array.isArray(takes) || !Array.isArray(discards)) {
    return invalid(`Seat ${seat} has no takes or discards list`);
  }
  const parsedTakes = takes.map(
    (item): Take =>
      typeof item === "string"
        ? parseCall(item, seat)
        : { kind: "draw", tile: tileFromTenhou(item) },
  );
  const parsedDiscards = discards.map((item, index) =>
    parseDiscard(item, seat, index, parsedTakes),
  );
  return { takes: parsedTakes, discards: parsedDiscards };
}
