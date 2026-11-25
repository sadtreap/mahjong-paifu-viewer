import type { LogSource } from "./logSource";
import type { Position } from "./navigation";

/** Sample logs bundled in `public/samples` (see the README there for sources and licenses). */
export const SAMPLE_IDS = ["tenhou-json"] as const;

export type SampleId = (typeof SAMPLE_IDS)[number];

const SAMPLE_FILES: Record<SampleId, string> = {
  "tenhou-json": "ranked_game.json",
};

export function isSampleId(value: string): value is SampleId {
  return (SAMPLE_IDS as readonly string[]).includes(value);
}

/** Where a sample is served. `base` is the app's base URL, which always ends with a slash. */
export function sampleUrl(id: SampleId, base: string = import.meta.env.BASE_URL): string {
  return `${base}samples/${SAMPLE_FILES[id]}`;
}

export function sampleSource(id: SampleId): LogSource {
  return { kind: "url", url: sampleUrl(id) };
}

/** A sample to open on startup, from the page's query string. */
export interface SampleRequest {
  id: SampleId;
  /** Where to open it, as 0-based indexes that still have to be clamped to the game. */
  start: Position;
}

/**
 * Reads `?sample=<id>&round=<n>&step=<n>`. Round and step are 1-based, like the round list and the
 * step counter; a missing or invalid value means the first one. Returns null without a known sample.
 */
export function parseSampleQuery(search: string): SampleRequest | null {
  const params = new URLSearchParams(search);
  const id = params.get("sample");
  if (id === null || !isSampleId(id)) {
    return null;
  }
  return {
    id,
    start: {
      round: (parseInteger(params.get("round")) ?? 1) - 1,
      step: (parseInteger(params.get("step")) ?? 1) - 1,
    },
  };
}

/** A whole number written in decimal digits, with an optional sign; anything else is null. */
function parseInteger(value: string | null): number | null {
  if (value === null || !/^[+-]?\d{1,9}$/.test(value.trim())) {
    return null;
  }
  return Number(value.trim());
}
