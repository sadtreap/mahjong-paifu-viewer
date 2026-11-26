import type { Round, Seat } from "../../core/model";
import type { BoardState, DiscardView, SeatView } from "../../replay/types";
import { DISCARDS_PER_ROW, fitScale, handRowWidth } from "../layout";
import type { AutoplaySpeed, MotionSpec, ViewerState } from "../viewer/types";
import { isSingleForwardStep, stepEvents } from "./captions";
import {
  type OppRowLayout,
  oppRowUnits,
  type Preset,
  WALL_EDGE_GAP,
  WALL_START,
  WALL_TILE_DEPTH,
} from "./geometry";

/** Pond geometry in seat-layer units (SeatZone.module.css): origin, tile width, row height. */
const POND_X = 7.1;
const POND_Y = 13.3;
const POND_TILE = 0.9;
const POND_ROW = POND_TILE * (4 / 3);

/**
 * Centre of a pond slot in its seat layer's units. With the pond's discards, sideways (riichi)
 * tiles earlier in the same row widen it by a third of a tile.
 */
export function pondSlotCenter(
  index: number,
  discards?: readonly Pick<DiscardView, "riichi">[],
): { x: number; y: number } {
  const row = Math.floor(index / DISCARDS_PER_ROW);
  let x = POND_X;
  for (let i = row * DISCARDS_PER_ROW; i < index; i++) {
    x += discards?.[i]?.riichi ? POND_ROW : POND_TILE;
  }
  const width = discards?.[index]?.riichi ? POND_ROW : POND_TILE;
  return { x: x + width / 2, y: POND_Y + POND_ROW * row + POND_ROW / 2 };
}

/** Gap before the drawn tile, in tile widths. */
const DRAWN_GAP = 0.4;

/**
 * Where the own hand's tile centres lie on the plane: the inverse projection of the line 2/3 of a
 * tile above the frame's bottom (the own hand is flat DOM there). Returns the plane depth Y (beyond
 * the near edge, about 20.98 in landscape), the scale there and the own tile width in units.
 */
export function ownHandLine(p: Preset, ownUnits: number): { y: number; scale: number; tw: number } {
  const tw = Math.min(1.3, (20 * 0.96) / Math.max(1, ownUnits));
  const q = ((2 / 3) * tw) / 20 - p.below;
  const z = (q * p.k) / (p.k * p.cos - q * p.sin);
  const scale = p.k / (p.k + z * p.sin);
  return { y: 20 - 20 * z, scale, tw };
}

/**
 * Start offset of a discard flight, from the pond slot to the tile's source, in the discarder's
 * seat-layer units (the flight layer turns with that seat): `fx`, `fy`, and the start scale `fs`.
 * Pure geometry, no layout reads. `view` is the discarder's seat after the discard; `ownUnits` is
 * ownRowUnits of the point of view's hand (used for the "hand" and "drawn" sources); `row` is the
 * opponent's row layout (geometry.ts oppRowLayout; by default a row from 0.4 with no wall gap).
 */
export function flightOffset(
  spec: NonNullable<MotionSpec["flight"]>,
  view: SeatView,
  p: Preset,
  ownUnits: number,
  row?: Pick<OppRowLayout, "start" | "hs">,
): { fx: number; fy: number; fs: number } {
  const target = pondSlotCenter(spec.index, view.discards);
  if (spec.source === "opponent") {
    // The end of the opponent's hand row, where a drawn tile stands, on its wall line.
    const hs = row?.hs ?? fitScale(handRowWidth(view, spec.seat), oppRowUnits("top"));
    const x = (row?.start ?? WALL_START) + (view.hand.length + DRAWN_GAP + 0.5) * hs;
    const y = 20 - WALL_EDGE_GAP - WALL_TILE_DEPTH * hs + 0.03;
    return { fx: x - target.x, fy: y - target.y, fs: hs / POND_TILE };
  }
  const { y, scale, tw } = ownHandLine(p, ownUnits);
  // Tile units from the own row's left edge: the drawn tile after the hand, else mid-hand.
  const n = view.hand.length;
  const along = spec.source === "drawn" ? n + DRAWN_GAP + 0.5 : n / 2;
  const screenX = (-ownUnits / 2 + along) * tw; // from the centre line, in units of the frame
  const x = 10 + screenX / scale;
  return { fx: x - target.x, fy: y - target.y, fs: tw / POND_TILE };
}

const NO_MOTION: MotionSpec = { flight: null, reveal: [] };

export interface MotionOptions {
  /** The motion setting (and not prefers-reduced-motion). */
  motion: boolean;
  revealedBefore: ReadonlySet<Seat>;
  revealedNow: ReadonlySet<Seat>;
  /** The point of view: its discards fly from the own hand, the others' from their walls. */
  pov?: Seat;
}

/**
 * The motion of a step: a discard flight (with the riichi turn) and the round-end reveal (seats
 * whose hidden hand turns face up on reaching the result). Only after a single forward step,
 * never at 4× autoplay, and nothing with `motion` off. `prev` is the state before `state`.
 */
export function motionFor(
  round: Round,
  prev: BoardState,
  state: BoardState,
  lastMove: ViewerState["lastMove"],
  speed: AutoplaySpeed,
  o: MotionOptions,
): MotionSpec {
  if (!o.motion || !isSingleForwardStep(lastMove, speed) || prev === state) {
    return NO_MOTION;
  }
  let flight: MotionSpec["flight"] = null;
  const main = stepEvents(round, state)[0];
  if (main?.type === "discard") {
    const index = state.seats[main.seat].discards.length - 1;
    if (index >= 0) {
      flight = {
        seat: main.seat,
        index,
        source:
          o.pov !== undefined && main.seat !== o.pov
            ? "opponent"
            : main.tsumogiri
              ? "drawn"
              : "hand",
        riichi: main.riichi,
      };
    }
  }
  const reveal: Seat[] = [];
  if (state.results.length > 0 && prev.results.length === 0) {
    for (const seat of o.revealedNow) {
      if (!o.revealedBefore.has(seat) && seat !== o.pov) {
        reveal.push(seat);
      }
    }
    reveal.sort((a, b) => a - b);
  }
  return flight === null && reveal.length === 0 ? NO_MOTION : { flight, reveal };
}
