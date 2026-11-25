import { describe, expect, it, vi } from "vitest";
import { boardState, round } from "./__fixtures__/game";
import { createTimelineCache } from "./timelineCache";

describe("createTimelineCache", () => {
  it("builds each round once", () => {
    const build = vi.fn(() => [boardState(), boardState()]);
    const cache = createTimelineCache([round, round], build);
    expect(cache.stepCount(0)).toBe(2);
    expect(cache.get(0).ok).toBe(true);
    expect(cache.stepCount(1)).toBe(2);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("reports a round that fails to replay as one step", () => {
    const cache = createTimelineCache([round], () => {
      throw new Error("broken");
    });
    const result = cache.get(0);
    expect(result.ok).toBe(false);
    expect(cache.stepCount(0)).toBe(1);
  });

  it("reports missing rounds and empty timelines", () => {
    const cache = createTimelineCache([round], () => []);
    expect(cache.get(0).ok).toBe(false);
    expect(cache.get(5).ok).toBe(false);
  });
});
