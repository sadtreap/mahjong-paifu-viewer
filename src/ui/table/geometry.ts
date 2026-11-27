/**
 * Geometry of the table, and the only place its numbers live. The stage writes them as inline
 * custom properties (stageVars) and the stylesheets only read var(), so the TypeScript that needs
 * them (the discard flight, the seat tags, the captions) and the CSS cannot disagree.
 *
 * Plane coordinates are in units u = S / 20 of the 20-unit felt square, seen from the point of
 * view: X grows to the right, Y grows toward the viewer, and Y = 20 is the near edge. Every seat is
 * laid out as the bottom seat in a layer of its own, which is then turned into place.
 */
import type { CSSProperties } from "react";
import type { PlayerCount, Seat } from "../../core/model";
import type { DiscardView, SeatView } from "../../replay/types";
import { DISCARDS_PER_ROW, DRAWN_GAP, fitScale, handRowWidth, POND_ROWS, sideOf } from "../layout";
import type { Arrangement, Side, View } from "../viewer/types";

/** A camera: the plane's tilt, its perspective (k · S) and how the frame sits in the stage. */
export interface Camera {
  /** Tilt of the plane, in degrees. */
  tilt: number;
  sin: number;
  cos: number;
  /** Perspective distance as a multiple of S. */
  k: number;
  /** Share of S below the plane's near edge (the own hand stands there). */
  below: number;
  /**
   * Depth of the frame's top line as a multiple of the felt's depth (1 = the far edge). The room
   * past the far edge holds the far lids of the standing walls. It is reserved whether or not the
   * walls stand, so the table keeps its size when hands are hidden.
   */
  ztop: number;
  /** Pixels kept free beside the frame, and above and below it. */
  gutterX: number;
  gutterY: number;
  /** Where spare stage height goes: 0.5 centres the frame, 1 puts it at the stage's bottom. */
  align: number;
  /**
   * Where `align` is above 0.5, how much spare height (in pixels) all goes where it says. Spare
   * height beyond that is shared evenly above and below the frame, so on a tall stage the frame
   * moves toward the middle, with the apron's felt under it.
   */
  keep: number;
  /**
   * How far the table reaches on each side of its centre line, as a share of S: 0.5 keeps the
   * felt's edges on the stage; less lets the stage cut off the rails and the felt beside the side
   * players' rows, whose outer edges stay on it.
   */
  spread: number;
  /** The share of S the own hand's row may take (its tiles are at most OWN_HAND.tile units). */
  ownFit: number;
}

/** A stage's size in pixels. */
export interface StageBox {
  width: number;
  height: number;
}

/** Where a frame sits in the stage: its gutters, and where spare height goes. */
type Placement = Pick<Camera, "gutterX" | "gutterY" | "align" | "keep">;

/** A camera looking at the table at `tilt` degrees, with room for the standing walls' lids. */
function camera(
  tilt: number,
  rest: Omit<Camera, "tilt" | "sin" | "cos" | "ztop" | "spread" | "ownFit">,
): Camera {
  const radians = (tilt * Math.PI) / 180;
  const c: Camera = {
    tilt,
    sin: Math.sin(radians),
    cos: Math.cos(radians),
    ztop: 1,
    spread: 0.5,
    ownFit: OWN_HAND.fit,
    ...rest,
  };
  return tilt === 0 ? c : { ...c, ztop: Math.ceil(wallLidDepth(c) * 200) / 200 };
}

/**
 * The camera with the stage cutting off what lies beyond the side players' rows: the rows' near
 * ends are the table's widest tiles (at their outer edges, or a standing wall's lids, which lean
 * past them), and the own hand may be as wide as they reach.
 */
function cropped(c: Camera): Camera {
  const out = Math.max(20 - WALL_EDGE_GAP, c.tilt === 0 ? 0 : 20 + lidOverhang(c));
  const reach = Math.max(
    project(out, 20 - OPP_ROW_START.right, c).left - 0.5,
    0.5 - project(20 - out, OPP_ROW_END, c).left,
  );
  return { ...c, spread: reach, ownFit: 2 * reach };
}

