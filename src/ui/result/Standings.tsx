import { useId } from "react";
import type { PlayerCount, Quad } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { formatPoints, standings } from "../labels";
import styles from "./Standings.module.css";

export interface StandingsProps {
  /** The game's final scores. */
  final: Quad<number>;
  names: Quad<string>;
  playerCount: PlayerCount;
}

/** The final standings, after the game's last round: one row per player, ranked. */
export function Standings({ final, names, playerCount }: StandingsProps) {
  const { m, locale } = useI18n();
  const headingId = useId();
  return (
    <div className={styles.standings}>
      <h3 id={headingId} className={styles.heading}>
        {m.standings.heading}
      </h3>
      <table className={styles.table} aria-labelledby={headingId}>
        <thead className="sr-only">
          <tr>
            <th scope="col">{m.standings.rank}</th>
            <th scope="col">{m.result.player}</th>
            <th scope="col">{m.standings.points}</th>
          </tr>
        </thead>
        <tbody>
          {standings(final, playerCount).map(({ seat, score, place }) => (
            <tr key={seat} className={place === 1 ? styles.first : undefined}>
              <td className={styles.place}>{m.standings.place(place)}</td>
              <th scope="row" className={styles.name}>
                {names[seat]}
              </th>
              <td className={styles.score}>{formatPoints(locale, score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
