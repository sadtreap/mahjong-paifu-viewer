import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readStorage, removeStorage, writeStorage } from "../../storage";
import type { DialogName, Settings } from "../viewer/types";
import {
  blobKind,
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
 * Holds the persistent preferences (one versioned JSON blob in src/storage.ts) and tracks which
 * app dialog is open. A blob of an older version and the legacy "showAllHands" key are migrated
 * into the current blob once; the old key is then deleted. A stored value this version cannot
 * read (a newer version's blob, text that is not JSON) is left alone until a setting changes.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  // What storage holds, so only real changes are written (not the defaults of a first visit).
  const persisted = useRef<string | null>(null);
  persisted.current ??= serializeSettings(settings);

  // Migrate what an older version stored: rewrite its blob in the current form and fold in the old
  // flag. Never over a blob this version cannot read.
  useEffect(() => {
    const kind = blobKind(readStorage(SETTINGS_STORAGE_NAME));
    const legacy = readStorage(LEGACY_SHOW_ALL_HANDS_STORAGE_NAME);
    if (kind === "old" || (legacy !== null && kind !== "unknown")) {
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

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch, version: 2 }));
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
