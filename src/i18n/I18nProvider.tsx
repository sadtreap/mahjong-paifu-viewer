import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { readStorage, writeStorage } from "../storage";
import { I18nContext, type I18nContextValue } from "./context";
import { resolveInitialLocale } from "./detect";
import type { Locale } from "./locales";
import { MESSAGES } from "./messages";

const STORAGE_NAME = "locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveInitialLocale(readStorage(STORAGE_NAME), navigator.languages),
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStorage(STORAGE_NAME, next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, m: MESSAGES[locale] }),
    [locale, setLocale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = value.m.app.title;
  }, [locale, value.m]);

  return <I18nContext value={value}>{children}</I18nContext>;
}
