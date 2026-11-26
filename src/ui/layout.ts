import type { Seat, Wind } from "../core/model";
import { isRedFive, isSameKind, type KnownTile, sortTiles, type Tile } from "../core/tile";
import type { DiscardView, MeldView, SeatView } from "../replay/types";

/** Where a seat sits on screen, seen from the point-of-view seat. */
export type Side = "bottom" | "right" | "top" | "left";

/** Sides in turn order starting from the point of view: the next player sits on the right. */
export const SIDES: readonly Side[] = ["bottom", "right", "top", "left"];

/** Steps in turn order from `from` to `to` (0 = same seat, 1 = next player, 3 = previous). */
export function seatDistance(from: Seat, to: Seat): 0 | 1 | 2 | 3 {
  return ((to - from + 4) % 4) as 0 | 1 | 2 | 3;
}

export function sideOf(seat: Seat, pov: Seat): Side {
  return SIDES[seatDistance(pov, seat)] as Side;
}

/** The seat drawn on a side of the table. */
export function seatOnSide(side: Side, pov: Seat): Seat {
  return ((pov + SIDES.indexOf(side)) % 4) as Seat;
}

/** A seat's wind in a round: the dealer is East. */
export function seatWind(seat: Seat, dealer: Seat): Wind {
  return seatDistance(dealer, seat) as Wind;
}

export interface MeldSlot {
  tile: Tile;
  /** Drawn sideways: the tile taken from another player. */
  sideways: boolean;
  /** Drawn face down (the outer tiles of a closed kan). */
  faceDown: boolean;
  /** Kakan: the added tile, stacked on the sideways tile. */
  added?: Tile;
}

/**
 * Tiles of a meld from left to right as the owner sees them. The called tile lies sideways on the
 * side of the player it came from: leftmost from the previous player, second from the player
 * opposite, rightmost from the next player. A closed kan shows its outer tiles face down, keeping
 * red fives face up.
 */
export function meldSlots(meld: MeldView, owner: Seat): MeldSlot[] {
  if (meld.type === "ankan") {
    const reds = meld.tiles.filter((tile) => isRedFive(tile));
    const plain = meld.tiles.filter((tile) => !isRedFive(tile));
    const ordered = plain.length > 0 ? [plain[0] as Tile, ...reds, ...plain.slice(1)] : reds;
    return ordered.map((tile, index) => ({
      tile,
      sideways: false,
      faceDown: index === 0 || index === ordered.length - 1,
    }));
  }
  const slots: MeldSlot[] = meld.tiles.map((tile) => ({ tile, sideways: false, faceDown: false }));
  if (meld.calledTile === undefined) {
    return slots;
  }
  const called: MeldSlot = { tile: meld.calledTile, sideways: true, faceDown: false };
  if (meld.addedTile !== undefined) {
    called.added = meld.addedTile;
  }
  const distance = meld.from === undefined ? 3 : seatDistance(owner, meld.from);
  const index = distance === 1 ? slots.length : distance === 2 ? 1 : 0;
  slots.splice(index, 0, called);
  return slots;
}

export interface KeyedItem<T> {
  key: string;
  index: number;
  item: T;
}

/** Gives list items stable positional keys (tiles repeat, so a tile is not a key by itself). */
export function keyed<T>(items: readonly T[], prefix = ""): KeyedItem<T>[] {
  return items.map((item, index) => ({ key: `${prefix}${index}`, index, item }));
}

export const DISCARDS_PER_ROW = 6;

/** Splits a pond into rows of six, keeping each discard's index in the full list. */
export function discardRows(
  discards: readonly DiscardView[],
  perRow = DISCARDS_PER_ROW,
): KeyedItem<DiscardView>[][] {
  const rows: KeyedItem<DiscardView>[][] = [];
  keyed(discards, "d").forEach((entry, index) => {
    if (index % perRow === 0) {
      rows.push([]);
    }
    rows[rows.length - 1]?.push(entry);
  });
  return rows;
}

export const DORA_SLOTS = 5;

/** The dora indicator row: revealed indicators first, null for slots still face down. */
export function doraSlots(
  indicators: readonly KnownTile[],
  total = DORA_SLOTS,
): (KnownTile | null)[] {
  return Array.from(
    { length: Math.max(total, indicators.length) },
    (_, i) => indicators[i] ?? null,
  );
}

/** Width of a sideways tile, in upright tile widths (tiles are 3:4). */
const SIDEWAYS_WIDTH = 4 / 3;
/** Gap between the hand and the drawn tile, and between melds, in tile widths (matches the CSS). */
export const DRAWN_GAP = 0.4;
export const MELD_GAP = 0.25;

/**
 * Width of the kita group (one North tile with its margins, 0.4 before and 0.45 after), in tile
 * widths. Kita sits after the concealed and drawn tiles and before the melds.
 */
export const KITA_WIDTH = 1.85;

/**
 * Width of a seat's hand row (concealed tiles, drawn tile, kita and melds), in tile widths. `kita`
 * is optional so callers that predate three-player games keep compiling.
 */
export function handRowWidth(
  seat: Pick<SeatView, "hand" | "drawn" | "melds"> & { kita?: readonly Tile[] },
  owner: Seat,
): number {
  let width = seat.hand.length + (seat.drawn === null ? 0 : 1 + DRAWN_GAP);
  if ((seat.kita?.length ?? 0) > 0) {
    width += KITA_WIDTH;
  }
  for (const meld of seat.melds) {
    const slots = meldSlots(meld, owner);
    width += MELD_GAP;
    for (const slot of slots) {
      width += slot.sideways ? SIDEWAYS_WIDTH : 1;
    }
  }
  return width;
}

/**
 * Width of the point of view's own hand in tile widths (the flat row under the table): the same
 * parts as handRowWidth, with the drawn tile's slot always counted (the row keeps it empty between
 * turns, so the centred row and its tile size change only on calls, never on a draw or a discard).
 * The own hand's tile size is min(1.3 u, 0.96 S / ownRowUnits).
 */
export function ownRowUnits(view: SeatView, owner: Seat): number {
  return handRowWidth(view, owner) + (view.drawn === null ? 1 + DRAWN_GAP : 0);
}

/** Scale that fits a hand row into the available width (never enlarges). */
export function fitScale(width: number, available: number): number {
  return width <= available ? 1 : available / width;
}

/**
 * Splits a winning hand (which includes the winning tile) into the other tiles, sorted, and the
 * winning tile, so the winning tile can be drawn apart.
 */
export function splitWinningHand(
  hand: readonly Tile[],
  winningTile: Tile | undefined,
): { rest: Tile[]; winning: Tile | null } {
  if (winningTile === undefined) {
    return { rest: sortTiles(hand), winning: null };
  }
  let index = hand.indexOf(winningTile);
  if (index < 0) {
    index = hand.findIndex((tile) => isSameKind(tile, winningTile));
  }
  if (index < 0) {
    return { rest: sortTiles(hand), winning: winningTile };
  }
  const rest = [...hand];
  const [winning] = rest.splice(index, 1);
  return { rest: sortTiles(rest), winning: winning ?? winningTile };
}
