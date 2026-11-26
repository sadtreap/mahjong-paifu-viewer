import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepeater, repeatInterval } from "./repeat";

describe("repeatInterval", () => {
  it("speeds up from 10 to 20 to 30 steps per second at 1 s and 2 s", () => {
    expect(repeatInterval(0)).toBe(100);
    expect(repeatInterval(999)).toBe(100);
    expect(repeatInterval(1000)).toBe(50);
    expect(repeatInterval(1999)).toBe(50);
    expect(repeatInterval(2000)).toBe(33);
    expect(repeatInterval(60000)).toBe(33);
  });
});

describe("createRepeater", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks at once, then on the schedule", () => {
    const ticks: number[] = [];
    const repeater = createRepeater(() => {
      ticks.push(Date.now());
      return true;
    });
    const start = Date.now();
    repeater.start();
    vi.advanceTimersByTime(1000);
    // 0, 100, ..., 1000: 11 ticks in the first second.
    expect(ticks).toHaveLength(11);
    vi.advanceTimersByTime(1000);
    // Then every 50 ms: 20 more.
    expect(ticks).toHaveLength(31);
    vi.advanceTimersByTime(330);
    expect(ticks).toHaveLength(41);
    expect((ticks[1] ?? 0) - start).toBe(100);
    repeater.stop();
    vi.advanceTimersByTime(1000);
    expect(ticks).toHaveLength(41);
    expect(repeater.active).toBe(false);
  });

  it("stops when a tick returns false", () => {
    let left = 3;
    const repeater = createRepeater(() => left-- > 0);
    repeater.start();
    vi.advanceTimersByTime(2000);
    expect(left).toBe(-1);
    expect(repeater.active).toBe(false);
  });
});
