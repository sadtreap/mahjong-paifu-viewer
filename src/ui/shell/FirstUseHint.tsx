import { Fragment, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "../../i18n/context";
import { Icon } from "../Icon";
import { useSettings } from "../settings/useSettings";
import type { FirstUseHintProps } from "../viewer/types";
import styles from "./FirstUseHint.module.css";

/**
 * The first-use coach mark. On the felt (TableStage's `coach` slot) it is a pill at the strip
 * between the own pond and the own hand, placed with the table's projection variables, listing the
 * main gestures as **key** + action and a "Got it" button; only the button takes the pointer.
 * `compact` (below 360 px wide, where the strip is too thin) is a one-line variant for the status
 * line instead.
 */
export function FirstUseHint({ pointer, compact, onDismiss }: FirstUseHintProps) {
  const { m } = useI18n();
  if (compact) {
    return <span className={styles.line}>{m.hint.short}</span>;
  }
  const pairs = pointer === "touch" ? m.hint.touch : m.hint.mouse;
  return (
    <div className={styles.coach} data-pointer={pointer}>
      <Icon name={pointer === "touch" ? "tap" : "mouse"} className={styles.icon} />
      <span className={styles.text}>
        {pairs.map(([key, action], index) => (
          <Fragment key={key}>
            {index > 0 && <span className={styles.sep}> · </span>}
            <span className={styles.pair}>
              <b>{key}</b> {action}
            </span>
          </Fragment>
        ))}
      </span>
      <button type="button" className={styles.dismiss} data-gesture="ignore" onClick={onDismiss}>
        {m.hint.dismiss}
      </button>
    </div>
  );
}

/** The muted legend the status line carries while the coach mark shows: "← → step · click the table". */
export function FirstUseLegend() {
  const { m } = useI18n();
  return (
    <span className={styles.legend}>
      <kbd>←</kbd> <kbd>→</kbd> {m.hint.legend}
    </span>
  );
}

const COARSE = "(pointer: coarse)";

/**
 * Which copy the coach mark shows: touch when the primary pointer is coarse, and from the first
 * touch on; mouse again after a mouse press. Headless and touch laptops misreport `hover`, so this
 * looks at `pointer` and at real presses only.
 */
export function usePointerKind(): "mouse" | "touch" {
  const [kind, setKind] = useState<"mouse" | "touch">(() =>
    typeof window.matchMedia === "function" && window.matchMedia(COARSE).matches
      ? "touch"
      : "mouse",
  );
  useEffect(() => {
    const handleDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        setKind("touch");
      } else if (event.pointerType === "mouse") {
        setKind("mouse");
      }
    };
    window.addEventListener("pointerdown", handleDown, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", handleDown, { capture: true });
  }, []);
  return kind;
}

/**
 * Below 360 px the felt strip between the own pond and the own hand is too thin (the pill would
 * cover own-hand tiles), so the coach mark moves into the status line (FirstUseHint `compact`).
 */
export const COMPACT_HINT_QUERY = "(orientation: portrait) and (max-width: 359px)";

function subscribeCompact(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") {
    return () => {};
  }
  const list = window.matchMedia(COMPACT_HINT_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function compactNow(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(COMPACT_HINT_QUERY).matches;
}

/**
 * The coach mark's state for the viewer: shown until `hintSeen`, which `dismiss` sets (on Got it,
 * Esc or the first successful table step); `pointer` picks the mouse or touch copy and `compact`
 * the status-line variant. The viewer keeps it hidden while the welcome card is up, and while it
 * shows puts FirstUseLegend in the status line (or, compact, the hint itself).
 */
export function useFirstUseHint(): {
  show: boolean;
  pointer: "mouse" | "touch";
  compact: boolean;
  dismiss(): void;
} {
  const { settings, update } = useSettings();
  const pointer = usePointerKind();
  const compact = useSyncExternalStore(subscribeCompact, compactNow, () => false);
  const show = !settings.hintSeen;
  const dismiss = useCallback(() => {
    if (show) {
      update({ hintSeen: true });
    }
  }, [show, update]);
  return { show, pointer, compact, dismiss };
}
