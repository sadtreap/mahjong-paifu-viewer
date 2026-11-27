import type { CSSProperties, KeyboardEvent } from "react";
import { useI18n } from "../../i18n/context";
import type { ScrubberProps } from "../viewer/types";
import styles from "./Scrubber.module.css";

/** PageUp and PageDown move this many steps (a native range would move a tenth of its length). */
const PAGE_STEPS = 10;

/**
 * The step slider of the current round: one native range input, so it has the slider's own keys
 * (arrows, Home, End; PageUp and PageDown move ten steps) and reports every change as a "scrub".
 * Its value text names the step, the turn and what happened there; `describe` keeps hidden draws
 * out of it.
 */
export function Scrubber({ round, steps, step, describe, turnOf, onSeek }: ScrubberProps) {
  const { m } = useI18n();
  const last = Math.max(1, steps) - 1;
  const current = Math.min(Math.max(step, 0), last);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "PageUp" && event.key !== "PageDown") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "PageUp" ? PAGE_STEPS : -PAGE_STEPS;
    const target = Math.min(Math.max(current + delta, 0), last);
    if (target !== current) {
      onSeek({ round, step: target }, "scrub");
    }
  };

  return (
    <input
      className={styles.scrubber}
      style={{ "--fill": last > 0 ? current / last : 0 } as CSSProperties}
      type="range"
      min={1}
      max={last + 1}
      step={1}
      value={current + 1}
      aria-label={m.timeline.stepSlider}
      aria-valuetext={m.timeline.stepValue(
        current + 1,
        last + 1,
        turnOf(current),
        describe(current),
      )}
      onChange={(event) => onSeek({ round, step: Number(event.currentTarget.value) - 1 }, "scrub")}
      onKeyDown={onKeyDown}
    />
  );
}
