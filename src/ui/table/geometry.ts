/**
 * Geometry of the table, and the only place its numbers live. The table is a square seen from
 * straight above, measured in tile widths (a tile is 1 wide and 4/3 long). The stage writes these
 * numbers as inline custom properties (stageVars) and the stylesheets only read var(), so the
 * TypeScript that needs them (the tile scales, the captions) and the CSS cannot disagree.
 *
 * Every seat is laid out as the bottom seat in a layer of its own, which is then turned into
 * place: x grows to the right, y grows toward that seat's edge of the table.
 */
import type { CSSProperties } from "react";
import type { PlayerCount, Seat } from "../../core/model";
import type { DiscardView, SeatView } from "../../replay/types";
import { DISCARDS_PER_ROW, DRAWN_GAP, fitScale, handRowWidth, POND_ROWS, sideOf } from "../layout";
import type { Side } from "../viewer/types";

/** A tile's length, and a sideways tile's width, in tile widths (tiles are 3:4). */
const TILE_LENGTH = 4 / 3;

/** The side of the table square, in tile widths. */
export const TABLE_UNITS = 18.4;

/** The centre console: a square as wide as a pond row, in the middle of the table. */
export const CONSOLE_SIZE = DISCARDS_PER_ROW;

/** The gap between the console and each pond, where a riichi stick lies. */
export const STICK_GAP = 0.35;

/**
 * A hand row, in its seat layer's units: it starts past the row of the seat on its left (which
 * lies along that edge), ends near the corner on its right, where the calls go, and keeps `edge`
 * from its own edge of the table.
 */
export const HAND = { start: 1.75, end: TABLE_UNITS - 0.5, edge: 0.25 } as const;

/**
 * A pond, in its seat layer's units: where its first tile starts and where its rows have to end.
 * The first rows hold six tiles under the console; the last one keeps growing to the right, and a
 * pond whose last row would pass `xEnd` (the next seat's hand row lies just beyond) shrinks its
 * own tiles instead.
 */
export const POND = {
  x: (TABLE_UNITS - CONSOLE_SIZE) / 2,
  y: (TABLE_UNITS + CONSOLE_SIZE) / 2 + STICK_GAP,
  xEnd: TABLE_UNITS - HAND.edge - TILE_LENGTH - 0.3,
} as const;

/** The row a discard lies in: the last row takes every discard after the first rows. */
export function pondRow(index: number): number {
  return Math.min(POND_ROWS - 1, Math.floor(index / DISCARDS_PER_ROW));
}

type Lying = Pick<DiscardView, "riichi">;

const lyingWidth = (discard: Lying | undefined) => (discard?.riichi ? TILE_LENGTH : 1);

/** Width of each row of a pond, in tile widths. */
function pondRowWidths(discards: readonly Lying[]): number[] {
  const widths = Array<number>(POND_ROWS).fill(0);
  discards.forEach((discard, index) => {
    widths[pondRow(index)] = (widths[pondRow(index)] ?? 0) + lyingWidth(discard);
  });
  return widths;
}

/**
 * Scale of a pond's tiles: 1 while its last row fits before `POND.xEnd`, less when that row has
 * grown too long (the other rows hold six tiles and always fit).
 */
export function pondScale(discards: readonly Lying[]): number {
  const last = pondRowWidths(discards)[POND_ROWS - 1] ?? 0;
  return fitScale(last, POND.xEnd - POND.x);
}

/**
 * Scale of a hand row's tiles: 1 while the row fits its length, less after many calls. The drawn
 * tile's place counts whether or not a tile is in it, so the tiles change size only on a call,
 * never on a draw or a discard.
 */
export function handScale(
  view: Pick<SeatView, "hand" | "drawn" | "melds" | "kita">,
  owner: Seat,
): number {
  const width = handRowWidth(view, owner) + (view.drawn === null ? 1 + DRAWN_GAP : 0);
  return fitScale(width, HAND.end - HAND.start);
}

/** A point of a seat's own layer (laid out as the bottom seat) in the table's coordinates. */
export function seatToTable(side: Side, x: number, y: number): [x: number, y: number] {
  switch (side) {
    case "bottom":
      return [x, y];
    case "right":
      return [y, TABLE_UNITS - x];
    case "top":
      return [TABLE_UNITS - x, TABLE_UNITS - y];
    case "left":
      return [TABLE_UNITS - y, x];
  }
}

/** Where a piece of upright DOM sits over the table: a point of the square, in shares of its side. */
export interface Anchor {
  /** From the table's left edge. */
  x: number;
  /** From the table's top edge. */
  y: number;
}

/** A call caption sits on the middle of its caller's pond (three rows of six). */
export function captionAnchor(side: Side): Anchor {
  const [x, y] = seatToTable(
    side,
    POND.x + DISCARDS_PER_ROW / 2,
    POND.y + (POND_ROWS / 2) * TILE_LENGTH,
  );
  return { x: x / TABLE_UNITS, y: y / TABLE_UNITS };
}

/** The side of the empty chair in a three-player game (seat 3 moves with the point of view). */
export function emptySide(playerCount: PlayerCount, pov: Seat): Side | null {
  return playerCount === 3 ? sideOf(3, pov) : null;
}

const number = (value: number) => String(Number(value.toFixed(6)));

/** The custom properties the table's stylesheets read, for the stage root. */
export function stageVars(): CSSProperties {
  const vars: Record<`--${string}`, string> = {
    "--units": number(TABLE_UNITS),
    "--console-size": number(CONSOLE_SIZE),
    "--stick-gap": number(STICK_GAP),
    "--pond-x": number(POND.x),
    "--pond-y": number(POND.y),
    "--hand-start": number(HAND.start),
    "--hand-end": number(HAND.end),
    "--hand-edge": number(HAND.edge),
  };
  return vars as CSSProperties;
}