/** The centre console: a square on the plane, from 7.5 to 12.5 on both axes. */
export const CONSOLE = { from: 7.5, size: 5 } as const;

/**
 * A pond, in its seat layer's units: where its first tile starts, its tile width and where its
 * rows have to end. The first rows hold six tiles; the last one keeps growing to the right, and a
 * pond whose last row would pass `xEnd` (the next seat's hand row lies just beyond) shrinks its
 * own tiles instead.
 */
export const POND = { x: 7.5, y: 12.75, tile: 1.33, xEnd: 18 } as const;

/** A tile's length, and a sideways tile's width, in tile widths (tiles are 3:4). */
const TILE_LENGTH = 4 / 3;
/** A lying tile's drawn thickness, in tile widths. */
const TILE_THICKNESS = 0.16;

/**
 * The rails, in units: how wide they are beside the felt and beyond its far edge, and how high.
 * From the felt outward a rail shows its inner face (the lip, as wide as the eye sees it, see
 * railLip), a lit edge `edge` units wide, and its top, lit toward the felt and darkening until
 * `top` units past the lip.
 */
export const RAIL = { side: 1.7, far: 2.4, height: 0.5, edge: 0.09, top: 0.55 } as const;

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
  return fitScale(last, (POND.xEnd - POND.x) / POND.tile);
}

/** Where each row of a pond ends, in its seat layer's x. */
export function pondRowEnds(discards: readonly Lying[]): number[] {
  const tile = POND.tile * pondScale(discards);
  return pondRowWidths(discards).map((width) => POND.x + width * tile);
}

/**
 * A pond slot in its seat layer's units: its centre and the pond's tile width. A sideways (riichi)
 * tile is a third of a tile wider, so the tiles after it in its row lie further right.
 */
export function pondSlot(
  index: number,
  discards: readonly Lying[] = [],
): { x: number; y: number; tile: number } {
  const tile = POND.tile * pondScale(discards);
  const row = pondRow(index);
  let x = POND.x;
  for (let i = row * DISCARDS_PER_ROW; i < index; i++) {
    x += lyingWidth(discards[i]) * tile;
  }
  return {
    x: x + (lyingWidth(discards[index]) * tile) / 2,
    y: POND.y + (row + 0.5) * TILE_LENGTH * tile,
    tile,
  };
}

/**
 * Where a full pond's last row ends, with its drawn thickness and its shadow. Nothing on the plane
 * lies nearer the viewer than this line, so the felt from here to the own hand is the dock band.
 */
export const POND_FOOT =
  POND.y + POND_ROWS * TILE_LENGTH * POND.tile + TILE_THICKNESS * POND.tile + 0.05;

/**
 * The own hand, flat under the plane at the frame's bottom: its tile width in units (and the share
 * of S the whole row may take, which makes the tiles smaller after calls), and how far a standing
 * tile's lid shows above its face.
 */
export const OWN_HAND = { tile: 1.3, fit: 0.96, lid: 0.15 } as const;

/** Top of the own hand above the frame's bottom, in units. */
export const OWN_HAND_TOP = OWN_HAND.tile * (TILE_LENGTH + OWN_HAND.lid);

/** Free pixels above and below the bar in the dock band. */
export const DOCK_GAP = 4;

/** The sides an opponent can sit on. */
export type OppSide = Exclude<Side, "bottom">;

/** Wall tiles: thickness 0.7 of the tile width; the run starts 0.4 from the corner. */
export const WALL_TILE_DEPTH = 0.7;
/** Distance of a hand row (and of a standing wall's outer side) from its table edge. */
export const WALL_EDGE_GAP = 0.45;
export const WALL_START = 0.4;

/**
 * Where an opponent's hand row starts, in its seat layer's units along the seat's edge. The rows
 * form a pinwheel: each starts in the corner on its owner's left and holds that corner. The right
 * row starts later: its first tile has to end before the dock band, which crosses the whole table
 * (see POND_FOOT) and may hold a bar almost as wide as the table.
 */
