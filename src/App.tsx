import styles from "./App.module.css";
import { useI18n } from "./i18n/context";
import { isLocale, LOCALE_LABELS, LOCALES } from "./i18n/locales";

export function App() {
  const { m, locale, setLocale } = useI18n();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>{m.app.title}</h1>
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
      </header>
      <main className={styles.main}>
        <p>{m.app.tagline}</p>
      </main>
    </div>
  );
}
