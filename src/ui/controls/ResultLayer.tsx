import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";
import { classifyGesture, type PointerSample, startsAtEdge } from "../input/gestures";
import { swallowNextClick } from "../input/swallowClick";
import styles from "./ResultLayer.module.css";

/**
 * For this long after the card comes up, a press on it or beside it does nothing: it is most
 * likely one more tap meant for the table, made before the card was seen. Each press it swallows
 * starts it again, so a quick run of taps never reaches the card; a press after a pause does.
 */
export const CARD_GUARD_MS = 700;

export interface ResultLayerProps {
  /** "Show table": a press or a swipe to the left beside the card. */
  onHide(): void;
  /** A swipe to the right beside the card: back a step, as on the table. */
  onStepBack(): void;
  /** The result card. */
  children: ReactNode;
}

function sample(event: ReactPointerEvent): PointerSample {
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

/**
 * The layer that holds the result card over the table, in the stage's overlay slot: it centres
 * the card and is the size container the card adapts to. The part over the stage beside the card
 * stands for the table under it: a primary press there hides the card (only a press that starts
 * and ends there, so a drag out of the card does not), and a touch swipe works as on the table, to
 * the left hiding the card and to the right going back a step. A press in the first moment after
 * the card comes up, or soon after a press swallowed there (CARD_GUARD_MS), presses nothing, on
 * the card or beside it; keys work at once.
 */
export function ResultLayer({ onHide, onStepBack, children }: ResultLayerProps) {
  const outside = useRef<HTMLDivElement>(null);
  const down = useRef<PointerSample | null>(null);
  // When the guard last started: the card coming up, or a press it swallowed.
  const guardFrom = useRef(Number.POSITIVE_INFINITY);
  useEffect(() => {
    guardFrom.current = performance.now();
  }, []);
  const isOutside = (event: ReactPointerEvent | ReactMouseEvent) =>
    event.target === event.currentTarget || event.target === outside.current;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the card's "Show table" button and Esc do the same
    // biome-ignore lint/a11y/useKeyWithClickEvents: the card's "Show table" button and Esc do the same
    <div
      className={styles.layer}
      onPointerDown={(event) => {
        const now = performance.now();
        if (!(now - guardFrom.current >= CARD_GUARD_MS)) {
          guardFrom.current = now;
          down.current = null;
          swallowNextClick();
          return;
        }
        down.current = isOutside(event) && event.isPrimary ? sample(event) : null;
      }}
      onPointerUp={(event) => {
        const start = down.current;
        if (start === null || !isOutside(event)) {
          return;
        }
        const gesture = classifyGesture(start, sample(event), {
          held: false,
          edge: startsAtEdge(start.x, window.innerWidth),
        });
        if (gesture.kind === "step" && gesture.swipe) {
          down.current = null;
          if (gesture.dir === 1) {
            onHide();
          } else {
            onStepBack();
          }
        }
      }}
      onClick={(event) => {
        if (down.current?.button === 0 && isOutside(event)) {
          onHide();
        }
        down.current = null;
      }}
    >
      <div ref={outside} className={styles.outside} aria-hidden="true" />
      {children}
    </div>
  );
}
