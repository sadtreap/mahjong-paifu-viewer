import { useId } from "react";
import type { PlayerCount, Quad } from "../core/model";
import { useI18n } from "../i18n/context";
import styles from "./FinalStandings.module.css";
import { formatPoints, standings } from "./labels";

export interface FinalStandingsProps {
  scores: Quad<number>;
  names: Quad<string>;
  /** Three-player games rank seats 0-2 only (seat 3 is the empty chair). */
  playerCount?: PlayerCount;
}

/** Final ranking after the last round (inside the result card, which draws the box). */
export function FinalStandings({ scores, names, playerCount = 4 }: FinalStandingsProps) {
  const { m, locale } = useI18n();
  const headingId = useId();
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {m.standings.heading}
      </h2>
      <ol className={styles.list}>
        {standings(scores, playerCount).map(({ seat, score, place }) => (
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
