import type { Round } from "../../core/model";
import type { BoardState } from "../../replay/types";
import type { AutoplaySpeed, MotionSpec, ViewerState } from "../viewer/types";
import { isSingleForwardStep, stepEvents } from "./captions";

const NO_MOTION: MotionSpec = { landing: null };

/**
 * The motion of a step: the discard just made settles into its pond. Only after a single forward
 * step, never at 4× autoplay. `prev` is the state before `state`. Whether anything moves at all
 * is the stylesheet's call (prefers-reduced-motion).
 */
export function motionFor(
  round: Round,
  prev: BoardState,
  state: BoardState,
  lastMove: ViewerState["lastMove"],
  speed: AutoplaySpeed,
): MotionSpec {
  if (!isSingleForwardStep(lastMove, speed) || prev === state) {
    return NO_MOTION;
  }
  const main = stepEvents(round, state)[0];
  if (main?.type !== "discard") {
    return NO_MOTION;
  }
  const index = state.seats[main.seat].discards.length - 1;
  return index < 0 ? NO_MOTION : { landing: { seat: main.seat, index } };
}
