import { useI18n } from "../../i18n/context";
import styles from "./ShowResultChip.module.css";

export interface ShowResultChipProps {
  onShowResult(): void;
}

/**
 * "Show result" in the status line while the overlay result card is hidden (End shows it too).
 * It lives in the dock, never on the felt, so it covers no tile.
 */
export function ShowResultChip({ onShowResult }: ShowResultChipProps) {
  const { m } = useI18n();
  return (
    <button type="button" className={styles.chip} onClick={onShowResult}>
      {m.table.showResult}
    </button>
  );
}
