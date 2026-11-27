import { createContext, use } from "react";
import type { DialogName, SettingsContextValue } from "../viewer/types";

/** What SettingsProvider shares: the settings, plus which app dialog is open. */
export interface SettingsStore extends SettingsContextValue {
  /** The open app dialog (settings, help, open), or null. */
  dialog: DialogName | null;
  closeDialog(): void;
}

export const SettingsContext = createContext<SettingsStore | null>(null);

function useStore(): SettingsStore {
  const store = use(SettingsContext);
  if (!store) {
    throw new Error("useSettings must be used inside <SettingsProvider>");
  }
  return store;
}

/** The persistent preferences and the way to change them (one versioned blob in storage). */
export function useSettings(): SettingsContextValue {
  return useStore();
}

/** Which app dialog is open, for the shell that renders them. */
export function useDialogs(): Pick<SettingsStore, "dialog" | "openDialog" | "closeDialog"> {
  const { dialog, openDialog, closeDialog } = useStore();
  return { dialog, openDialog, closeDialog };
}
