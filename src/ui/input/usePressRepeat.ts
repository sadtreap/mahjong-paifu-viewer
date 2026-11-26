import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { NavSource } from "../viewer/types";
import { holdDelay } from "./gestures";
import { createRepeater, type Repeater } from "./repeat";

export interface PressRepeatOptions {
  /**
   * One step: "user" for a click or a key press, "repeat" while held (or for a key's auto-repeat).
   * Return false when nothing moved (a limit or a hard stop): that ends the hold.
   */
  onStep(source: Exclude<NavSource, "autoplay">): boolean;
  /** aria-disabled: presses do nothing (the button keeps the focus). */
  disabled?: boolean;
  /** A hold started or ended. */
  onHold?(active: boolean): void;
}

export interface PressRepeatHandlers {
  onPointerDown(event: PointerEvent<HTMLElement>): void;
  onPointerUp(event: PointerEvent<HTMLElement>): void;
  onPointerCancel(event: PointerEvent<HTMLElement>): void;
  onPointerLeave(event: PointerEvent<HTMLElement>): void;
  onClick(event: MouseEvent<HTMLElement>): void;
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
  onContextMenu(event: MouseEvent<HTMLElement>): void;
}

/**
 * Hold-to-repeat for a button (prev / next step, prev / next own turn): a click steps once; a
 * press held for 350 ms (400 ms on touch) repeats on the hold schedule until release, and the
 * click that ends a hold is swallowed. Enter's auto-repeat steps as a repeat.
 */
export function usePressRepeat(options: PressRepeatOptions): PressRepeatHandlers {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const gesture = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    repeater: Repeater | null;
    held: boolean;
    swallowClick: boolean;
  }>({ timer: null, repeater: null, held: false, swallowClick: false });

  useEffect(
    () => () => {
      const current = gesture.current;
      if (current.timer !== null) {
        clearTimeout(current.timer);
      }
      current.repeater?.stop();
    },
    [],
  );

  return useMemo<PressRepeatHandlers>(() => {
    const end = (swallow: boolean) => {
      const current = gesture.current;
      if (current.timer !== null) {
        clearTimeout(current.timer);
        current.timer = null;
      }
      current.repeater?.stop();
      current.repeater = null;
      if (current.held) {
        current.held = false;
        current.swallowClick = swallow;
        latest.current.onHold?.(false);
        if (swallow) {
          // The click that ends a hold comes in the same input task as the pointerup; a long
          // touch press may end without one, and the next click must not be lost.
          setTimeout(() => {
            current.swallowClick = false;
          }, 0);
        }
      }
    };
    return {
      onPointerDown(event) {
        if (!event.isPrimary || event.button !== 0 || latest.current.disabled) {
          return;
        }
        end(false);
        const current = gesture.current;
        current.swallowClick = false;
        current.timer = setTimeout(() => {
          current.timer = null;
          current.held = true;
          latest.current.onHold?.(true);
          current.repeater = createRepeater(() => latest.current.onStep("repeat"));
          current.repeater.start();
        }, holdDelay(event.pointerType));
      },
      onPointerUp() {
        end(true);
      },
      onPointerCancel() {
        end(true);
      },
      onPointerLeave() {
        end(true);
      },
      onClick(event) {
        const current = gesture.current;
        if (current.swallowClick) {
          current.swallowClick = false;
          event.preventDefault();
          return;
        }
        if (!latest.current.disabled) {
          latest.current.onStep("user");
        }
      },
      onKeyDown(event) {
        if (event.key === "Enter" && event.repeat) {
          event.preventDefault();
          if (!latest.current.disabled) {
            latest.current.onStep("repeat");
          }
        }
      },
      onContextMenu(event) {
        // A long press on touch would open the context menu (or the callout) over the button.
        if (gesture.current.held || gesture.current.timer !== null) {
          event.preventDefault();
        }
      },
    };
  }, []);
}
