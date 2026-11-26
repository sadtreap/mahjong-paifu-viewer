import type { PlayerCount, Quad } from "../core/model";
import { activeSeats } from "../core/players";
import { useI18n } from "../i18n/context";
import { cx } from "./cx";
import styles from "./DeltaTable.module.css";
import { formatDelta, formatPoints } from "./labels";

export interface DeltaTableProps {
  deltas: Quad<number>;
  names: Quad<string>;
  /** Three-player games list seats 0-2 only (seat 3 is the empty chair). */
  playerCount?: PlayerCount;
  /** Each seat's points before these changes: adds a "before → after" column. */
  before?: Quad<number>;
}

/** Point changes per playing seat, optionally with each score before and after. */
export function DeltaTable({ deltas, names, playerCount = 4, before }: DeltaTableProps) {
  const { m, locale } = useI18n();
  return (
    <table className={cx(styles.table, before && styles.withScores)}>
      <caption className="sr-only">{m.result.deltas}</caption>
      {before && (
        <colgroup>
          <col className={styles.nameColumn} />
          <col />
          <col className={styles.deltaColumn} />
        </colgroup>
      )}
      <thead className="sr-only">
        <tr>
          <th scope="col">{m.result.player}</th>
          {before && <th scope="col">{m.standings.points}</th>}
          <th scope="col">{m.result.change}</th>
        </tr>
      </thead>
      <tbody>
        {activeSeats(playerCount).map((seat) => (
          <tr key={seat}>
            <th scope="row" className={styles.name}>
              {names[seat]}
            </th>
            {before && (
              <td className={styles.scores}>
                {m.result.beforeAfter(
                  formatPoints(locale, before[seat]),
                  formatPoints(locale, before[seat] + deltas[seat]),
                )}
              </td>
            )}
            <td
              className={cx(
                styles.delta,
                deltas[seat] > 0 && styles.gain,
                deltas[seat] < 0 && styles.loss,
              )}
            >
              {formatDelta(locale, deltas[seat])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
