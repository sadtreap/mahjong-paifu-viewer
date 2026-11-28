import type { AutoplaySpeed, Settings } from "../viewer/types";

/** The storage name (see src/storage.ts) of the settings blob. */
export const SETTINGS_STORAGE_NAME = "settings";

/**
 * The storage name of the old stand-alone "Show all hands" flag ("true" / "false"). Read once to
 * seed `showAllHands`, then deleted by whoever persists the settings.
 */
export const LEGACY_SHOW_ALL_HANDS_STORAGE_NAME = "showAllHands";

export const AUTOPLAY_SPEEDS: readonly AutoplaySpeed[] = [0.5, 1, 2, 4];

/** The version the app writes, and the older ones it still reads (see readBlob). */
const VERSION = 3;
const OLD_VERSIONS: readonly unknown[] = [1, 2];

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: VERSION,
  showAllHands: true,
  showWaits: true,
  charKeys: true,
  autoplaySpeed: 1,
});

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

const BOOLEAN_KEYS: readonly BooleanKey[] = ["showAllHands", "showWaits", "charKeys"];

/** One of `allowed` (compared with ===, so "1" is not 1 and "true" is not true), else null. */
function oneOf<T>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((candidate) => candidate === value) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The blob's fields when it parses as a settings object of a known version, else null. Versions 1
 * and 2 stored today's four fields under the same names (next to others that no longer exist,
 * such as version 2's choice between a 3D and a flat table), so every version is read alike.
 */
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
  return isRecord(parsed) && (parsed.version === VERSION || OLD_VERSIONS.includes(parsed.version))
    ? parsed
    : null;
}

/**
 * What a stored blob is to this version of the app: "none" (nothing stored), "current", "old"
 * (version 1 or 2, which is rewritten in the current form when it is loaded) or "unknown" (not JSON, or
 * a version this app does not know; it is read as the defaults and left as stored until a setting
 * changes).
 */
export function blobKind(raw: string | null): "none" | "current" | "old" | "unknown" {
  if (raw === null) {
    return "none";
  }
  const blob = readBlob(raw);
  if (blob === null) {
    return "unknown";
  }
  return blob.version === VERSION ? "current" : "old";
}

/**
 * Reads the stored settings field by field: a missing or invalid field falls back to its default,
 * and only real JSON booleans count as booleans (never "0", "false" or 1). A blob that is not
 * valid JSON or not of a known version is ignored as a whole. `legacyShowAllHands` is the value of
 * the old stand-alone flag; it seeds `showAllHands` when the blob does not set it.
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
  settings.autoplaySpeed = oneOf(blob.autoplaySpeed, AUTOPLAY_SPEEDS) ?? settings.autoplaySpeed;
  return settings;
}

/** The settings as the JSON blob `parseSettings` reads: known fields only, in a fixed order. */
export function serializeSettings(settings: Settings): string {
  const known: Settings = { ...DEFAULT_SETTINGS };
  for (const key of BOOLEAN_KEYS) {
    known[key] = settings[key];
  }
  known.autoplaySpeed = settings.autoplaySpeed;
  return JSON.stringify(known);
}