export const OPP_ROW_START: Readonly<Record<OppSide, number>> = {
  right: 1.85,
  top: 0.4,
  left: 0.4,
};

/**
 * Where every opponent's hand row ends: short of the next seat's row, which lies 0.45 to 1.94 units
 * deep along the next edge (a tile 4/3 long plus its drawn thickness).
 */
export const OPP_ROW_END = 17.9;

/** Depth of a hand row from its edge: the edge gap, a lying tile's length and its thickness. */
export const HAND_ROW_DEPTH = WALL_EDGE_GAP + TILE_LENGTH + TILE_THICKNESS;

/** Length of an opponent's hand row, in units. */
export function oppRowUnits(side: OppSide): number {
  return OPP_ROW_END - OPP_ROW_START[side];
}

/** A point of a seat's own layer (laid out as the bottom seat) in plane coordinates. */
export function seatToPlane(side: Side, x: number, y: number): [x: number, y: number] {
  switch (side) {
    case "bottom":
      return [x, y];
    case "right":
      return [y, 20 - x];
    case "top":
      return [20 - x, 20 - y];
    case "left":
      return [20 - y, x];
  }
}

/** A plane point on the screen, in shares of S. */
export interface Projected {
  /** From the frame's left edge (0.5 is the centre line). */
  left: number;
  /** Above the plane's near edge. */
  up: number;
  /** The foreshortening at that depth (1 at the near edge). */
  scale: number;
}

export function project(x: number, y: number, c: Camera): Projected {
  const z = (20 - y) / 20;
  const scale = c.k / (c.k + z * c.sin);
  return { left: 0.5 + ((x - 10) / 20) * scale, up: z * c.cos * scale, scale };
}

/**
 * The plane depth Y that shows `up` (a share of S) above the plane's near edge; the inverse of
 * project. Negative heights lie beyond the near edge (Y over 20), where the own hand stands.
 */
export function depthAt(up: number, c: Camera): number {
  const z = (up * c.k) / (c.k * c.cos - up * c.sin);
  return 20 - 20 * z;
}

/** Frame height as a multiple of S (without the room a tall dock adds, see `tableSize`). */
export function frameHeightFactor(c: Camera): number {
  const top = c.k / (c.k + c.ztop * c.sin);
  return c.cos * c.ztop * top + c.below;
}

/** Floors a length to an even pixel count, like `round(down, …, 2px)` in the CSS. */
export function snapS(s: number): number {
  return Math.max(0, Math.floor(s / 2) * 2);
}

/**
 * Height of the felt strip between a full pond and the own hand, in units: the dock band. A bar
 * taller than the strip pushes the own hand down, and the table gets smaller by that much.
 */
export function dockStrip(c: Camera): number {
  return (c.below + project(10, POND_FOOT, c).up) * 20 - OWN_HAND_TOP;
}

/**
 * The table's size S in a stage box, as the CSS computes it (.frame in TableStage.module.css): the
 * largest even width whose frame fits the box inside the gutters (where the camera's spread lets
 * the stage cut off the table's sides, only that much of it), with a band of at least
 * `dockHeight` (plus DOCK_GAP on both sides) between the pond and the own hand.
 */
export function tableSize(box: StageBox, c: Camera, dockHeight = 0): number {
  const height = box.height - 2 * c.gutterY;
  const hf = frameHeightFactor(c);
  return snapS(
    Math.min(
      (box.width - 2 * c.gutterX) / (2 * c.spread),
      height / hf,
      (height - dockHeight - 2 * DOCK_GAP) / (hf - dockStrip(c) / 20),
    ),
  );
}

/** Eye height above the felt and its distance beyond the near edge, in plane units. */
function eye(c: Camera): { kc: number; ke: number } {
  return { kc: 20 * c.k * c.cos, ke: 20 * c.k * c.sin };
}

/**
 * How wide the rails' inner faces show on the felt, in units: a face RAIL.height high, seen from
 * the eye over the centre line (the side rails) and beyond the near edge (the far rail).
 */
export function railLip(c: Camera): { side: number; far: number } {
  const { kc, ke } = eye(c);
  const t = kc / (kc - RAIL.height) - 1;
  return { side: 10 * t, far: (20 + ke) * t };
}

