import { type RefObject, useEffect, useRef } from "react";
import type { Dir, NavSource } from "../viewer/types";
import {
  classifyGesture,
  holdDelay,
  isBackPress,
  isStepButton,
  type PointerSample,
  startsAtEdge,
  tapSlop,
} from "./gestures";
import { createRepeater, type Repeater } from "./repeat";
import { swallowNextClick } from "./swallowClick";
import { useAttach } from "./useAttach";

/** Inside these, the table's gestures stop and the wheel scrolls natively (anything laid over the table). */
export const GESTURE_IGNORE = '[data-gesture="ignore"]';
/** A tap on these never steps (the control handles it); swipes still count. */
export const INTERACTIVE = 'button, a, input, select, textarea, [role="slider"], [role="tab"]';

export interface StageGestureOptions {
  /**
   * Takes one step. `source` is "user" for a click, tap or swipe and "repeat" for a hold.
   * Return false when nothing moved (a hard stop or the game's end): that ends a hold.
   */
  onStep(dir: Dir, options: { ownTurn: boolean; source: NavSource }): boolean;
}

interface Active {
  pointerId: number;
  down: PointerSample;
  interactive: boolean;
  moved: boolean;
  held: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  repeater: Repeater | null;
}

function sample(event: PointerEvent): PointerSample {
  return {
    x: event.clientX,
    y: event.clientY,
    t: event.timeStamp,
    button: event.button,
    pointerType: event.pointerType || "mouse",
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
  };
}

function closestIn(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

/**
 * The table as a step button, with native listeners on the stage: click or tap =
 * next, right-click or Ctrl+click = previous, Shift = by own turn, press and hold = repeat on the
 * hold schedule (forward, or backward with the right button), touch swipe left / right = next /
 * previous (not from a side edge of the screen, where a swipe is the system's Back gesture). The
 * context menu is prevented on the stage (outside such parts, links and fields), and a tap that
 * stepped presses nothing else.
 */
export function useStageGestures(
  ref: RefObject<HTMLElement | null>,
  options: StageGestureOptions,
): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useAttach([ref], ([element]) => {
    let active: Active | null = null;

    const finish = () => {
      const gesture = active;
      if (!gesture) {
        return;
      }
      active = null;
      if (gesture.timer !== null) {
        clearTimeout(gesture.timer);
      }
      gesture.repeater?.stop();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };

    const startHold = () => {
      const gesture = active;
      if (!gesture) {
        return;
      }
      gesture.timer = null;
      gesture.held = true;
      const dir: Dir = isBackPress(gesture.down) ? -1 : 1;
      gesture.repeater = createRepeater(() =>
        latest.current.onStep(dir, { ownTurn: false, source: "repeat" }),
      );
      gesture.repeater.start();
    };

    const onMove = (event: PointerEvent) => {
      const gesture = active;
      if (!gesture || event.pointerId !== gesture.pointerId || gesture.moved) {
        return;
      }
      const distance = Math.hypot(event.clientX - gesture.down.x, event.clientY - gesture.down.y);
      if (distance > tapSlop(gesture.down.pointerType)) {
        gesture.moved = true;
        if (gesture.timer !== null) {
          clearTimeout(gesture.timer);
          gesture.timer = null;
        }
        gesture.repeater?.stop();
      }
    };

    const onUp = (event: PointerEvent) => {
      const gesture = active;
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }
      finish();
      const result = classifyGesture(gesture.down, sample(event), {
        held: gesture.held,
        moved: gesture.moved,
        edge: startsAtEdge(gesture.down.x, window.innerWidth),
      });
      if (result.kind === "step" && (result.swipe || !gesture.interactive)) {
        if (!result.swipe && gesture.down.pointerType !== "mouse") {
          swallowNextClick();
        }
        latest.current.onStep(result.dir, { ownTurn: result.ownTurn, source: "user" });
      }
    };

    const onDown = (event: PointerEvent) => {
      if (active) {
        // A second pointer (a pinch) cancels the gesture.
        finish();
        return;
      }
      if (
        !event.isPrimary ||
        !isStepButton(event.button) ||
        closestIn(event.target, GESTURE_IGNORE)
      ) {
        return;
      }
      const down = sample(event);
      const interactive = closestIn(event.target, INTERACTIVE);
      active = {
        pointerId: event.pointerId,
        down,
        interactive,
        moved: false,
        held: false,
        timer: null,
        repeater: null,
      };
      if (!interactive && !down.shiftKey && !down.altKey) {
        active.timer = setTimeout(startHold, holdDelay(down.pointerType));
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", finish);
      window.addEventListener("blur", finish);
    };

    const onContextMenu = (event: MouseEvent) => {
      if (!closestIn(event.target, `${GESTURE_IGNORE}, a, input, select, textarea`)) {
        event.preventDefault();
      }
    };

    element?.addEventListener("pointerdown", onDown);
    element?.addEventListener("contextmenu", onContextMenu);
    return () => {
      finish();
      element?.removeEventListener("pointerdown", onDown);
      element?.removeEventListener("contextmenu", onContextMenu);
    };
  });
}
