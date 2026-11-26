import { useI18n } from "../../i18n/context";
import { Icon } from "../Icon";
import type { BackTarget } from "../viewer/types";
import styles from "./BackChip.module.css";

export interface BackChipProps {
  target: BackTarget;
  /** history.back(): return to where the last jump came from. */
  onBack(): void;
}

/** "↩ E1 · turn 6 ⌫" in the status line: back to where the last jump came from (icon only on phones). */
export function BackChip({ target, onBack }: BackChipProps) {
  const { m } = useI18n();
  return (
    <button
      type="button"
      className={styles.chip}
      aria-label={m.transport.back(target.label)}
      title={m.transport.backTitle}
      onClick={onBack}
    >
      <Icon name="back" className={styles.icon} />
      <span className={styles.label}>{target.label}</span>
      <span className={styles.key} aria-hidden="true">
        ⌫
      </span>
    </button>
  );
}
