import {
  type CSSProperties,
  memo,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import type { Quad, Seat } from "../../core/model";
import { tileFromKind } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { cx } from "../cx";
import { tileLabel } from "../labels";
import type { Position } from "../navigation";
import { TileImage } from "../TileImage";
import type { MoveNote, MoveRow } from "../viewer/types";
import styles from "./MovesList.module.css";

export interface MovesListProps {
  moves: readonly MoveRow[];
  currentStep: number;
  /** Draw rows are listed for this seat only (the others' draws are hidden information). */
  pov: Seat;
  names: Quad<string>;
  /** The unseen grid's sticky pick: rows of other kinds are hidden. */
  picked: number | null;
  open: boolean;
  onOpen(open: boolean): void;
  /** Off: only the moves up to the current step, the rest behind a checkbox (spoilers). */
  showRest: boolean;
  onShowRest(show: boolean): void;
  onSeek(p: Position): void;
}

function noteLabel(m: Messages, note: MoveNote): string {
  switch (note) {
    case "draw":
      return m.panel.note.draw;
    case "discard":
      return m.panel.note.discard;
    case "tsumogiri":
      return m.ptip.tsumogiri;
    case "riichi":
      return m.panel.facts.riichi;
    case "called":
      return m.ptip.called;
    case "chi":
      return m.captions.chi;
    case "pon":
      return m.captions.pon;
    case "kan":
      return m.captions.kan;
    case "kita":
      return m.captions.kita;
    case "tsumo":
      return m.panel.note.tsumo;
    case "ron":
      return m.panel.note.ron;
    case "drawEnd":
      return m.panel.note.drawEnd;
  }
}

interface MoveItemProps {
  row: MoveRow;
  current: boolean;
  future: boolean;
  hidden: boolean;
  /** Whether the "called" note may show (the call has happened, or the rest is shown). */
  showCalled: boolean;
  names: Quad<string>;
  onActivate(target: Position): void;
}

/** One row: re-renders only when it becomes current, future, hidden or called. */
const MoveItem = memo(function MoveItem({
  row,
  current,
  future,
  hidden,
  showCalled,
  names,
  onActivate,
}: MoveItemProps) {
  const { m } = useI18n();
  const notes = row.notes.filter((note) => note !== "called" || showCalled);
  const name = row.seat === null ? null : names[row.seat];
  const tile = row.tile === null ? null : tileLabel(m, row.tile);
  const labels = notes.map((note) => noteLabel(m, note));
  return (
    <li
      className={cx(future && styles.future)}
      aria-current={current ? "step" : undefined}
      data-kind={row.kind ?? undefined}
      hidden={hidden}
    >
      <button
        type="button"
        className={styles.row}
        aria-label={m.panel.moveRow(row.turn, name, tile, labels)}
        onClick={() => onActivate(row.target)}
      >
        <span className={styles.turn} aria-hidden="true">
          {m.panel.turnShort(row.turn)}
        </span>
        <span
          className={styles.who}
          style={
            row.seat === null ? undefined : ({ color: `var(--seat-${row.seat})` } as CSSProperties)
          }
          aria-hidden="true"
        >
          {name === null ? "" : (Array.from(name)[0] ?? "")}
        </span>
        {row.tile === null ? (
          <span />
        ) : (
          <span className={styles.tile}>
            <TileImage tile={row.tile} label="" />
          </span>
        )}
        <span className={styles.note} aria-hidden="true">
          {labels.join(" · ")}
        </span>
      </button>
    </li>
  );
});

/**
 * The round's moves (discards, calls, kans, kita, the POV's draws, the result), in a collapsible
 * section. Without "show the rest" the list stops at the current step, so it never gives the next
 * move away. A row goes to its decision step. Per step only `aria-current` moves, and the list
 * (its own scroll box) follows the current row while the section is open.
 */
export function MovesList({
  moves,
  currentStep,
  pov,
  names,
  picked,
  open,
  onOpen,
  showRest,
  onShowRest,
  onSeek,
}: MovesListProps) {
  const { m } = useI18n();
  const restId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const restoreFocus = useRef(false);
  const seek = useRef(onSeek);
  useLayoutEffect(() => {
    seek.current = onSeek;
  });
  const activate = useCallback((target: Position) => {
    restoreFocus.current = true;
    seek.current(target);
  }, []);

  const rows = moves.filter((row) => !row.notes.includes("draw") || row.seat === pov);
  const shown = showRest ? rows : rows.filter((row) => row.step <= currentStep);
  const hiddenCount = rows.length - shown.length;
  let current = -1;
  for (const [index, row] of shown.entries()) {
    if (row.step <= currentStep) {
      current = index;
    }
  }
  const matches = (row: MoveRow) => picked === null || row.kind === picked;
  const pickCount = picked === null ? 0 : shown.filter(matches).length;

  // Keep the current row in view inside the list (never scrolls the page or the rail).
  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const row = list?.querySelector<HTMLElement>('[aria-current="step"]');
      if (!list || !row || list.clientHeight === 0) {
        return;
      }
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      if (top < list.scrollTop) {
        list.scrollTop = top;
      } else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  // A row the jump hid (its decision step comes before it) took the focus with it.
  useLayoutEffect(() => {
    if (!restoreFocus.current) {
      return;
    }
    restoreFocus.current = false;
    const list = listRef.current;
    if (list && !list.contains(document.activeElement)) {
      list.querySelector<HTMLElement>('[aria-current="step"] button')?.focus();
    }
  });

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open !== open) {
      onOpen(event.currentTarget.open);
    }
  };

  return (
    <details className={styles.section} open={open} onToggle={onToggle}>
      <summary className={styles.summary}>
        <span>{m.panel.moves}</span>
        {picked !== null && (
          <span className={styles.filter}>
            {m.panel.movesFilter(tileLabel(m, tileFromKind(picked)), pickCount)}
          </span>
        )}
      </summary>
      <ol ref={listRef} className={styles.list} aria-label={m.panel.moves}>
        {shown.map((row, index) => (
          <MoveItem
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are a fixed list per round
            key={index}
            row={row}
            current={index === current}
            future={row.step > currentStep}
            hidden={!matches(row)}
            showCalled={showRest || row.step < currentStep}
            names={names}
            onActivate={activate}
          />
        ))}
      </ol>
      {(hiddenCount > 0 || showRest) && (
        <div className={styles.rest}>
          <input
            id={restId}
            type="checkbox"
            checked={showRest}
            onChange={(event) => onShowRest(event.currentTarget.checked)}
          />
          <label htmlFor={restId}>{m.panel.movesShowRest}</label>
          {!showRest && <span className={styles.hidden}>{m.panel.movesHidden(hiddenCount)}</span>}
        </div>
      )}
    </details>
  );
}
