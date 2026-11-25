import type { Wind } from "../core/model";
import { useI18n } from "../i18n/context";
import { cx } from "./cx";
import { formatPoints } from "./labels";
import styles from "./SeatInfo.module.css";

export interface SeatInfoProps {
  wind: Wind;
  name: string;
  score: number;
  /** The seat acting in the current step. */
  active: boolean;
}

/** Wind, name and score of one seat, shown along its edge of the center panel. */
export function SeatInfo({ wind, name, score, active }: SeatInfoProps) {
  const { m, locale } = useI18n();
  const dealer = wind === 0;
  return (
    <div className={cx(styles.info, active && styles.active)}>
      <span className={cx(styles.wind, dealer && styles.dealer)} aria-hidden="true">
        {m.board.windsShort[wind]}
      </span>
      <span className="sr-only">
        {m.round.winds[wind]}
        {dealer ? ` (${m.board.dealer})` : ""}
      </span>
      <span className={styles.name}>{name}</span>
      <span className={styles.score}>{formatPoints(locale, score)}</span>
    </div>
  );
}
