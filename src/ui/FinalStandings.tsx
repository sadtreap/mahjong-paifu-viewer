import { useId } from "react";
import type { Quad } from "../core/model";
import { useI18n } from "../i18n/context";
import styles from "./FinalStandings.module.css";
import { formatPoints, standings } from "./labels";

/** Final ranking after the last round. */
export function FinalStandings({ scores, names }: { scores: Quad<number>; names: Quad<string> }) {
  const { m, locale } = useI18n();
  const headingId = useId();
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {m.standings.heading}
      </h2>
      <ol className={styles.list}>
        {standings(scores).map(({ seat, score, place }) => (
          <li key={seat} className={styles.row}>
            <span className={styles.place}>{m.standings.place(place)}</span>
            <span className={styles.name}>{names[seat]}</span>
            <span className={styles.score}>{formatPoints(locale, score)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
