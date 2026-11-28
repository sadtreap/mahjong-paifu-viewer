import { type RefObject, useEffect, useRef } from "react";
import type { Dir, NavSource } from "../viewer/types";
import { useAttach } from "./useAttach";
import { GESTURE_IGNORE } from "./useStageGestures";
import { INITIAL_WHEEL_STATE, type WheelState, wheelStep } from "./wheel";

export interface WheelStepOptions {
  /** Takes one step; `source` is "repeat" within 350 ms of the previous wheel step. */
  onStep(dir: Dir, options: { ownTurn: boolean; source: NavSource }): boolean;
  /** The clock of the wheel events, in ms (performance.now by default; tests replace it). */
  now?: () => number;
}

/**
 * True when the wheel turned over something inside `host` that scrolls by itself: a part marked
 * `[data-gesture="ignore"]` (something laid over the table). `host` itself may carry the mark and
 * still steps.
 */
function overIgnoredPart(target: EventTarget | null, host: HTMLElement): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const part = target.closest(GESTURE_IGNORE);
  return part !== null && part !== host && host.contains(part);
}

/**
 * Wheel stepping over the given elements (the stage), sharing one accumulator.
 * Non-passive listeners, so a handled event stops the page from scrolling; Ctrl/Cmd+wheel and the
 * parts of an element marked `[data-gesture="ignore"]` are left to the browser.
 */
export function useWheelStep(
  targets: readonly RefObject<HTMLElement | null>[],
  options: WheelStepOptions,
): void {
  const latest = useRef(options);
  const state = useRef<WheelState>(INITIAL_WHEEL_STATE);
  useEffect(() => {
    latest.current = options;
  });

  useAttach(targets, (elements) => {
    const onWheel = (event: WheelEvent) => {
      const { onStep, now = () => performance.now() } = latest.current;
      if (
        !(event.currentTarget instanceof HTMLElement) ||
        overIgnoredPart(event.target, event.currentTarget)
      ) {
        return;
      }
      const result = wheelStep(state.current, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        shiftKey: event.shiftKey === true,
        ctrlKey: event.ctrlKey === true,
        metaKey: event.metaKey === true,
        t: now(),
      });
      state.current = result.state;
      if (!result.handled) {
        return;
      }
      event.preventDefault();
      if (result.step) {
        onStep(result.step.dir, {
          ownTurn: result.step.ownTurn,
          source: result.step.repeat ? "repeat" : "user",
        });
      }
    };
    for (const element of elements) {
      element.addEventListener("wheel", onWheel, { passive: false });
    }
    return () => {
      for (const element of elements) {
        element.removeEventListener("wheel", onWheel);
      }
    };
  });
}
