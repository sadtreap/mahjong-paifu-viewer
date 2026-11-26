/**
 * Geometry of the 3D table. The CSS in TableStage.module.css is the single source of truth for
 * rendering (no layout reads, no ResizeObserver); this module mirrors its numbers for tests, for
 * the discard flight offsets and for anything else that needs them in TypeScript.
 * geometry.test.ts parses the CSS and checks that both agree.
 *
 * Plane coordinates are in units u = S / 20 of the 20-unit felt square, seen from the point of
 * view: X grows to the right, Y grows toward the viewer, and Y = 20 is the near edge.
 */
import type { PlayerCount, Seat, Wind } from "../../core/model";
import { activeSeats, seatWind } from "../../core/players";
import type { DiscardView, MeldView, SeatView } from "../../replay/types";
import { fitScale, handRowWidth, SIDES, seatOnSide, sideOf } from "../layout";
import type { PlateAid, PlateInfo, Side } from "../viewer/types";

/** A camera preset: the plane's tilt, its perspective (k · S) and the frame's reserves. */
export interface Preset {
  /** Tilt of the plane, in degrees. */
  tilt: number;
  sin: number;
  cos: number;
  /** Perspective distance as a multiple of S. */
  k: number;
  /** Share of S below the plane's near edge (the own hand stands there). */
  below: number;
  /**
   * Depth of the frame's top line when standing walls are drawn, as a multiple of the felt's depth
   * (1 = the far edge). It holds the far lids of the standing walls, so they never leave the frame.
   */
  ztopWalls: number;
}

export const PRESETS: Record<"landscape" | "portrait" | "flat", Preset> = {
  landscape: { tilt: 34, sin: 0.559193, cos: 0.829038, k: 1.15, below: 0.085, ztopWalls: 1.105 },
  portrait: { tilt: 26, sin: 0.438371, cos: 0.898794, k: 2.1, below: 0.085, ztopWalls: 1.055 },
  flat: { tilt: 0, sin: 0, cos: 1, k: 1.15, below: 0.085, ztopWalls: 1 },
};

/**
 * Margin in px between the stage's top edge and the far lids of the standing walls (amendment 2):
 * the frame adds `max(0px, WALL_MARGIN_PX - gutter)` above the plane when walls are drawn.
 */
export const WALL_MARGIN_PX = 8;

/**
 * Seat plate anchors (X, Y) in plane units, per side: the centres of the four corner squares of
 * free felt between the ponds, the console and the hand rows. Each square is bounded by two hand
 * rows (a kakan stack reaches 2.61 units in from the edge where the melds lie), two ponds of up to
 * four rows and, near the viewer, the own hand rising above the near edge.
 */
export const PLATE_ANCHORS: Record<Side, readonly [number, number]> = {
  bottom: [4.8, 16.2],
  right: [15.5, 15.9],
  top: [15.2, 4.6],
  left: [4.5, 4.85],
};

/**
 * Widest a plate may be, in plane units at its anchor's depth: the free square's width less a
 * margin, so no plate covers a tile (SeatPlates.module.css multiplies it by the projected scale).
 */
export const PLATE_MAX_WIDTH: Record<Side, number> = {
  bottom: 4.3,
  right: 5.0,
  top: 4.3,
  left: 5.0,
};

/** Call captions sit on the console's centre line (the console spans 7..13 on both axes). */
export const CAPTION_X = 10;

/**
 * The console's two strips without text along its centre line, in plane Y (bottom seat's view):
 * between the far seat's score (7.25..7.80 on its edge) and the round name (from 9.23), and between
 * the wall count (to 10.75) and the near seat's score (from 12.20). Measured on the flat table;
 * every console length is a multiple of u, so they hold at every size.
 */
export const CONSOLE_FREE_STRIPS: readonly (readonly [number, number])[] = [
  [7.8, 9.23],
  [10.75, 12.2],
];

