import type { Quad } from "../core/model";
import { SEATS } from "../core/model";
import { useI18n } from "../i18n/context";
import { cx } from "./cx";
import styles from "./DeltaTable.module.css";
import { formatDelta } from "./labels";

/** Point changes per player. */
export function DeltaTable({ deltas, names }: { deltas: Quad<number>; names: Quad<string> }) {
  const { m, locale } = useI18n();
  return (
    <table className={styles.table}>
      <caption className="sr-only">{m.result.deltas}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{m.result.player}</th>
          <th scope="col">{m.result.change}</th>
        </tr>
      </thead>
      <tbody>
        {SEATS.map((seat) => (
          <tr key={seat}>
            <th scope="row" className={styles.name}>
              {names[seat]}
            </th>
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
