import type { Round, Seat } from "../../core/model";
import type { BoardState, SeatView } from "../../replay/types";
import { DRAWN_GAP, fitScale, handRowWidth } from "../layout";
import type { AutoplaySpeed, MotionSpec, ViewerState } from "../viewer/types";
import { isSingleForwardStep, stepEvents } from "./captions";
import {
  type Camera,
  depthAt,
  type OppRowLayout,
  OWN_HAND,
  oppRowUnits,
  pondSlot,
  project,
  WALL_EDGE_GAP,
  WALL_START,
  WALL_TILE_DEPTH,
} from "./geometry";

/**
 * Where the own hand's tile centres lie on the plane: the plane depth Y behind the line 2/3 of a
 * tile above the frame's bottom (the own hand is flat DOM there, beyond the near edge), the scale
 * at that depth and the own tile width in units.
 */
export function ownHandLine(c: Camera, ownUnits: number): { y: number; scale: number; tw: number } {
  const tw = Math.min(OWN_HAND.tile, (20 * c.ownFit) / Math.max(1, ownUnits));
  const y = depthAt(((2 / 3) * tw) / 20 - c.below, c);
  return { y, scale: project(10, y, c).scale, tw };
}

/** Where a discard flight starts, relative to the pond slot it lands on. */
export interface FlightOffset {
  /** Offset of the tile's source from the slot, in the discarder's seat-layer units. */
  fx: number;
  fy: number;
  /** The proxy's scale at the start (it lands at the pond's tile size). */
  fs: number;
  /**
   * Plane pixels the start moves toward the viewer for each pixel a tall dock pushes the own hand
   * down. 0 for an opponent, whose hand lies on the plane.
   */
  drop: number;
}

/**
 * Start of a discard flight, from the pond slot to the tile's source (the flight layer turns with
 * the discarder's seat). Pure geometry, no layout reads. `view` is the discarder's seat after the
 * discard; `ownUnits` is ownRowUnits of the point of view's hand (used for the "hand" and "drawn"
 * sources); `row` is the opponent's row layout (geometry.ts oppRowLayout; by default a row from
 * 0.4 with no wall gap).
 */
export function flightOffset(
  spec: NonNullable<MotionSpec["flight"]>,
  view: SeatView,
  c: Camera,
  ownUnits: number,
  row?: Pick<OppRowLayout, "start" | "hs">,
): FlightOffset {
  const target = pondSlot(spec.index, view.discards);
  if (spec.source === "opponent") {
    // The end of the opponent's hand row, where a drawn tile stands, on its wall line.
    const hs = row?.hs ?? fitScale(handRowWidth(view, spec.seat), oppRowUnits("top"));
    const x = (row?.start ?? WALL_START) + (view.hand.length + DRAWN_GAP + 0.5) * hs;
    const y = 20 - WALL_EDGE_GAP - WALL_TILE_DEPTH * hs + 0.03;
    return { fx: x - target.x, fy: y - target.y, fs: hs / target.tile, drop: 0 };
  }
  const { y, scale, tw } = ownHandLine(c, ownUnits);
  // Tile units from the own row's left edge: the drawn tile after the hand, else mid-hand.
  const n = view.hand.length;
  const along = spec.source === "drawn" ? n + DRAWN_GAP + 0.5 : n / 2;
  const screenX = (-ownUnits / 2 + along) * tw; // from the centre line, in units of the frame
  const x = 10 + screenX / scale;
  return {
    fx: x - target.x,
    fy: y - target.y,
    fs: tw / (target.tile * scale),
    drop: 1 / (c.cos * scale * scale),
  };
}

const NO_MOTION: MotionSpec = { flight: null, reveal: [] };

export interface MotionOptions {
  /** False when the user prefers reduced motion: no flight and no reveal. */
  motion: boolean;
  revealedBefore: ReadonlySet<Seat>;
  revealedNow: ReadonlySet<Seat>;
  /** The point of view: its discards fly from the own hand, the others' from their walls. */
  pov?: Seat;
}

/**
 * The motion of a step: a discard flight (with the riichi turn) and the round-end reveal (seats
 * whose hidden hand turns face up on reaching the result). Only after a single forward step,
 * never at 4× autoplay, and nothing when `motion` is false. `prev` is the state before `state`.
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