/**
 * Call caption slots (plane Y): the middles of the free strips, so a caption (on the console, the
 * one stretch of felt that never holds a tile) never prints over the console's own text.
 */
export const CAPTION_SLOTS: readonly number[] = CONSOLE_FREE_STRIPS.map(([a, b]) => (a + b) / 2);

/** The slot each caller's caption takes first: the far and left callers the upper one. */
const CAPTION_PREFERRED: Record<Side, number> = { top: 0, left: 0, right: 1, bottom: 1 };

/**
 * Plane Y of each of a step's captions (each slides in from its caller's side): the caller's slot,
 * or the other one when an earlier caption of the step (a double ron) holds it. A third caption,
 * with no slot left, takes the console's centre.
 */
export function captionSlots(sides: readonly Side[]): number[] {
  const taken = new Set<number>();
  return sides.map((side) => {
    const first = CAPTION_PREFERRED[side];
    const slot = [first, 1 - first].find((index) => !taken.has(index));
    if (slot === undefined) {
      return 10;
    }
    taken.add(slot);
    return CAPTION_SLOTS[slot] ?? 10;
  });
}

/** The first-use coach mark: the free felt strip between the own pond and the own hand. */
export const COACH_ANCHOR: readonly [number, number] = [10, 18.25];

/**
 * Projects a plane point to the frame: `leftFraction` of S from the frame's left edge (0.5 is the
 * centre line), `bottomOfS` = distance from the frame's bottom as a share of S, and the
 * foreshortening `scale` at that depth. The CSS anchor rule in §2.2 uses the same formula.
 */
export function project(
  x: number,
  y: number,
  p: Preset,
): { leftFraction: number; bottomOfS: number; scale: number } {
  const z = (20 - y) / 20;
  const scale = p.k / (p.k + z * p.sin);
  return {
    leftFraction: 0.5 + ((x - 10) / 20) * scale,
    bottomOfS: p.below + z * p.cos * scale,
    scale,
  };
}

/** Frame height as a multiple of S (without the pixel margin above the walls). */
export function frameHeightFactor(p: Preset, walls: boolean): number {
  const z = walls ? p.ztopWalls : 1;
  const st = p.k / (p.k + z * p.sin);
  return p.cos * z * st + p.below;
}

/** Floors a length to an even pixel count, like `round(down, …, 2px)` in the CSS. */
export function snapS(s: number): number {
  return Math.max(0, Math.floor(s / 2) * 2);
}

/** Eye height above the felt and its distance beyond the near edge, in plane units. */
export function eye(p: Preset): { kc: number; ke: number } {
  return { kc: 20 * p.k * p.cos, ke: 20 * p.k * p.sin };
}

/** Wall tiles: height 4/3 and thickness 0.7 of the tile width; the run starts 0.4 from the corner. */
export const WALL_TILE_HEIGHT = 4 / 3;
export const WALL_TILE_DEPTH = 0.7;
/** Distance of a wall's outer side from the table edge, and of its first tile from the corner. */
export const WALL_EDGE_GAP = 0.45;
export const WALL_START = 0.4;

/** The sides an opponent can sit on. */
export type OppSide = Exclude<Side, "bottom">;

/**
 * Where an opponent's hand row starts, in its seat layer's units along the seat's edge (keep in
 * sync with `--row0` in layers.module.css). The rows form a pinwheel: each starts in the corner on
 * its owner's left and holds that corner. The right row starts a tile later: the near-right corner
 * belongs to the own hand, whose melds (a kakan stack, 2.6 units tall at full size) rise above the
 * plane's near edge there.
 */
export const OPP_ROW_START: Readonly<Record<OppSide, number>> = { right: 1.4, top: 0.4, left: 0.4 };

/**
 * Where every opponent's hand row ends (keep in sync with `.opp` in SeatZone.module.css): short of
 * the next seat's row, which lies 0.45 to 1.94 units deep along the next edge (a tile 4/3 long plus
 * its drawn thickness). A row ending at 18.4 put its last meld under the next seat's first tiles.
 */
