import type { AutoplaySpeed, Settings, Theme, View } from "../viewer/types";

/** The storage name (see src/storage.ts) of the settings blob. */
export const SETTINGS_STORAGE_NAME = "settings";

/**
 * The storage name of the old stand-alone "Show all hands" flag ("true" / "false"). Read once to
 * seed `showAllHands`, then deleted by whoever persists the settings.
 */
export const LEGACY_SHOW_ALL_HANDS_STORAGE_NAME = "showAllHands";

export const AUTOPLAY_SPEEDS: readonly AutoplaySpeed[] = [0.5, 1, 2, 4];
const VIEWS: readonly View[] = ["3d", "flat"];
const THEMES: readonly Theme[] = ["system", "light", "dark"];

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1,
  view: "3d",
  showAllHands: true,
  dimTsumogiri: true,
  captions: true,
  motion: true,
  showWaits: true,
  // Off by default: marking the tile the player discards next gives the next move away.
  showNextDiscard: false,
  theme: "system",
  clickToStep: true,
  wheelToStep: true,
  charKeys: true,
  autoplaySpeed: 1,
  panelOpen: true,
  movesOpen: false,
  // Off by default: the Moves list stops at the current step, so it does not give the round away.
  movesShowRest: false,
  hintSeen: false,
});

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

const BOOLEAN_KEYS: readonly BooleanKey[] = [
  "showAllHands",
  "dimTsumogiri",
  "captions",
  "motion",
  "showWaits",
  "showNextDiscard",
  "clickToStep",
  "wheelToStep",
  "charKeys",
  "panelOpen",
  "movesOpen",
  "movesShowRest",
  "hintSeen",
];

/** One of `allowed` (compared with ===, so "1" is not 1 and "true" is not true), else null. */
function oneOf<T>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((candidate) => candidate === value) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The blob's fields when it parses as a version 1 settings object, else null. */
function readBlob(raw: string | null): Record<string, unknown> | null {
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isRecord(parsed) && parsed.version === 1 ? parsed : null;
}

/**
 * Reads the stored settings field by field: a missing or invalid field falls back to its default,
 * and only real JSON booleans count as booleans (never "0", "false" or 1). A blob that is not
 * valid JSON or not version 1 is ignored as a whole. `legacyShowAllHands` is the value of the old
 * stand-alone flag; it seeds `showAllHands` when the blob does not set it.
 */
export function parseSettings(raw: string | null, legacyShowAllHands: string | null): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if (legacyShowAllHands === "true" || legacyShowAllHands === "false") {
    settings.showAllHands = legacyShowAllHands === "true";
  }
  const blob = readBlob(raw);
  if (blob === null) {
    return settings;
  }
  for (const key of BOOLEAN_KEYS) {
    const value = blob[key];
    if (typeof value === "boolean") {
      settings[key] = value;
    }
  }
  settings.view = oneOf(blob.view, VIEWS) ?? settings.view;
  settings.theme = oneOf(blob.theme, THEMES) ?? settings.theme;
  settings.autoplaySpeed = oneOf(blob.autoplaySpeed, AUTOPLAY_SPEEDS) ?? settings.autoplaySpeed;
  return settings;
}

/** The settings as the JSON blob `parseSettings` reads: known fields only, in a fixed order. */
export function serializeSettings(settings: Settings): string {
  const known: Settings = { ...DEFAULT_SETTINGS };
  for (const key of BOOLEAN_KEYS) {
    known[key] = settings[key];
  }
  known.view = settings.view;
  known.theme = settings.theme;
  known.autoplaySpeed = settings.autoplaySpeed;
  return JSON.stringify(known);
}
