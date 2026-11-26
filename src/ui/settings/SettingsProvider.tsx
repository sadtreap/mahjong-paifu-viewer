import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readStorage, removeStorage, writeStorage } from "../../storage";
import type { DialogName, Settings, Theme } from "../viewer/types";
import {
  DEFAULT_SETTINGS,
  LEGACY_SHOW_ALL_HANDS_STORAGE_NAME,
  parseSettings,
  SETTINGS_STORAGE_NAME,
  serializeSettings,
} from "./settings";
import { SettingsContext, type SettingsStore } from "./useSettings";

/** Reads the stored settings, folding in the old stand-alone "Show all hands" flag. */
function loadSettings(): Settings {
  return parseSettings(
    readStorage(SETTINGS_STORAGE_NAME),
    readStorage(LEGACY_SHOW_ALL_HANDS_STORAGE_NAME),
  );
}

/**
 * Applies the theme to the page: `data-theme` on <html> picks light or dark in index.css, and no
 * attribute follows the system.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

/**
 * Holds the persistent preferences (one versioned JSON blob in src/storage.ts), applies the theme
 * and tracks which app dialog is open. The legacy "showAllHands" key is migrated into the blob
 * once, then deleted.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  // What storage holds, so only real changes are written (not the defaults of a first visit).
  const persisted = useRef<string | null>(null);
  persisted.current ??= serializeSettings(settings);

  // Migrate the old flag: the blob now carries its value, so the old key can go.
  useEffect(() => {
    if (readStorage(LEGACY_SHOW_ALL_HANDS_STORAGE_NAME) !== null) {
      writeStorage(SETTINGS_STORAGE_NAME, serializeSettings(loadSettings()));
      removeStorage(LEGACY_SHOW_ALL_HANDS_STORAGE_NAME);
    }
  }, []);

  useEffect(() => {
    const blob = serializeSettings(settings);
    if (blob !== persisted.current) {
      writeStorage(SETTINGS_STORAGE_NAME, blob);
      persisted.current = blob;
    }
  }, [settings]);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch, version: 1 }));
  }, []);

  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);

  const openDialog = useCallback((name: DialogName) => setDialog(name), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const value = useMemo<SettingsStore>(
    () => ({ settings, update, reset, openDialog, dialog, closeDialog }),
    [settings, update, reset, openDialog, dialog, closeDialog],
  );

  return <SettingsContext value={value}>{children}</SettingsContext>;
}
