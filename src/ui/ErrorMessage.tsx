import { useI18n } from "../i18n/context";
import styles from "./ErrorMessage.module.css";
import { Icon } from "./Icon";
import type { LoadError } from "./loadErrors";
import { tenhouLogDataUrl } from "./tenhouLink";

/** The tool that converts a Mahjong Soul log to tenhou.net/6 JSON. */
const TENSOUL_URL = "https://github.com/Equim-chan/tensoul";

export interface ErrorMessageProps {
  error: LoadError;
}

/**
 * A load error as one sentence in the user's language. Where a page helps, a link to it follows:
 * the log data on tenhou.net for a Tenhou log that did not arrive, the converter for a Mahjong Soul
 * link.
 */
export function ErrorMessage({ error }: ErrorMessageProps) {
  const { m } = useI18n();
  const link =
    error.code === "mahjongSoul"
      ? { href: TENSOUL_URL, label: m.errors.tensoulLink }
      : error.logId !== null
        ? { href: tenhouLogDataUrl(error.logId), label: m.errors.logDataLink }
        : null;
  return (
    <p className={styles.error} role="alert">
      <Icon name="alert" className={styles.icon} />
      <span>
        {m.errors.codes[error.code]}
        {link && (
          <>
            {" "}
            <a className={styles.link} href={link.href} target="_blank" rel="noreferrer">
              {link.label}
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> {m.errors.newTab}</span>
            </a>
          </>
        )}
      </span>
    </p>
  );
}