const TILTED = { k: 1.15, below: 0.085, align: 0.5, keep: 0 };
const STACK: Placement & Pick<Camera, "k" | "below"> = {
  k: 2.6,
  below: 0.07,
  gutterX: 4,
  gutterY: 0,
  align: 1,
  keep: 64,
};

/** The tilts a stack camera chooses from (stackCamera), in whole degrees. */
export const STACK_TILT = { min: 12, max: 34, standard: 20 } as const;

const stackCameras = new Map<number, Camera>();

/** The stack camera at a whole-degree tilt (kept, so a tilt is always the same object). */
function stackAt(tilt: number): Camera {
  let c = stackCameras.get(tilt);
  if (c === undefined) {
    c = cropped(camera(tilt, STACK));
    stackCameras.set(tilt, c);
  }
  return c;
}

/**
 * The 3D camera of each arrangement. "wide" and "short" look at the table from the same place;
 * "stack" looks from further away and more from above, because a narrow screen has the height for
 * a deeper frame. Its frame touches the stage's bottom edge (the hand sits against the controls)
 * and may lose the rails at the sides. The "stack" camera here is the one for a stage whose size
 * is not known yet: stackCamera fits its tilt to the stage.
 */
export const CAMERAS: Readonly<Record<Arrangement, Camera>> = {
  wide: camera(34, { ...TILTED, gutterX: 12, gutterY: 12 }),
  short: camera(34, { ...TILTED, gutterX: 4, gutterY: 4 }),
  stack: stackAt(STACK_TILT.standard),
};

/** The far pond's nearest row, where its tiles are smallest: the plane depth of its middle. */
const FAR_POND_Y = 20 - POND.y - (TILE_LENGTH * POND.tile) / 2;

/**
 * The stack camera for a stage: tilted so that the far pond's tiles come out largest. A flatter
 * camera makes a deeper frame with larger far tiles; a steeper one a shallower frame, which makes
 * the whole table larger where the stage's height is what limits it. The best tilt is where the
 * frame fills the stage's width and height together; a tall stage stops at the flattest tilt and
 * leaves the rest of its height, a squat one at the steepest. Ties go to the flatter tilt.
 */
export function stackCamera(box: StageBox): Camera {
  let best = stackAt(STACK_TILT.min);
  let most = -1;
  for (let tilt = STACK_TILT.min; tilt <= STACK_TILT.max; tilt++) {
    const c = stackAt(tilt);
    const far = tableSize(box, c) * project(10, FAR_POND_Y, c).scale;
    if (far > most + 1e-6) {
      best = c;
      most = far;
    }
  }
  return best;
}

const flatCameras = new Map<Camera, Camera>();

/**
 * The camera in use: the arrangement's (in the stack arrangement, the one fitted to the stage's
 * box once it is known), or the same frame seen from straight above.
 */
export function cameraFor(arrangement: Arrangement, view: View, box?: StageBox | null): Camera {
  const tilted =
    arrangement === "stack" && box && box.width > 0 && box.height > 0
      ? stackCamera(box)
      : CAMERAS[arrangement];
  if (view === "3d") {
    return tilted;
  }
  const key = arrangement === "stack" ? CAMERAS.stack : tilted;
  let flat = flatCameras.get(key);
  if (flat === undefined) {
    const above = { ...key, tilt: 0, sin: 0, cos: 1, ztop: 1 };
    flat = arrangement === "stack" ? cropped(above) : above;
    flatCameras.set(key, flat);
  }
  return flat;
}

const number = (value: number) => String(Number(value.toFixed(6)));

/**
 * The custom properties the table's stylesheets read, for the stage root: the camera, the frame,
 * the rails and the places of the console, the ponds, the hand rows and the own hand.
 */
