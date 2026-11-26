import { useI18n } from "../../i18n/context";
import { Icon } from "../Icon";
import styles from "./PanelHeader.module.css";

export interface PanelHeaderProps {
  /** The game's rules (rulesLabel). */
  title: string;
  /** Format and date (sourceLabel). */
  source: string;
  /** Shows the close button (column and sheet). */
  onClose?: () => void;
}

/** The rail's header: the game title, where the log comes from, and the close button. */
export function PanelHeader({ title, source, onClose }: PanelHeaderProps) {
  const { m } = useI18n();
  return (
    <header className={styles.head}>
      <div className={styles.titles}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.source}>{source}</p>
      </div>
      {onClose && (
        <button
          type="button"
          className={styles.close}
          aria-label={m.panel.hide}
          title={m.panel.hide}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      )}
    </header>
  );
}
