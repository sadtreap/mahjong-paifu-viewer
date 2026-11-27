import { useEffect, useState } from "react";
import type { ViewerState } from "./types";
import { BURST_MOVES } from "./viewerReducer";

/** Quiet for this long after the last move of a burst, then the live region announces once. */
export const QUIET_RELEASE_MS = 400;

/**
 * The live region's quiet policy: quiet during autoplay, holds, key auto-repeat,
 * wheel bursts and scrubs, then released once the moves stop for `releaseMs`, so the final step
 * is announced once. Quiet is decided during render, so the first move of a burst is not
 * announced either. A single step or a jump is announced at once.
 */
export function useQuietStatus(
  state: Pick<ViewerState, "lastMove" | "playing">,
  releaseMs: number = QUIET_RELEASE_MS,
): boolean {
  const { lastMove, playing } = state;
  const burst = BURST_MOVES.has(lastMove.kind);
  const [released, setReleased] = useState<ViewerState["lastMove"] | null>(null);

  useEffect(() => {
    if (playing || !burst) {
      return;
    }
    const timer = window.setTimeout(() => setReleased(lastMove), releaseMs);
    return () => window.clearTimeout(timer);
  }, [playing, burst, lastMove, releaseMs]);

  return playing || (burst && released !== lastMove);
}
