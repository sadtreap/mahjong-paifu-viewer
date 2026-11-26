import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import type { Position } from "../navigation";
import type { GameOverview, PovMark, RoundSummary } from "../viewer/types";
import styles from "./GameBand.module.css";

export interface GameBandProps {
  overview: GameOverview;
  position: Position;
  povMarks: readonly PovMark[];
  onSeek(p: Position, kind: "jump" | "scrub"): void;
  onScrubEnd(): void;
}

/** Pointer travel (px) before a press on band 1 becomes a scrub. */
export const SCRUB_SLOP_PX = 4;

/**
 * The label a narrow segment keeps: a round without honba keeps its name ("E3"), a honba round
 * ("E3-1") none, since "E3" would repeat its neighbour (the tooltip still names it). Every
 * locale writes round.short's honba as a "-n" suffix.
 */
export function narrowLabel(label: string): string {
  return /-\d+$/.test(label) ? "" : label;
}

interface Segment {
  round: number;
  left: number;
  width: number;
}

/** The position under a client x, from the segments' boxes read when the press started. */
function positionAt(x: number, segments: readonly Segment[], overview: GameOverview): Position {
  let best = segments[0];
  for (const segment of segments) {
    if (x >= segment.left) {
      best = segment;
    }
  }
  if (!best) {
    return { round: 0, step: 0 };
  }
  const summary = overview.rounds[best.round] as RoundSummary;
  const fraction = best.width > 0 ? (x - best.left) / best.width : 0;
  const step = Math.round(Math.min(Math.max(fraction, 0), 1) * (summary.steps - 1));
  return { round: best.round, step };
}

/**
 * Band 1: the whole game, one segment per round weighted by its steps, with the outcome marker,
 * the POV's win / deal-in glyph and gain or loss bar, and a cursor. A press on a segment goes to
 * the round start, on the marker to the result; dragging scrubs. Hidden from assistive technology:
 * the round matrix and the round keys are the accessible equivalents.
 */
export function GameBand({ overview, position, povMarks, onSeek, onScrubEnd }: GameBandProps) {
  const { m } = useI18n();
  const drag = useRef<{ x: number; segments: Segment[]; scrubbing: boolean; id: number } | null>(
    null,
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as Element;
    const segment = target.closest<HTMLElement>("[data-round]");
    if (!segment) {
      return;
    }
    const round = Number(segment.dataset.round);
    const summary = overview.rounds[round];
    if (!summary) {
      return;
    }
    event.preventDefault();
    const onMarker = target.closest("[data-marker]") !== null;
    onSeek({ round, step: onMarker ? summary.steps - 1 : 0 }, "jump");
    // One layout read per press: the segment boxes, for scrubbing.
    const segments = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-round]"),
      (element) => {
        const box = element.getBoundingClientRect();
        return { round: Number(element.dataset.round), left: box.left, width: box.width };
      },
    );
    drag.current = { x: event.clientX, segments, scrubbing: false, id: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) {
      return;
    }
    if (!current.scrubbing && Math.abs(event.clientX - current.x) <= SCRUB_SLOP_PX) {
      return;
    }
    current.scrubbing = true;
    onSeek(positionAt(event.clientX, current.segments, overview), "scrub");
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) {
      return;
    }
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (current.scrubbing) {
      onScrubEnd();
    }
  };

  return (
    <div
      className={styles.band}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {overview.rounds.map((round) => {
        const current = round.index === position.round;
        const pov = povMarks[round.index];
        const outcome = round.outcome;
        const fraction = round.steps > 1 ? position.step / (round.steps - 1) : 0;
        return (
          <div
            key={round.index}
            className={cx(styles.segment, current && styles.current)}
            style={{ flexGrow: round.steps }}
            data-round={round.index}
            title={
              round.resultText ? m.timeline.roundTip(round.label, round.resultText) : round.label
            }
          >
            <span className={styles.label}>
              <span className={styles.full}>{round.label}</span>
              <span className={styles.short}>{narrowLabel(round.label)}</span>
            </span>
            {outcome && (
              <span className={cx(styles.marker, styles[outcome.kind])} data-marker="">
                {outcome.kind !== "draw" && outcome.wins > 1 ? outcome.wins : null}
              </span>
            )}
            {pov?.won && <span className={cx(styles.glyph, styles.win)}>★</span>}
            {!pov?.won && pov?.dealtIn && (
              <span className={cx(styles.glyph, styles.dealin)}>▼</span>
            )}
            {pov && pov.delta !== 0 && (
              <span className={cx(styles.bar, pov.delta > 0 ? styles.gain : styles.loss)} />
            )}
            {current && <span className={styles.cursor} style={{ left: `${fraction * 100}%` }} />}
          </div>
        );
      })}
    </div>
  );
}
