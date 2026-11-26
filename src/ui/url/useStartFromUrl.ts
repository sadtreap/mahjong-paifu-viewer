import { useEffect, useRef, useState } from "react";
import type { LogSource } from "../logSource";
import { type SampleId, sampleSource } from "../samples";
import type { LoadStart } from "../useLogLoader";
import type { LinkSource } from "../viewer/types";
import { linkLogSource, parseViewerUrl } from "./urlState";

/** useLogLoader's `load`. */
export type LinkLoad = (
  source: LogSource,
  start: LoadStart | null,
  origin: LinkSource | null,
) => unknown;

export interface StartFromUrlOptions {
  /**
   * The sample to open when the address names no log (the table under the welcome card), or null
   * to open nothing.
   */
  fallbackSample?: SampleId | null;
}

export interface StartFromUrl {
  /** True when the address named no log, so the app greets the visitor with the welcome card. */
  welcome: boolean;
}

/**
 * Opens the log the page's address names, once, on startup: `?sample=<id>` or `?tenhou=<log id>`
 * with 1-based `round`, `step` and `pov` (see urlState.ts). The position is clamped and the seat
 * checked by the viewer once the game is known. Without a source in the address it opens
 * `fallbackSample`, if any.
 */
export function useStartFromUrl(load: LinkLoad, options: StartFromUrlOptions = {}): StartFromUrl {
  const [link] = useState(() => parseViewerUrl(window.location.search));
  const started = useRef(false);
  const fallback = options.fallbackSample ?? null;

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (link) {
      void load(linkLogSource(link.source), link.start, link.source);
    } else if (fallback !== null) {
      void load(sampleSource(fallback), null, { kind: "sample", id: fallback });
    }
  }, [link, load, fallback]);

  return { welcome: link === null };
}
