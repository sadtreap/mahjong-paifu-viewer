import { createContext, use } from "react";
import type { Locale } from "./locales";
import type { Messages } from "./messages";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Messages for the current locale. */
  m: Messages;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const value = use(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}
