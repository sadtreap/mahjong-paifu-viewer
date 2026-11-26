import { type ChangeEvent, type CSSProperties, type KeyboardEvent, memo, useRef } from "react";
import type { Quad, Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import type { Position } from "../navigation";
import type { DiscardRef, MarkKind, RoundMarks } from "../viewer/types";
import styles from "./RoundBand.module.css";

export interface RoundBandProps {
  /** Round index and its step count (at least 1). */
  round: number;
  steps: number;
  position: Position;
  marks: RoundMarks;
  laneOrder: readonly Seat[];
  pov: Seat;
  names: Quad<string>;
  describe(step: number): string;
  turnOf(step: number): number;
  pin: { ref: DiscardRef; step: number; label: string } | null;
  onPinJump(): void;
  onSeek(p: Position, kind: "jump" | "scrub"): void;
  onScrubEnd(): void;
}

/** Where a step sits along band 2 (0..1), as the custom property the marks position with. */
function at(step: number, steps: number): CSSProperties {
  return { "--t": steps > 1 ? step / (steps - 1) : 0 } as CSSProperties;
}

const SEAT_MARKS: ReadonlySet<MarkKind> = new Set([
  "discard",
  "tsumogiri",
  "riichi",
  "call",
  "kan",
  "kita",
]);

const MARK_CLASS: Record<MarkKind, string | undefined> = {
  discard: styles.discard,
  tsumogiri: styles.tsumogiri,
  riichi: styles.riichi,
  call: styles.call,
  kan: styles.kan,
  kita: styles.kita,
  dora: styles.dora,
  end: styles.end,
};

interface LanesProps {
  marks: RoundMarks;
  laneOrder: readonly Seat[];
  pov: Seat;
  names: Quad<string>;
  steps: number;
}

/** The lanes and their marks: rendered once per round and POV, never per step. */
const Lanes = memo(function Lanes({ marks, laneOrder, pov, names, steps }: LanesProps) {
  const { m } = useI18n();
  return (
    <div className={styles.lanes} aria-hidden="true">
      {laneOrder.map((seat) => (
        <div
          key={seat}
          className={cx(styles.lane, seat === pov && styles.pov)}
          style={{ "--seat": `var(--seat-${seat})` } as CSSProperties}
        >
          <span className={styles.laneLabel} title={names[seat]}>
            {Array.from(names[seat])[0] ?? ""}
          </span>
          {marks.riichiFrom[seat] !== undefined && (
            <span className={styles.riichiBar} style={at(marks.riichiFrom[seat] ?? 0, steps)} />
          )}
          {marks.marks.map((mark, index) =>
            mark.seat === seat && SEAT_MARKS.has(mark.kind) ? (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: marks are a fixed list per round
                key={index}
                className={cx(styles.mark, MARK_CLASS[mark.kind])}
                style={at(mark.step, steps)}
              >
                {mark.kind === "kita" ? m.timeline.kitaMark : null}
              </span>
            ) : null,
          )}
        </div>
      ))}
      {marks.marks.map((mark, index) =>
        mark.kind === "dora" || mark.kind === "end" ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: marks are a fixed list per round
            key={index}
            className={cx(styles.line, MARK_CLASS[mark.kind])}
            style={at(mark.step, steps)}
          />
        ) : null,
      )}
    </div>
  );
});

/**
 * Band 2: the current round as one swimlane per playing seat in turn order from the POV, over a
 * native range input (the accessible control). Only the cursor and the pin change per step.
 */
export function RoundBand({
  round,
  steps,
  position,
  marks,
  laneOrder,
  pov,
  names,
  describe,
  turnOf,
  pin,
  onPinJump,
  onSeek,
  onScrubEnd,
}: RoundBandProps) {
  const { m } = useI18n();
  const scrubbed = useRef(false);
  const step = Math.min(Math.max(position.step, 0), steps - 1);
  const lane = pin ? laneOrder.indexOf(pin.ref.seat) : -1;

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    scrubbed.current = true;
    onSeek({ round, step: Number(event.currentTarget.value) - 1 }, "scrub");
  };
  const end = () => {
    if (scrubbed.current) {
      scrubbed.current = false;
      onScrubEnd();
    }
  };
  // PageUp / PageDown move 10 steps (a native range moves 10% of its length).
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "PageUp" && event.key !== "PageDown") {
      return;
    }
    event.preventDefault();
    const target = Math.min(Math.max(step + (event.key === "PageUp" ? 10 : -10), 0), steps - 1);
    if (target !== step) {
      scrubbed.current = true;
      onSeek({ round, step: target }, "scrub");
    }
  };
  const onKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!event.repeat) {
      end();
    }
  };

  return (
    <div
      className={styles.band}
      style={{ "--lanes": laneOrder.length } as CSSProperties}
      data-lanes={laneOrder.length}
    >
      <Lanes marks={marks} laneOrder={laneOrder} pov={pov} names={names} steps={steps} />
      <span className={styles.cursor} style={at(step, steps)} aria-hidden="true" />
      {pin && lane >= 0 && (
        <>
          <span className={styles.pinLine} style={at(pin.step, steps)} aria-hidden="true" />
          <button
            type="button"
            className={styles.pin}
            style={
              {
                ...at(pin.step, steps),
                "--lane": lane,
                "--seat": `var(--seat-${pin.ref.seat})`,
              } as CSSProperties
            }
            aria-label={pin.label}
            title={pin.label}
            onClick={onPinJump}
          />
        </>
      )}
      <input
        className={styles.range}
        type="range"
        min={1}
        max={steps}
        step={1}
        value={step + 1}
        aria-label={m.timeline.stepSlider}
        aria-valuetext={m.timeline.stepValue(step + 1, steps, turnOf(step), describe(step))}
        onChange={onChange}
        onPointerUp={end}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={end}
      />
    </div>
  );
}