export const OPP_ROW_END = 17.9;

/** Depth of a hand row from its edge: the edge gap, a lying tile's length and its thickness. */
export const HAND_ROW_DEPTH = WALL_EDGE_GAP + 4 / 3 + 0.16;

/** Length of an opponent's hand row, in units. */
export function oppRowUnits(side: OppSide): number {
  return OPP_ROW_END - OPP_ROW_START[side];
}

/**
 * How far a standing wall's last face leans along its row past the wall's end, on the felt (in
 * units): the lid of a tile at x is drawn at ex + t (x - ex). The right wall leans toward its
 * row's end (the eye stands beyond the near edge), the far wall leans outward from the centre
 * line, and the left wall leans back toward its start. `xEnd` is the wall's end in its seat
 * layer's units, `hs` the seat's tile scale. Landscape leans the most, so it is the default.
 */
export function wallLean(side: OppSide, xEnd: number, hs: number, p: Preset = PRESETS.landscape) {
  const { kc, ke } = eye(p);
  const t = kc / (kc - WALL_TILE_HEIGHT * hs);
  if (side === "right") {
    return (t - 1) * (xEnd + ke);
  }
  // The far wall runs leftward in plane coordinates: its end is at X = 20 - xEnd, the eye at X = 10.
  return side === "top" ? Math.max(0, (t - 1) * (xEnd - 10)) : 0;
}

/** The free felt left after the lean, so the next lying tile shows whole (about 0.3% covered). */
const LEAN_TOLERANCE = 0.15;
/** Margins the next lying tile brings (KitaTiles and HandRow CSS), in tile widths. */
const KITA_MARGIN = 0.4;
const MELDS_MARGIN = 0.25;

export interface OppRowLayout {
  /** First unit of the row along the seat's edge (OPP_ROW_START). */
  start: number;
  /** Tile scale: the row fitted into its length (never enlarged). */
  hs: number;
  /**
   * Felt kept free after a standing wall, in units, so the wall's lean (wallLean) never covers the
   * kita or meld tiles after it. 0 without a wall.
   */
  gap: number;
}

/**
 * Lays out an opponent's hand row: its start, tile scale and the gap after a standing wall. The
 * gap is sized for full-size tiles (the lean only shrinks with the scale), then the row is fitted.
 */
export function oppRowLayout(
  view: Pick<SeatView, "hand" | "drawn" | "melds" | "kita">,
  owner: Seat,
  side: OppSide,
  walled: boolean,
): OppRowLayout {
  const start = OPP_ROW_START[side];
  const length = oppRowUnits(side);
  const tiles = handRowWidth(view, owner);
  let gap = 0;
  if (walled) {
    const follow = view.kita.length > 0 ? KITA_MARGIN : view.melds.length > 0 ? MELDS_MARGIN : 0;
    const lean = wallLean(side, start + wallLength(view), 1);
    gap = Math.max(0, lean - LEAN_TOLERANCE - follow);
  }
  return { start, hs: fitScale(tiles, Math.max(1, length - gap)), gap };
}

/**
 * Depth (as in `ztopWalls`) of the farthest point of any standing wall: the far corner of the left
 * wall's lid, at full tile size. The frame must reserve at least this much.
 */
export function wallLidDepth(p: Preset): number {
  const { kc, ke } = eye(p);
  const t = kc / (kc - WALL_TILE_HEIGHT);
  // The lid of a tile is its footprint scaled by t about the eye's foot (20 + ke beyond Y = 0).
  const farY = Math.min(WALL_START, WALL_EDGE_GAP);
  const projectedY = 20 + ke - t * (20 + ke - farY);
  return (20 - projectedY) / 20;
}

/** The side of the empty chair in a three-player game (seat 3 moves with the point of view). */
export function emptySide(playerCount: PlayerCount, pov: Seat): Side | null {
  return playerCount === 3 ? sideOf(3, pov) : null;
}

