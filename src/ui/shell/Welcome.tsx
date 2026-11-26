import { useEffect, useId, useRef } from "react";
import { useI18n } from "../../i18n/context";
import { isLocale, LOCALE_LABELS, LOCALES } from "../../i18n/locales";
import { Icon } from "../Icon";
import type { WelcomeProps } from "../viewer/types";
import { FileButton, FormatNotes, SampleButtons } from "./LoadControls";
import styles from "./Welcome.module.css";

export interface WelcomeCardProps extends WelcomeProps {
  /**
   * False when there is no sample under the card to explore (it failed to load): then the card
   * cannot be dismissed and has no "Explore the sample" button. Default true.
   */
  canExplore?: boolean;
}

/**
 * The first-visit card over the dimmed sample table: open a file, paste a link or log, or pick a
 * sample. Dropping a file and pasting anywhere work as well (the app's window handlers). Esc or
 * "Explore the sample" dismiss it; the viewer also dismisses it on the first table click, which
 * steps (the main gesture, taught by doing). It renders its own scrim over the stage.
 */
export function Welcome({
  loading,
  error,
  onOpenFile,
  onPaste,
  onSample,
  onDismiss,
  canExplore = true,
}: WelcomeCardProps) {
  const { m, locale, setLocale } = useI18n();
  const titleId = useId();
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!canExplore) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof Element && event.target.closest("dialog[open]"))
      ) {
        return;
      }
      onDismissRef.current();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [canExplore]);

  return (
    <>
      <div className={styles.scrim} aria-hidden="true" />
      <section
        className={styles.card}
        data-gesture="ignore"
        aria-labelledby={titleId}
        aria-busy={loading}
      >
        <h1 id={titleId} className={styles.title}>
          {m.app.title}
        </h1>
        <p className={styles.lede}>{m.welcome.lede}</p>
        {loading && (
          <p className={styles.loading} role="status">
            {m.load.loading}
          </p>
        )}
        {error}
        <div className={styles.drop}>
          <Icon name="open" className={styles.dropIcon} />
          {m.welcome.drop}
        </div>
        <div className={styles.row}>
          <FileButton label={m.welcome.openFile} primary disabled={loading} onFile={onOpenFile} />
          <button type="button" disabled={loading} onClick={onPaste}>
            {m.welcome.paste}
          </button>
        </div>
        <SampleButtons className={styles.samples} disabled={loading} onSample={onSample} />
        <FormatNotes />
        <div className={styles.footer}>
          {canExplore && (
            <button type="button" className={styles.explore} onClick={onDismiss}>
              {m.welcome.explore}
            </button>
          )}
          <label className={styles.language}>
            <span>{m.settings.language}</span>
            <select
              value={locale}
              onChange={(event) => {
                if (isLocale(event.target.value)) {
                  setLocale(event.target.value);
                }
              }}
            >
              {LOCALES.map((value) => (
                <option key={value} value={value} lang={value}>
                  {LOCALE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    </>
  );
}
