import type { Ref } from "react";
import type { GameLog, Quad, Seat } from "../core/model";
import { SEATS } from "../core/model";
import { useI18n } from "../i18n/context";
import { cx } from "./cx";
import styles from "./GameHeader.module.css";
import { formatPoints, rankLabel, rulesLabel } from "./labels";
import { seatWind } from "./layout";

export interface GameHeaderProps {
  game: GameLog;
  names: Quad<string>;
  scores: Quad<number>;
  dealer: Seat;
  pov: Seat;
  /** The section, which takes focus (programmatically only) when a game opens. */
  sectionRef?: Ref<HTMLElement>;
}

/** Rules, log format and the players with their current wind and score. */
export function GameHeader({ game, names, scores, dealer, pov, sectionRef }: GameHeaderProps) {
  const { m, locale } = useI18n();
  return (
    <section
      ref={sectionRef}
      className={styles.header}
      aria-label={m.viewer.gameInfo}
      tabIndex={-1}
    >
      <p className={styles.meta}>
        <span className={styles.rules}>{rulesLabel(m, game.rules)}</span>
        <span className={styles.format}>{m.viewer.formats[game.format]}</span>
      </p>
      <ol className={styles.players}>
        {SEATS.map((seat) => {
          const player = game.players[seat];
          const rank = rankLabel(m, player);
          const wind = seatWind(seat, dealer);
          return (
            <li key={seat} className={cx(styles.player, seat === pov && styles.pov)}>
              <span className={cx(styles.wind, wind === 0 && styles.dealer)} aria-hidden="true">
                {m.board.windsShort[wind]}
              </span>
              <span className="sr-only">{m.round.winds[wind]}</span>
              <span className={styles.name}>{names[seat]}</span>
              {(rank || player.rating !== undefined) && (
                <span className={styles.rank}>
                  {[
                    rank,
                    player.rating === undefined ? "" : m.viewer.rating(Math.round(player.rating)),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              )}
              <span className={styles.score}>{formatPoints(locale, scores[seat])}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
