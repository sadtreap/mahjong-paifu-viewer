import type { Quad, Seat } from "../core/model";
import { SEATS } from "../core/model";
import { useI18n } from "../i18n/context";
import styles from "./ViewOptions.module.css";

export interface ViewOptionsProps {
  names: Quad<string>;
  pov: Seat;
  showAllHands: boolean;
  onPov: (seat: Seat) => void;
  onShowAllHands: (show: boolean) => void;
}

/** Point-of-view seat (rotates the table) and whether other players' hands are face up. */
export function ViewOptions({ names, pov, showAllHands, onPov, onShowAllHands }: ViewOptionsProps) {
  const { m } = useI18n();
  return (
    <div className={styles.options}>
      <label className={styles.field}>
        <span className={styles.label}>{m.viewer.pov}</span>
        <select
          value={pov}
          onChange={(event) => {
            const seat = Number(event.target.value);
            if (SEATS.includes(seat as Seat)) {
              onPov(seat as Seat);
            }
          }}
        >
          {SEATS.map((seat) => (
            <option key={seat} value={seat}>
              {names[seat]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={showAllHands}
          onChange={(event) => onShowAllHands(event.target.checked)}
        />
        <span>{m.viewer.showAllHands}</span>
      </label>
    </div>
  );
}