export function stageVars(c: Camera): CSSProperties {
  const { kc, ke } = eye(c);
  const lip = railLip(c);
  const vars: Record<`--${string}`, string> = {
    "--tilt": `${c.tilt}deg`,
    "--sin": number(c.sin),
    "--cos": number(c.cos),
    "--k": number(c.k),
    "--below": number(c.below),
    "--hf": number(frameHeightFactor(c)),
    "--kc": number(kc),
    "--ke": number(ke),
    "--gx": `${c.gutterX}px`,
    "--gy": `${c.gutterY}px`,
    "--align": number(c.align),
    "--keep": `${c.keep}px`,
    "--strip": number(dockStrip(c)),
    "--dock-gap": `${DOCK_GAP}px`,
    "--console-from": number(CONSOLE.from),
    "--console-size": number(CONSOLE.size),
    "--pond-x": number(POND.x),
    "--pond-y": number(POND.y),
    "--pond-tile": number(POND.tile),
    "--row-end": number(OPP_ROW_END),
    "--row-gap": number(WALL_EDGE_GAP),
    "--wall-depth": number(WALL_TILE_DEPTH),
    "--spread": number(c.spread),
    "--own-tile": number(OWN_HAND.tile),
    "--own-fit": number(c.ownFit),
    "--own-top": number(OWN_HAND_TOP),
    "--own-lid": number(OWN_HAND.lid),
    "--tile-thick": number(TILE_THICKNESS),
    "--rail-side-w": number(RAIL.side),
    "--rail-far-w": number(RAIL.far),
    "--rail-lip-w": number(lip.side),
    "--rail-far-lip-w": number(lip.far),
    "--rail-edge-w": number(RAIL.edge),
    "--rail-top-w": number(RAIL.top),
  };
  return vars as CSSProperties;
}

/**
 * For chrome that floats in the stage's top corners: custom properties from which a stylesheet can
 * tell how much of a corner is free of tiles. The hand rows reach `--corner-reach` of S from the
 * table's centre line there (the far row's first tile, the outermost, at its nearer corners), and
 * S is at most the stage's width less `--corner-gx`, and at most its height less `--corner-gy`
 * divided by `--corner-hf`; a dock band only makes the table smaller.
 */
export function cornerVars(c: Camera): CSSProperties {
  const reach = project(20 - OPP_ROW_START.top, HAND_ROW_DEPTH, c).left - 0.5;
  const vars: Record<`--${string}`, string> = {
    "--corner-reach": number(reach),
    "--corner-gx": `${2 * c.gutterX}px`,
    "--corner-gy": `${2 * c.gutterY}px`,
    "--corner-hf": number(frameHeightFactor(c)),
  };
  return vars as CSSProperties;
}

/** Where a piece of flat DOM sits over the plane: a point of the frame, in shares of S. */
export interface Anchor {
  /** From the frame's left edge. */
  x: number;
  /** Above the plane's near edge. */
  y: number;
}

/** A call caption sits on the middle of its caller's pond (three rows of six). */
export function captionAnchor(side: Side, c: Camera): Anchor {
  const [x, y] = seatToPlane(
    side,
    POND.x + (DISCARDS_PER_ROW / 2) * POND.tile,
    POND.y + (POND_ROWS / 2) * TILE_LENGTH * POND.tile,
  );
  const p = project(x, y, c);
  return { x: p.left, y: p.up };
}

/**
 * The strip of felt a seat tag lies in, in its seat layer's units: left of the seat's own pond,
 * between the pond of the seat on its left (whose rows run toward the tag, side by side) and the
 * seat's own hand row. The strip ends at `end`, beside its own pond's first tiles, with its foot on
 * the line `near` (a little short of the hand row), and reaches toward the seat's left over the
 * neighbour's rows as far as `reach` units. `clear` is kept free between the tag and the
 * neighbour's tiles; a row that leaves less than `minDepth` of felt is one the strip stops before,
 * `gap` short of it.
 */
export const TAG_STRIP = {
  end: 7.3,
  near: 20 - HAND_ROW_DEPTH - 0.1,
  reach: 5.2,
  clear: 0.3,
  minDepth: 1.3,
  gap: 0.2,
} as const;

