import { useCallback, useEffect, useRef } from "react";
import styles from "./App.module.css";
import { useI18n } from "./i18n/context";
import { isLocale, LOCALE_LABELS, LOCALES } from "./i18n/locales";
import { DropOverlay } from "./ui/DropOverlay";
import { focusIsLost } from "./ui/dom";
import { ErrorMessage } from "./ui/ErrorMessage";
import { LoadScreen } from "./ui/LoadScreen";
import type { LogSource } from "./ui/logSource";
import { useLogLoader } from "./ui/useLogLoader";
import { useSampleFromQuery } from "./ui/useSampleFromQuery";
import { useWindowDrop } from "./ui/useWindowDrop";
import { useWindowPaste } from "./ui/useWindowPaste";
import { Viewer } from "./ui/Viewer";

export function App() {
  const { m, locale, setLocale } = useI18n();
  const loader = useLogLoader();
  const { game, load, closeGame } = loader;
  const viewerFocusRef = useRef<HTMLElement>(null);
  const loadHeadingRef = useRef<HTMLHeadingElement>(null);
  // Set when the user opens or closes a log while a control has the focus. The control usually goes
  // away with the view (a sample button, the viewer's buttons, "Open another log"), which would
  // drop the focus to the page, so the new view takes it. A startup load (?sample=) leaves it alone.
  const moveFocus = useRef(false);

  const loadFromUser = useCallback(
    (source: LogSource) => {
      moveFocus.current = !focusIsLost();
      void load(source);
    },
    [load],
  );
  const dragging = useWindowDrop(loadFromUser);
  useWindowPaste(loadFromUser);
  useSampleFromQuery(load);

  useEffect(() => {
    if (moveFocus.current && focusIsLost()) {
      (game ? viewerFocusRef : loadHeadingRef).current?.focus();
    }
    moveFocus.current = false;
  }, [game]);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>{m.app.title}</h1>
        <div className={styles.actions}>
          {loader.loading && loader.game && (
            <span className={styles.loading} role="status">
              {m.load.loading}
            </span>
          )}
          {loader.game && (
            <button
              type="button"
              onClick={() => {
                moveFocus.current = true;
                closeGame();
              }}
            >
              {m.app.newLog}
            </button>
          )}
          <label className={styles.language}>
            <span>{m.settings.language}</span>
            <select
              value={locale}
              onChange={(event) => {
                const next = event.target.value;
                if (isLocale(next)) {
                  setLocale(next);
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
      </header>
      <main className={styles.main}>
        {loader.game ? (
          <>
            {loader.error && (
              <div className={styles.banner}>
                <ErrorMessage error={loader.error} onDismiss={loader.dismissError} />
              </div>
            )}
            <Viewer
              key={loader.gameKey}
              game={loader.game}
              start={loader.start}
              focusRef={viewerFocusRef}
            />
          </>
        ) : (
          <LoadScreen
            loading={loader.loading}
            error={loader.error}
            onLoad={loadFromUser}
            onDismissError={loader.dismissError}
            headingRef={loadHeadingRef}
          />
        )}
      </main>
      {dragging && <DropOverlay />}
    </div>
  );
}
