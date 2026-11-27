import type { Dir } from "../viewer/types";

/** The parts of a pointer event a gesture needs (clientX/Y, time in ms). */
export interface PointerSample {
  x: number;
  y: number;
  t: number;
  button: number;
  pointerType: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/** A tap or click steps; `swipe` marks a touch swipe (which counts even when it starts on a control). */
export type Gesture =
  | { kind: "none" }
  | { kind: "step"; dir: Dir; ownTurn: boolean; swipe: boolean };

/** Movement that still counts as a tap: 6 px for a mouse, 10 px for touch and pens. */
export const TAP_SLOP_PX = { mouse: 6, touch: 10 } as const;
/** Press and hold before repeating starts. */
export const HOLD_DELAY_MS = { mouse: 350, touch: 400 } as const;
/** A swipe: at least 40 px sideways, more than twice its vertical travel, within 600 ms. */
export const SWIPE = { minDx: 40, maxMs: 600 } as const;
/** A swipe that starts this close to a side edge of the screen is the system's Back gesture. */
export const SWIPE_EDGE_PX = 24;

const isMouse = (pointerType: string) => pointerType === "mouse";

export function tapSlop(pointerType: string): number {
  return isMouse(pointerType) ? TAP_SLOP_PX.mouse : TAP_SLOP_PX.touch;
}

export function holdDelay(pointerType: string): number {
  return isMouse(pointerType) ? HOLD_DELAY_MS.mouse : HOLD_DELAY_MS.touch;
}

/** A press that goes back: the right button, or Ctrl with the left button (macOS). */
export function isBackPress(sample: Pick<PointerSample, "button" | "ctrlKey">): boolean {
  return sample.button === 2 || (sample.button === 0 && sample.ctrlKey);
}

/** True when a touch at `x` starts in the strip along either side edge of a screen `width` wide. */
export function startsAtEdge(x: number, width: number): boolean {
  return x < SWIPE_EDGE_PX || x > width - SWIPE_EDGE_PX;
}

/** The buttons the table listens to: left and right (middle, back and forward are ignored). */
export function isStepButton(button: number): boolean {
  return button === 0 || button === 2;
}

/**
 * What a press and release on the table mean:
 * - after a hold, nothing (the hold already repeated);
 * - Alt, nothing (Alt+click on a discard is the table's own jump);
 * - within the tap slop: a step, back for the right button or Ctrl+click, by own turn with Shift;
 * - a touch or pen swipe left / right: next / previous step, unless it started at a side edge of
 *   the screen (`edge`), where swiping is the system's;
 * - anything else (a mouse drag, a vertical swipe, a slow or short one, a move past the slop
 *   that came back): nothing.
 */
export function classifyGesture(
  down: PointerSample,
  up: PointerSample,
  options: { held: boolean; moved?: boolean; edge?: boolean },
): Gesture {
  if (options.held || down.altKey || !isStepButton(down.button)) {
    return { kind: "none" };
  }
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  const slop = tapSlop(down.pointerType);
  if (!options.moved && Math.hypot(dx, dy) <= slop) {
    return {
      kind: "step",
      dir: isBackPress(down) ? -1 : 1,
      ownTurn: down.shiftKey,
      swipe: false,
    };
  }
  if (
    !isMouse(down.pointerType) &&
    !options.edge &&
    Math.abs(dx) >= SWIPE.minDx &&
    Math.abs(dx) > 2 * Math.abs(dy) &&
    up.t - down.t <= SWIPE.maxMs
  ) {
    return { kind: "step", dir: dx > 0 ? -1 : 1, ownTurn: false, swipe: true };
  }
  return { kind: "none" };
}
