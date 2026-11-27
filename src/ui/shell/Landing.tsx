import { useEffect, useId, useRef } from "react";
import { useI18n } from "../../i18n/context";
import { focusIsLost } from "../dom";
import { Icon } from "../Icon";
import { LanguageSelect } from "../settings/LanguageSelect";
import { DownloadStatus } from "./DownloadStatus";
import styles from "./Landing.module.css";
import { LoadForm, type LoadFormProps } from "./LoadForm";

export interface LandingProps extends LoadFormProps {
  /** The log the address names is on its way: the card shows only that, with a way to stop it. */
  arriving: boolean;
  /** Stops the download of the address's log. */
  onCancel(): void;
}

/**
 * The page before a game is on the table: one card on the dark room with the app's name, what it
 * is, the load form and the language picker. While the log the address names is on its way, the
 * card shows the download status and Cancel instead.
 */
export function Landing({ arriving, onCancel, ...form }: LandingProps) {
  const { m } = useI18n();
  const titleId = useId();
  const languageId = useId();
  const cardRef = useRef<HTMLElement>(null);

  // Cancel goes away with the status (cancelled, failed or superseded): if it had the focus, the
  // card takes it. A removed button reports no blur, so the flag is still set then.
  const cancelFocused = useRef(false);
  useEffect(() => {
    if (!arriving && cancelFocused.current) {
      cancelFocused.current = false;
      if (focusIsLost()) {
        cardRef.current?.focus();
      }
    }
  }, [arriving]);

  return (
    <main className={styles.room}>
      <section ref={cardRef} className={styles.card} aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.head}>
          <h1 id={titleId} className={styles.title}>
            {m.app.title}
          </h1>
          {!arriving && (
            <label htmlFor={languageId} className={styles.language}>
              <Icon name="globe" />
              <span className="sr-only">{m.settings.language}</span>
              <LanguageSelect id={languageId} />
            </label>
          )}
        </div>
        {arriving ? (
          <div className={styles.arriving}>
            <DownloadStatus />
            <button
              type="button"
              onClick={onCancel}
              onFocus={() => {
                cancelFocused.current = true;
              }}
              onBlur={() => {
                cancelFocused.current = false;
              }}
            >
              {m.load.cancel}
            </button>
          </div>
        ) : (
          <>
            <p className={styles.tagline}>{m.app.tagline}</p>
            <LoadForm {...form} />
          </>
        )}
      </section>
    </main>
  );
}
