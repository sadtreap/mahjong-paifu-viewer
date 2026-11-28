import { type ReactNode, useEffect, useId, useRef } from "react";
import type { Quad, Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { formatDelta, roundLabel } from "../labels";
import type { RoundListProps, RoundSummary } from "../viewer/types";
import styles from "./RoundList.module.css";

/** Stand-ins for names in a message, from Unicode's private use area. */
const SLOT = /([\uE000-\uE0FF])/;

/** A name of at most this many columns is never cut short (a CJK character takes two). */
const SHORT_NAME_COLUMNS = 8;

function isShortName(name: string): boolean {
  let columns = 0;
  for (const char of name) {
    columns += (char.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1;
  }
  return columns <= SHORT_NAME_COLUMNS;
}

/**
 * A message with names in it, each name in an element of its own (so a long name can be cut short
 * without losing the words around it, and a short one beside it stays whole).
 */
function withNames(message: (...names: string[]) => string, names: readonly string[]): ReactNode[] {
  const slots = names.map((_, index) => String.fromCharCode(0xe000 + index));
  return message(...slots)
    .split(SLOT)
    .filter((piece) => piece !== "")
    .map((piece, index) => {
      const name = names[slots.indexOf(piece)];
      return (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one message never reorder
          key={index}
          className={name === undefined ? styles.words : styles.who}
          data-short={name !== undefined && isShortName(name) ? "" : undefined}
        >
          {name ?? piece}
        </span>
      );
    });
}

interface RowProps {
  round: RoundSummary;
  current: boolean;
  names: Quad<string>;
  /** The viewed player, whose point change in the round the row shows. */
  pov: Seat;
  onChoose(): void;
}

/** One round: its name, how it ended ("B ron off C") and the viewed player's change. */
function Row({ round, current, names, pov, onChoose }: RowProps) {
  const { m, locale } = useI18n();
  const { outcome } = round;
  const delta = round.deltas[pov];
  return (
    <button
      type="button"
      data-variant="ghost"
      className={styles.row}
      aria-current={current ? "true" : undefined}
      data-round={round.index}
      onClick={onChoose}
    >
      <span className={styles.round}>{roundLabel(m, round)}</span>
      <span className={styles.outcome}>
        {outcome?.kind === "draw" && m.rounds.draw}
        {outcome?.kind === "win" &&
          outcome.wins.map((win) => (
            <span key={win.seat} className={styles.win}>
              {win.from === win.seat
                ? withNames(m.rounds.tsumo, [names[win.seat]])
                : withNames(m.rounds.ron, [names[win.seat], names[win.from]])}
            </span>
          ))}
      </span>
      {delta !== 0 && (
        <span className={styles.delta} data-sign={delta > 0 ? "gain" : "loss"}>
          <span className="sr-only">{names[pov]} </span>
          {formatDelta(locale, delta)}
        </span>
      )}
    </button>
  );
}

/**
 * The game's rounds, always in view: one row per round that jumps to that round's start, and a
 * last row that jumps to the game's last step, where the final standings are. The round on the
 * table is marked. Each row shows the viewed player's point change in that round.
 */
export function RoundList({ rounds, current, names, pov, onRound, onFinal }: RoundListProps) {
  const { m } = useI18n();
  const headingId = useId();
  const listRef = useRef<HTMLElement>(null);
  // Where the list scrolls inside itself (a long game beside the table), the round on the table
  // is kept in view. Only the list moves, never the page.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-round="${current}"]`);
    if (!list || !row || list.scrollHeight <= list.clientHeight) {
      return;
    }
    // The heading stays at the list's top (it is sticky): a row has to clear it.
    const head = list.firstElementChild instanceof HTMLElement ? list.firstElementChild : null;
    const top = row.offsetTop - list.offsetTop;
    const clear = head?.offsetHeight ?? 0;
    if (top - clear < list.scrollTop) {
      list.scrollTop = top - clear;
    } else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + row.offsetHeight - list.clientHeight;
    }
  }, [current]);
  return (
    <section ref={listRef} className={styles.rounds} aria-labelledby={headingId} data-fill="">
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading}>
          {m.rounds.label}
        </h2>
        {/* Whose changes the numbers are; each row says so to screen readers itself. */}
        <span className={styles.whose} aria-hidden="true">
          {m.rounds.changeFor(names[pov])}
        </span>
      </div>
      {rounds.map((round) => (
        <Row
          key={round.index}
          round={round}
          current={round.index === current}
          names={names}
          pov={pov}
          onChoose={() => onRound(round.index)}
        />
      ))}
      <button type="button" data-variant="ghost" className={styles.final} onClick={onFinal}>
        {m.rounds.final}
      </button>
    </section>
  );
}
