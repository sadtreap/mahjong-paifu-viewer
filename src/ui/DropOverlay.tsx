import { useI18n } from "../i18n/context";
import styles from "./DropOverlay.module.css";

/** Shown over the whole window while a file is dragged over it. */
export function DropOverlay() {
  const { m } = useI18n();
  return (
    <div className={styles.overlay}>
      <p className={styles.message}>{m.load.dropOverlay}</p>
    </div>
  );
}
