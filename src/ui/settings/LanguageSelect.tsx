import { useI18n } from "../../i18n/context";
import { isLocale, LOCALE_LABELS, LOCALES } from "../../i18n/locales";
import styles from "./LanguageSelect.module.css";

export interface LanguageSelectProps {
  /** The id its <label htmlFor> names. */
  id: string;
}

/** The language picker, each language named in itself; the I18nProvider keeps the choice. */
export function LanguageSelect({ id }: LanguageSelectProps) {
  const { locale, setLocale } = useI18n();
  return (
    <select
      id={id}
      className={styles.select}
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
  );
}
