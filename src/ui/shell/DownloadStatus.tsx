import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import styles from "./DownloadStatus.module.css";

/** "Downloading the log…" with a turning ring, announced when it appears. */
export function DownloadStatus({ className }: { className?: string }) {
  const { m } = useI18n();
  return (
    <p className={cx(styles.status, className)} role="status">
      <span className={styles.ring} aria-hidden="true" />
      {m.load.downloading}
    </p>
  );
}