/**
 * The felt a tag has, given the pond of the seat on its left: how far it may reach along its hand
 * row, and how deep the strip is under the rows it reaches over. The neighbour's first row lies
 * next to the tag's end and the others further out; a long last row, or the rows of a pond that
 * has shrunk its tiles, can run almost to the hand row, and the tag then ends before that row.
 */
export function tagStrip(neighbour: readonly Lying[] = []): { reach: number; depth: number } {
  const { end, near, clear, minDepth, gap } = TAG_STRIP;
  const rowHeight = TILE_LENGTH * POND.tile * pondScale(neighbour);
  const ends = pondRowEnds(neighbour);
  let reach: number = TAG_STRIP.reach;
  let far: number = POND.x;
  for (let row = 0; row < POND_ROWS; row++) {
    // The row's side toward the tag's end, in the tag's own layer.
    const inner = 20 - POND.y - row * rowHeight;
    if (end - reach >= inner) {
      break;
    }
    const rowEnd = ends[row] ?? POND.x;
    if (near - rowEnd - clear < minDepth) {
      reach = Math.max(0, end - inner - gap);
      break;
    }
    far = Math.max(far, rowEnd);
  }
  return { reach, depth: near - far - clear };
}

/**
 * An upright box of the frame, in shares of S: x from the frame's left edge, y above the plane's
 * near edge.
 */
export interface FrameBox {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** The corner of its box a tag on the felt sits in: beside its own pond, against its own row. */
export type TagCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Where a seat tag goes (SeatTags.module.css reads it). Tags always stand upright.
 *
 * "felt": in an upright box of free felt beside the seat's own pond and against its own hand row
 * (tagStrip), in the box's corner `corner`.
 *
 * "rim": a side player's tag beside the table, level with the middle of that player's row, from
 * the plane depth `bottom` up to `top`. It hangs off the rail's outer edge (`rail`, a share of S
 * from the frame's left edge); where the stage leaves too little room beyond the rail, it may
 * cover the rail as far as `felt`, the outermost point of that player's tiles (a standing wall's
 * lids lean over the felt's edge). It is at most `length` of S long, as long as a tag on the felt
 * beside that row may be.
 */
export type TagPlace =
  | (FrameBox & { kind: "felt"; corner: TagCorner })
  | {
      kind: "rim";
      side: "left" | "right";
      bottom: number;
      top: number;
      felt: number;
      rail: number;
      length: number;
    };

/** A rim tag's foot and the top of its box, as plane depths: beside the middle of a side row. */
const RIM = { foot: 10.5, top: 3 } as const;

const FELT_CORNER: Readonly<Record<Side, TagCorner>> = {
  bottom: "bottom-right",
  right: "top-right",
  top: "top-left",
  left: "bottom-left",
};

/**
 * The largest upright box inside a rectangle of the plane (given by two opposite corners), as the
 * camera shows it: lines of equal depth stay level, the others lean with the perspective.
 */
function uprightBox(c: Camera, [ax, ay]: [number, number], [bx, by]: [number, number]): FrameBox {
  const [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)];
  const [far, near] = [Math.min(ay, by), Math.max(ay, by)];
  return {
    left: Math.max(project(x0, far, c).left, project(x0, near, c).left),
    right: Math.min(project(x1, far, c).left, project(x1, near, c).left),
    bottom: project(x0, near, c).up,
    top: project(x0, far, c).up,
  };
}

/** How far a standing wall's lids lean past the felt's edge beside it, in units (none if flat). */
function lidOverhang(c: Camera): number {
  if (c.tilt === 0) {
    return 0;
  }
  const { kc } = eye(c);
  // A lid is the wall's footprint scaled about the eye's foot on the centre line.
  return (kc / (kc - TILE_LENGTH)) * (10 - WALL_EDGE_GAP) - 10;
}

/**
 * Where a seat's tag goes. `rim` puts the side players' tags beside the table (the arrangements
 * whose stage has room beside the table); otherwise every tag is on the felt, beside its own pond
 * and against its own hand row, or the right player's, while the felt is wider there, at the
 * start of its row. The viewed player's hand is not on the plane: with a dock (`docked`) its tag
 * stays above the dock band, without one it stands right on the hand. `neighbour` is the pond of
 * the seat on this seat's left, whose rows bound the felt.
 */
