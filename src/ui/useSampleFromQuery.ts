import { useEffect, useRef } from "react";
import type { LogSource } from "./logSource";
import type { Position } from "./navigation";
import { parseSampleQuery, sampleSource } from "./samples";

/** Opens the sample named in the page's query string (`?sample=<id>&round=<n>&step=<n>`) once. */
export function useSampleFromQuery(
  load: (source: LogSource, start: Position | null) => unknown,
): void {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const request = parseSampleQuery(window.location.search);
    if (request) {
      void load(sampleSource(request.id), request.start);
    }
  }, [load]);
}
