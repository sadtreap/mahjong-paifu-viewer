import { memo } from "react";
import { useI18n } from "../../i18n/context";
import styles from "./Console.module.css";

/** Marks the console's box (the pond tooltip sits over it: the only felt without tiles). */
export const CONSOLE_ATTR = "data-console";

export interface ConsoleProps {
  /** Round name without honba, e.g. "East 3" (honba is in the HUD). */
  roundName: string;
  wallRemaining: number;
  onRoundList(): void;
}

/**
 * The raised console in the middle of the table (not rotated): the round name, a button that
 * opens the round list, and the tiles left in the live wall.
 */
export const Console = memo(function Console({
  roundName,
  wallRemaining,
  onRoundList,
}: ConsoleProps) {
  const { m } = useI18n();
  return (
    <div className={styles.console} {...{ [CONSOLE_ATTR]: "" }}>
      <div className={styles.screen}>
        <button
          type="button"
          className={styles.round}
          aria-label={m.table.openRoundList(roundName)}
          onClick={onRoundList}
        >
          {roundName}
        </button>
        <div className={styles.left}>
          <span className="sr-only">{m.board.wall(wallRemaining)}</span>
          <span aria-hidden="true">{m.board.wallShort(wallRemaining)}</span>
        </div>
      </div>
    </div>
  );
});
