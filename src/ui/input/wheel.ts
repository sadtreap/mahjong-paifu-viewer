import type { Dir } from "../viewer/types";

/** Accumulator state of the wheel (times in ms, from the same clock as `WheelInput.t`). */
export interface WheelState {
  acc: number;
  lastEventT: number;
  lastStepT: number;
}

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages (WheelEvent.deltaMode). */
  deltaMode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  t: number;
}

export const INITIAL_WHEEL_STATE: WheelState = Object.freeze({
  acc: 0,
  lastEventT: Number.NEGATIVE_INFINITY,
  lastStepT: Number.NEGATIVE_INFINITY,
});

/** Pixel deltas per step; idle time that resets the burst; minimum time between steps; repeat window. */
export const WHEEL = { thresholdPx: 50, idleMs: 200, minStepMs: 33, repeatMs: 350 } as const;

/**
 * One wheel event. `handled` means the event is ours (the caller
 * prevents the page scroll); `step` is the step to take, at most one per event.
 * - Ctrl or Cmd: never ours (browser zoom). No vertical delta without Shift: not ours.
 * - Down is forward. Shift: by own turn, reading deltaX when deltaY is 0.
 * - The first event after 200 ms without wheel events steps at once, whatever its delta.
 * - Otherwise, in pixel mode, deltas add up; at 50 px one step, and the sum starts again. The sum
 *   restarts on a direction change and after the idle time.
 * - Line and page mode: one step per event.
 * - At most one step per 33 ms. A step within 350 ms of the previous one is a repeat (the hard
 *   stop at a round's end applies).
 */
export function wheelStep(
  state: WheelState,
  event: WheelInput,
): {
  state: WheelState;
  handled: boolean;
  step: { dir: Dir; ownTurn: boolean; repeat: boolean } | null;
} {
  if (event.ctrlKey || event.metaKey) {
    return { state, handled: false, step: null };
  }
  const delta = event.shiftKey && event.deltaY === 0 ? event.deltaX : event.deltaY;
  if (delta === 0) {
    return { state, handled: false, step: null };
  }
  const dir: Dir = delta > 0 ? 1 : -1;
  const idle = event.t - state.lastEventT >= WHEEL.idleMs;
  const canStep = event.t - state.lastStepT >= WHEEL.minStepMs;
  let acc: number;
  let stepNow: boolean;
  if (event.deltaMode !== 0 || idle) {
    acc = 0;
    stepNow = canStep;
  } else {
    acc = Math.sign(state.acc) === dir ? state.acc + delta : delta;
    stepNow = canStep && Math.abs(acc) >= WHEEL.thresholdPx;
  }
  return {
    state: {
      acc: stepNow ? 0 : acc,
      lastEventT: event.t,
      lastStepT: stepNow ? event.t : state.lastStepT,
    },
    handled: true,
    step: stepNow
      ? { dir, ownTurn: event.shiftKey, repeat: event.t - state.lastStepT < WHEEL.repeatMs }
      : null,
  };
}
