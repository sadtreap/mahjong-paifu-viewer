// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MoveKind, ViewerState } from "./types";
import { QUIET_RELEASE_MS, useQuietStatus } from "./useQuietStatus";

type Props = Pick<ViewerState, "lastMove" | "playing">;
const move = (kind: MoveKind, playing = false): Props => ({ lastMove: { kind, dir: 1 }, playing });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useQuietStatus", () => {
  it("is quiet from the first move of a burst until the moves stop", () => {
    const { result, rerender } = renderHook((props: Props) => useQuietStatus(props), {
      initialProps: move("step"),
    });
    expect(result.current).toBe(false);
    rerender(move("repeat"));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(QUIET_RELEASE_MS - 100));
    rerender(move("repeat"));
    act(() => vi.advanceTimersByTime(QUIET_RELEASE_MS - 100));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(false);
  });

  it("is quiet while autoplay plays and during scrubs", () => {
    const { result, rerender } = renderHook((props: Props) => useQuietStatus(props), {
      initialProps: move("autoplay", true),
    });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(true);
    rerender(move("autoplay", false));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(QUIET_RELEASE_MS));
    expect(result.current).toBe(false);
    rerender(move("scrub"));
    expect(result.current).toBe(true);
  });

  it("speaks at once on a single step or a jump", () => {
    const { result, rerender } = renderHook((props: Props) => useQuietStatus(props), {
      initialProps: move("repeat"),
    });
    rerender(move("jump"));
    expect(result.current).toBe(false);
    rerender(move("history"));
    expect(result.current).toBe(false);
  });
});
