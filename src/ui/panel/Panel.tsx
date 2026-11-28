import type { ReactNode } from "react";
import { useI18n } from "../../i18n/context";
import styles from "./Panel.module.css";

export interface PanelProps {
  children: ReactNode;
}

/**
 * The panel beside the table (under it on a narrow screen): everything about the game that is
 * words, top to bottom: the round, its result when it has ended, the players, the rounds and the
 * app's actions. Its sections are divided by hairlines; the list of rounds takes the room that is
 * left and scrolls inside when the game is long.
 */
export function Panel({ children }: PanelProps) {
  const { m } = useI18n();
  return (
    <aside className={styles.panel} aria-label={m.panel.label}>
      {children}
    </aside>
  );
}