export function tagPlace(
  side: Side,
  c: Camera,
  docked: boolean,
  rim: boolean,
  neighbour: readonly Lying[] = [],
): TagPlace {
  if (rim && (side === "left" || side === "right")) {
    const out = side === "right" ? 1 : -1;
    const at = (x: number) => project(10 + out * x, RIM.foot, c).left;
    const foot = project(10, RIM.foot, c);
    return {
      kind: "rim",
      side,
      bottom: foot.up,
      top: project(10, RIM.top, c).up,
      felt: at(10 + lidOverhang(c)),
      rail: at(10 + RAIL.side),
      length: (TAG_STRIP.reach / 20) * foot.scale,
    };
  }
  const { reach, depth } = tagStrip(neighbour);
  const { end, near, clear } = TAG_STRIP;
  // Without a dock, the felt above the own hand is free: the viewed player's tag stands on it.
  const onHand = depthAt((OWN_HAND_TOP + 0.15) / 20 - c.below, c);
  const foot = side === "bottom" && !docked ? onHand : near;
  const box = uprightBox(
    c,
    seatToPlane(side, end - reach, near - depth),
    seatToPlane(side, end, foot),
  );
  if (side === "right" && !docked) {
    // The right player's row starts in the near right corner, under the viewed player's pond,
    // whose last row fills last: until it does, the felt there is wider than beside the pond. The
    // tag stays as near that row as on the strip, clear of the viewed player's tag.
    const rowHeight = TILE_LENGTH * POND.tile * pondScale(neighbour);
    const lastRow = pondRowEnds(neighbour)[POND_ROWS - 1] ?? POND.x;
    const corner = uprightBox(
      c,
      [
        Math.max(lastRow + clear, near - TAG_STRIP.reach),
        POND.y + (POND_ROWS - 1) * rowHeight + clear,
      ],
      [near, onHand],
    );
    if (corner.right - corner.left > box.right - box.left) {
      return { kind: "felt", corner: "bottom-right", ...corner };
    }
  }
  return { kind: "felt", corner: FELT_CORNER[side], ...box };
}

/**
 * How far a standing wall's last face leans along its row past the wall's end, on the felt (in
 * units): the lid of a tile at x is drawn at ex + t (x - ex). The right wall leans toward its
 * row's end (the eye stands beyond the near edge), the far wall leans outward from the centre
 * line, and the left wall leans back toward its start. `xEnd` is the wall's end in its seat
 * layer's units, `hs` the seat's tile scale. The wide camera leans the most, so it is the default.
 */
export function wallLean(side: OppSide, xEnd: number, hs: number, c: Camera = CAMERAS.wide) {
  const { kc, ke } = eye(c);
  const t = kc / (kc - TILE_LENGTH * hs);
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
 * Depth (as in `Camera.ztop`) of the farthest point of any standing wall: the far corner of the
 * left wall's lid, at full tile size. The frame must reserve at least this much.
 */
export function wallLidDepth(c: Camera): number {
  const { kc, ke } = eye(c);
  const t = kc / (kc - TILE_LENGTH);
  // The lid of a tile is its footprint scaled by t about the eye's foot (20 + ke beyond Y = 0).
  const farY = Math.min(WALL_START, WALL_EDGE_GAP);
  const projectedY = 20 + ke - t * (20 + ke - farY);
  return (20 - projectedY) / 20;
}

/** The side of the empty chair in a three-player game (seat 3 moves with the point of view). */
export function emptySide(playerCount: PlayerCount, pov: Seat): Side | null {
  return playerCount === 3 ? sideOf(3, pov) : null;
}

/**
 * `--xc` of a standing wall's face: the tile centre's x in its wrapper's units. Face `i` counts from
 * the start of the run; with `drawn`, face `n` is the drawn tile after a 0.4-tile gap. Side walls
 * run from their row's start; the far wall (in the unrotated layer) runs leftward from x = 19.6.
 * `hs` is the seat's tile scale.
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
