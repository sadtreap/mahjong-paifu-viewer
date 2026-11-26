import { type CSSProperties, memo, type Ref } from "react";
import type { Quad, Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { cx } from "../cx";
import { formatDelta, formatPoints } from "../labels";
import type { Position } from "../navigation";
import type { MatrixCell, MatrixRow, RoundOutcome } from "../viewer/types";
import styles from "./RoundMatrix.module.css";

export interface RoundMatrixProps {
  matrix: readonly MatrixRow[];
  seats: readonly Seat[];
  names: Quad<string>;
  final: Quad<number>;
  currentRound: number;
  currentRowRef: Ref<HTMLTableRowElement>;
  /** Full round names for the buttons' labels (roundLabel); the short label otherwise. */
  roundNames?: readonly string[];
  onSeek(p: Position): void;
}

function outcomeText(m: Messages, outcome: RoundOutcome): string {
  return outcome ? m.panel.outcome[outcome.kind] : "";
}

/** "+12000": signed, without grouping, so it fits a quarter of the rail. */
function compactDelta(locale: string, delta: number): string {
  return new Intl.NumberFormat(locale, { signDisplay: "exceptZero", useGrouping: false }).format(
    delta,
  );
}

function cellLabel(
  m: Messages,
  locale: Parameters<typeof formatDelta>[0],
  round: string,
  name: string,
  cell: MatrixCell,
  outcome: RoundOutcome,
): string {
  const facts: string[] = [];
  if (cell.role === "win") {
    facts.push(outcome?.kind === "tsumo" ? m.panel.facts.tsumoWin : m.panel.facts.ronWin);
  } else if (cell.role === "dealin") {
    facts.push(m.panel.facts.dealtIn);
  } else if (cell.role === "tenpai") {
    facts.push(m.panel.facts.tenpai);
  }
  if (cell.riichi) {
    facts.push(m.panel.facts.riichi);
  }
  const target =
    cell.role === "win"
      ? m.panel.targets.win
      : cell.role === "dealin"
        ? m.panel.targets.dealIn
        : cell.riichi
          ? m.panel.targets.riichi
          : m.panel.targets.start;
  return m.panel.cellLabel(round, name, formatDelta(locale, cell.delta), facts, target);
}

/**
 * Who won and who dealt in, round by round: a row per round (its button goes to the round
 * start), a cell per playing seat with its point change, a glyph for its role (★ won, ▼ dealt in,
 * ○ tenpai) and a riichi stick, each in a column of its own beside the value. A cell goes to the
 * moment that explains it (the win, the discard that dealt in, the riichi, else the round start).
 */
export const RoundMatrix = memo(function RoundMatrix({
  matrix,
  seats,
  names,
  final,
  currentRound,
  currentRowRef,
  roundNames,
  onSeek,
}: RoundMatrixProps) {
  const { m, locale } = useI18n();
  return (
    <table className={styles.matrix}>
      <caption className="sr-only">{m.panel.rounds}</caption>
      <thead>
        <tr>
          <th scope="col" className={styles.roundHead}>
            {m.panel.round}
          </th>
          {seats.map((seat) => (
            <th
              key={seat}
              scope="col"
              title={names[seat]}
              style={{ "--seat": `var(--seat-${seat})` } as CSSProperties}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span aria-hidden="true">{Array.from(names[seat])[0] ?? ""}</span>
              <span className="sr-only">{names[seat]}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row) => {
          const current = row.round === currentRound;
          const name = roundNames?.[row.round] ?? row.label;
          return (
            <tr
              key={row.round}
              ref={current ? currentRowRef : undefined}
              aria-current={current ? "true" : undefined}
              className={cx(current && styles.current)}
            >
              <th scope="row" className={styles.roundCell}>
                <button
                  type="button"
                  className={styles.round}
                  aria-label={m.panel.goToRound(name)}
                  onClick={() => onSeek(row.start)}
                >
                  <b>{row.label}</b>
                  <small>{outcomeText(m, row.outcome)}</small>
                </button>
              </th>
              {seats.map((seat) => {
                const cell = row.cells[seat];
                if (!cell) {
                  return <td key={seat} />;
                }
                return (
                  <td
                    key={seat}
                    className={cx(
                      cell.role === "win" && styles.win,
                      cell.role === "dealin" && styles.dealin,
                      cell.role === "tenpai" && styles.tenpai,
                    )}
                    style={{ "--seat": `var(--seat-${seat})` } as CSSProperties}
                  >
                    <button
                      type="button"
                      className={styles.cell}
                      aria-label={cellLabel(m, locale, name, names[seat], cell, row.outcome)}
                      onClick={() => onSeek(cell.target)}
                    >
                      <span className={styles.marks} aria-hidden="true">
                        {cell.riichi && <span className={styles.stick} />}
                        <span className={styles.glyph} />
                      </span>
                      <span
                        className={cx(
                          styles.value,
                          cell.delta > 0 && styles.gain,
                          cell.delta < 0 && styles.loss,
                          cell.delta === 0 && styles.zero,
                        )}
                      >
                        {compactDelta(locale, cell.delta)}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{m.panel.final}</th>
          {seats.map((seat) => (
            <td key={seat}>{formatPoints(locale, final[seat])}</td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
});
