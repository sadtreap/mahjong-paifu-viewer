import type { LogSource } from "./logSource";

/** Sample logs bundled in `public/samples` (see the README there for sources and licenses). */
export const SAMPLE_IDS = ["tenhou-json", "sanma"] as const;

export type SampleId = (typeof SAMPLE_IDS)[number];

const SAMPLE_FILES: Record<SampleId, string> = {
  "tenhou-json": "ranked_game.json",
  sanma: "sanma.json",
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
