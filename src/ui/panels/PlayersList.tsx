import type { CSSProperties } from "react";
import type { Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { formatPoints } from "../labels";
import type { PlayerRow } from "../viewer/types";
import styles from "./PlayersList.module.css";

export interface PlayersListProps {
  players: readonly PlayerRow[];
  pov: Seat;
  onPov(seat: Seat): void;
}

/**
 * The Players section: one line per playing seat (wind, name, rating and rank, riichi stick,
 * score and place), each a toggle button that views the table from that seat. When the line is
 * short the rank goes first, then the rating, and only then is the name cut.
 */
export function PlayersList({ players, pov, onPov }: PlayersListProps) {
  const { m, locale } = useI18n();
  return (
    <section className={styles.section} aria-label={m.panel.players}>
      <h3 className={styles.heading}>{m.panel.players}</h3>
      <ol className={styles.list}>
        {players.map((player) => (
          <li key={player.seat}>
            <button
              type="button"
              className={styles.row}
              aria-pressed={player.seat === pov}
              title={m.table.viewFrom(player.name)}
              style={{ "--seat": `var(--seat-${player.seat})` } as CSSProperties}
              onClick={() => onPov(player.seat)}
            >
              <span className={cx(styles.wind, player.dealer && styles.dealer)} aria-hidden="true">
                {m.board.windsShort[player.wind]}
              </span>
              <span className="sr-only">{m.round.winds[player.wind]}</span>
              {player.dealer && <span className="sr-only">{m.board.dealer}</span>}
              {/* Wrapping drops the last items first: the rank, then the rating; the name truncates. */}
              <span className={styles.who}>
                <b className={styles.name}>{player.name}</b>
                {player.rating && <small className={styles.meta}>{player.rating}</small>}
                {player.rank && <small className={styles.meta}>{player.rank}</small>}
              </span>
              {player.riichi ? (
                <span className={styles.stick} role="img" aria-label={m.board.riichi} />
              ) : (
                <span />
              )}
              <span className={styles.score}>
                {formatPoints(locale, player.score)}
                <span className={styles.place}>{m.standings.place(player.place)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
