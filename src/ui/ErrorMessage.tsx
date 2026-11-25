import { useRef } from "react";
import { useI18n } from "../i18n/context";
import { nextTabbable } from "./dom";
import styles from "./ErrorMessage.module.css";
import type { LoadError } from "./loadErrors";
import { tenhouLogDataUrl } from "./tenhouLink";

export interface ErrorMessageProps {
  error: LoadError;
  onDismiss?: () => void;
}

/**
 * A load error in the user's language. For a link it explains how to get the log data instead, and
 * for a Tenhou link it shows the log data page to save by hand.
 */
export function ErrorMessage({ error, onDismiss }: ErrorMessageProps) {
  const { m } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const dismiss = () => {
    // The message and its button disappear; hand the focus to the next control first.
    const next = ref.current ? nextTabbable(ref.current) : null;
    next?.focus();
    onDismiss?.();
  };
  const isLink = error.code === "urlOnly" || error.code === "tenhouFetchFailed";
  const dataUrl = isLink && error.logId ? tenhouLogDataUrl(error.logId) : null;
  return (
    <div ref={ref} className={styles.error} role="alert">
      <div className={styles.body}>
        <p className={styles.title}>{m.errors.title}</p>
        <p className={styles.message}>{m.errors.codes[error.code]}</p>
        {error.code === "urlOnly" && (
          <ul className={styles.help}>
            {m.errors.linkHelp.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {error.code === "tenhouFetchFailed" && dataUrl && (
          <p className={styles.help}>{m.errors.tenhouSaveHelp}</p>
        )}
        {dataUrl && (
          <p className={styles.message}>
            {m.errors.logDataLink}{" "}
            <a className={styles.link} href={dataUrl} target="_blank" rel="noreferrer">
              {dataUrl}
            </a>
          </p>
        )}
      </div>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={dismiss}>
          {m.errors.dismiss}
        </button>
      )}
    </div>
  );
}
