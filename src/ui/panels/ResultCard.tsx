import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { Quad, RyukyokuEvent, Seat, WinEvent } from "../../core/model";
import type { KnownTile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { FinalStandings } from "../FinalStandings";
import { Icon } from "../Icon";
import { keyed } from "../layout";
import { DrawResult, RiichiLineView, WinResult } from "../ResultPanel";
import type { ResultCardProps } from "../viewer/types";
import styles from "./ResultCard.module.css";

export interface ResultCardViewProps extends ResultCardProps {
  /** The round's dora indicators, shown with the first win (optional: the HUD shows them too). */
  doraIndicators?: readonly KnownTile[];
}

type Result = WinEvent | RyukyokuEvent;

/**
 * Each result's "before" scores, so that before → after chains through a multiple ron: the
 * scores at the result step (`seats`, after every result) minus the changes of this result and
 * of the results listed after it.
 */
function beforeScores(results: readonly Result[], after: Quad<number>): Quad<number>[] {
  const out: Quad<number>[] = [];
  let running = [...after] as Quad<number>;
  for (let index = results.length - 1; index >= 0; index--) {
    const deltas = (results[index] as Result).deltas;
    running = running.map((score, seat) => score - (deltas[seat] ?? 0)) as Quad<number>;
    out[index] = running;
  }
  return out;
}

/**
 * Whether a scroll box has content below its fold (the overlay card on a small stage): measured on
 * scroll and resize, and again whenever `content` changes.
 */
function useMoreBelow(ref: RefObject<HTMLElement | null>, enabled: boolean, content: unknown) {
  const [more, setMore] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: new content is measured again
  useEffect(() => {
    const el = ref.current;
    if (!enabled || el === null) {
      setMore(false);
      return;
    }
    const update = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [ref, enabled, content]);
  return more;
}

/**
 * The round result: each win (winning hand with calls and kita, value, dora, riichi line, yaku,
 * before → after) or the draw (tenpai seats with their waits), the other riichi players' lines,
 * final standings after the last round, and Hide / Next round. "docked" sits in the review rail in
 * the page theme; "overlay" floats over the stage in the table palette, and when it scrolls (a
 * small stage) a fade and a shadow over its button bar show that more lies below. Stage gestures
 * ignore it.
 */
export function ResultCard({
  results,
  seats,
  names,
  playerCount,
  final,
  riichiLines,
  drawWaits,
  mode,
  onHide,
  onNextRound,
  doraIndicators = [],
}: ResultCardViewProps) {
  const { m } = useI18n();
  const headingId = useId();
  const after = seats.map((seat) => seat.score) as Quad<number>;
  const before = beforeScores(results, after);
  const winners = new Set<Seat>(
    results.filter((result): result is WinEvent => result.type === "win").map((win) => win.seat),
  );
  const others = winners.size > 0 ? riichiLines.filter((line) => !winners.has(line.seat)) : [];
  const box = useRef<HTMLElement>(null);
  const more = useMoreBelow(box, mode === "overlay", results);
  const card = (
    <section
      ref={box}
      className={cx(styles.card, mode === "docked" ? styles.docked : styles.overlay)}
      aria-labelledby={headingId}
      data-gesture="ignore"
      data-result-card={mode}
      data-more={more ? "" : undefined}
    >
      <h2 id={headingId} className="sr-only">
        {m.result.heading}
      </h2>
      {keyed(results).map(({ key, item }, index) =>
        item.type === "win" ? (
          <WinResult
            key={key}
            win={item}
            names={names}
            melds={seats[item.seat].melds}
            kita={seats[item.seat].kita}
            playerCount={playerCount}
            before={before[index]}
            riichi={riichiLines.find((line) => line.seat === item.seat && line.winner) ?? null}
            doraIndicators={index === 0 ? doraIndicators : []}
          />
        ) : (
          <DrawResult
            key={key}
            draw={item}
            names={names}
            playerCount={playerCount}
            waits={drawWaits}
            before={before[index]}
          />
        ),
      )}
      {others.length > 0 && (
        <div className={styles.others}>
          {others.map((line) => (
            <RiichiLineView key={line.seat} line={line} names={names} />
          ))}
        </div>
      )}
      {final && <FinalStandings scores={final} names={names} playerCount={playerCount} />}
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onHide}>
          {m.result.hide}
        </button>
        {!final && (
          <button type="button" className={cx(styles.button, styles.primary)} onClick={onNextRound}>
            {m.result.nextRound}
            <Icon name="nextRound" className={styles.icon} />
          </button>
        )}
      </div>
    </section>
  );
  if (mode === "docked") {
    return card;
  }
  return <div className={styles.layer}>{card}</div>;
}

export interface ResultCollapsedProps {
  /** One line about the result (resultSummary). */
  summary: string;
  onShow(): void;
}

/** The docked result after Hide: one line and a button that shows the card again. */
export function ResultCollapsed({ summary, onShow }: ResultCollapsedProps) {
  const { m } = useI18n();
  return (
    <div className={styles.collapsed} data-gesture="ignore">
      <span className={styles.summary}>{summary}</span>
      <button type="button" className={styles.button} onClick={onShow}>
        {m.table.showResult}
      </button>
    </div>
  );
}
