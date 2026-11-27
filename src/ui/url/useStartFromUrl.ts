import { useEffect, useRef, useState } from "react";
import type { LogSource } from "../logSource";
import type { LoadStart } from "../useLogLoader";
import type { LinkSource } from "../viewer/types";
import { linkLogSource, parseViewerUrl, type ViewerLink } from "./urlState";

/** useLogLoader's `load`. */
export type LinkLoad = (
  source: LogSource,
  start: LoadStart | null,
  origin: LinkSource | null,
) => unknown;

/**
 * Opens the log the page's address names, once, on startup: `?sample=<id>` or `?tenhou=<log id>`
 * with 1-based `round`, `step` and `pov` (see urlState.ts). The position is clamped and the seat
 * checked by the viewer once the game is known. An address without a source opens nothing.
 * Returns the link the address named, from the first render on (before the load starts), or null.
 */
export function useStartFromUrl(load: LinkLoad): ViewerLink | null {
  const [link] = useState(() => parseViewerUrl(window.location.search));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (link) {
      void load(linkLogSource(link.source), link.start, link.source);
    }
  }, [link, load]);

  return link;
}
