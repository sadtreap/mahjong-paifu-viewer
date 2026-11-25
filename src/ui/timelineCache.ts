import type { Round } from "../core/model";
import { buildTimeline } from "../replay/timeline";
import type { BoardState } from "../replay/types";

export type TimelineResult = { ok: true; steps: BoardState[] } | { ok: false; error: unknown };

export interface TimelineCache {
  get: (round: number) => TimelineResult;
  /** Steps in a round; a round that failed to replay counts as one step. */
  stepCount: (round: number) => number;
}

/** Replays rounds lazily, once each. A round that fails to replay is reported, not thrown. */
export function createTimelineCache(
  rounds: readonly Round[],
  build: (round: Round) => BoardState[] = buildTimeline,
): TimelineCache {
  const cache = new Map<number, TimelineResult>();
  const get = (index: number): TimelineResult => {
    const cached = cache.get(index);
    if (cached) {
      return cached;
    }
    let result: TimelineResult;
    const round = rounds[index];
    try {
      if (!round) {
        throw new RangeError(`No round ${index}`);
      }
      const steps = build(round);
      result =
        steps.length > 0 ? { ok: true, steps } : { ok: false, error: new Error("Empty timeline") };
    } catch (error) {
      result = { ok: false, error };
    }
    cache.set(index, result);
    return result;
  };
  return {
    get,
    stepCount: (index) => {
      const result = get(index);
      return result.ok ? result.steps.length : 1;
    },
  };
}