/** Gap before a drawn tile, in tile widths (matches HandRow.module.css). */
const DRAWN_GAP = 0.4;

/**
 * `--xc` of a standing wall's face: the tile centre's x in its wrapper's units. Face `i` counts from
 * the start of the run; with `drawn`, face `n` is the drawn tile after a 0.4-tile gap. Side walls
 * run from x = 0.4 of their seat layer; the far wall (in the unrotated `.wtop` layer) runs leftward
 * from x = 19.6. `hs` is the seat's tile scale.
 */
export function wallFaceX(i: number, n: number, drawn: boolean, side: OppSide, hs = 1): number {
  const offset = (i + 0.5 + (drawn && i >= n ? DRAWN_GAP : 0)) * hs;
  const start = OPP_ROW_START[side];
  return side === "top" ? 20 - start - offset : start + offset;
}

/** Length of a standing wall in tile widths: the hand, plus the gap and the drawn tile. */
export function wallLength(view: Pick<SeatView, "hand" | "drawn">): number {
  return view.hand.length + (view.drawn === null ? 0 : 1 + DRAWN_GAP);
}

function meldEqual(a: MeldView, b: MeldView): boolean {
  return (
    a.type === b.type &&
    a.from === b.from &&
    a.calledTile === b.calledTile &&
    a.addedTile === b.addedTile &&
    a.tiles.length === b.tiles.length &&
    a.tiles.every((tile, i) => tile === b.tiles[i])
  );
}

function discardEqual(a: DiscardView, b: DiscardView): boolean {
  return (
    a.tile === b.tile &&
    a.tsumogiri === b.tsumogiri &&
    a.riichi === b.riichi &&
    a.called === b.called
  );
}

function listEqual<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!eq(a[i] as T, b[i] as T)) {
      return false;
    }
  }
  return true;
}

const same = <T>(x: T, y: T) => x === y;

/** Discards equal element by element (replay snapshots copy them, so identity is not enough). */
export function discardsEqual(a: readonly DiscardView[], b: readonly DiscardView[]): boolean {
  return listEqual(a, b, discardEqual);
}

/**
 * Whether two snapshots of a seat draw the same: hand, melds and discards element by element, the
 * drawn tile, the kita count, riichi and score. Used to memoise the seat zones per step.
 */
export function seatViewEqual(a: SeatView, b: SeatView): boolean {
  return (
    a === b ||
    (a.drawn === b.drawn &&
      a.riichi === b.riichi &&
      a.score === b.score &&
      a.kita.length === b.kita.length &&
      listEqual(a.hand, b.hand, same) &&
      listEqual(a.melds, b.melds, meldEqual) &&
      discardsEqual(a.discards, b.discards))
  );
}

/** Input of `platesFor`: what the integrator already has per step. */
export interface PlatesInput {
  playerCount: PlayerCount;
  dealer: Seat;
  seats: readonly SeatView[];
  names: readonly string[];
  pov: Seat;
  /** The plate aid of a seat (from analysis/aids.ts), or null; called for playing seats only. */
  aid(seat: Seat): PlateAid | null;
}

/** Plates for the playing seats, in side order from the point of view (no plate for the empty chair). */
export function platesFor(input: PlatesInput): PlateInfo[] {
  const playing = new Set(activeSeats(input.playerCount));
  const plates: PlateInfo[] = [];
  for (const side of SIDES) {
    const seat = seatOnSide(side, input.pov);
    if (!playing.has(seat)) {
      continue;
    }
    const view = input.seats[seat];
    const wind: Wind = seatWind(seat, input.dealer, input.playerCount);
    plates.push({
      seat,
      side,
      name: input.names[seat] ?? "",
      wind,
      dealer: wind === 0,
      score: view?.score ?? 0,
      riichi: view?.riichi ?? false,
      aid: input.aid(seat),
      kita: view?.kita.length ?? 0,
    });
  }
  return plates;
}
