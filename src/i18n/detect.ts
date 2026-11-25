import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/** Picks the first supported locale from a list of BCP 47 tags such as `navigator.languages`. */
export function matchLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split("-")[0];
    if (isLocale(primary)) {
      return primary;
    }
  }
  return DEFAULT_LOCALE;
}

/** A saved choice wins over the browser languages; anything unrecognized falls through. */
export function resolveInitialLocale(stored: string | null, languages: readonly string[]): Locale {
  return isLocale(stored) ? stored : matchLocale(languages);
}
