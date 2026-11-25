import { useI18n } from "../i18n/context";
import styles from "./ShortcutHints.module.css";

/** Visible list of the replay keyboard shortcuts. */
export function ShortcutHints() {
  const { m } = useI18n();
  const rows = [
    { keys: ["←", "→"], label: m.viewer.shortcutStep },
    { keys: ["↑", "↓"], label: m.viewer.shortcutRound },
    { keys: ["Home", "End"], label: m.viewer.shortcutEnds },
  ];
  return (
    <section className={styles.hints} aria-label={m.viewer.shortcuts}>
      <h2 className={styles.heading}>{m.viewer.shortcuts}</h2>
      <dl className={styles.list}>
        {rows.map(({ keys, label }) => (
          <div key={label} className={styles.row}>
            <dt className={styles.keys}>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd className={styles.label}>{label}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>{m.viewer.shortcutsNote}</p>
    </section>
  );
}
