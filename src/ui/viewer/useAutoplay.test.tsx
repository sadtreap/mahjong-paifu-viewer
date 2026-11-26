// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fourPlayerGame, SAMPLE_STEPS, stepIndexOf } from "./__fixtures__/games";
import type { AutoplaySpeed, ViewerState } from "./types";
import { useAutoplay } from "./useAutoplay";
import { useViewerState, type ViewerStore } from "./useViewerState";

const ix = stepIndexOf(fourPlayerGame());
let store: ViewerStore;

function Player({ start, speed = 1 }: { start: number; speed?: AutoplaySpeed }) {
  store = useViewerState(ix, { round: 0, step: start, pov: 0 });
  useAutoplay({
    playing: store.state.playing,
    position: store.state.position,
    ix,
    speed,
    onTick: () => store.navigate({ kind: "step", dir: 1 }, "autoplay"),
    onStop: () => store.dispatch({ type: "pause" }),
  });
  return null;
}

const state = (): ViewerState => store.state;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAutoplay", () => {
  it("waits each step's delay, then pauses at the round's result", () => {
    // Steps 20 draw (350 ms), 21 tsumogiri (550), 22 draw (350), 23 tsumogiri (550), 24 result.
    render(<Player start={20} />);
    act(() => {
      store.dispatch({ type: "play" });
    });
    act(() => vi.advanceTimersByTime(349));
    expect(state().position.step).toBe(20);
    act(() => vi.advanceTimersByTime(1));
    expect(state().position.step).toBe(21);
    act(() => vi.advanceTimersByTime(550));
    expect(state().position.step).toBe(22);
    act(() => vi.advanceTimersByTime(350));
    expect(state().position.step).toBe(23);
    act(() => vi.advanceTimersByTime(550));
    expect(state().position.step).toBe(SAMPLE_STEPS - 1);
    expect(state().playing).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(state().position).toEqual({ round: 0, step: SAMPLE_STEPS - 1 });
  });

  it("goes faster with the speed", () => {
    render(<Player start={20} speed={2} />);
    act(() => {
      store.dispatch({ type: "play" });
    });
    act(() => vi.advanceTimersByTime(175));
    expect(state().position.step).toBe(21);
  });

  it("stops when paused, and does nothing while not playing", () => {
    render(<Player start={1} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(state().position.step).toBe(1);
    act(() => {
      store.dispatch({ type: "play" });
    });
    act(() => {
      store.dispatch({ type: "pause" });
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(state().position.step).toBe(1);
  });

  it("pauses when the page is hidden", () => {
    render(<Player start={1} />);
    act(() => {
      store.dispatch({ type: "play" });
    });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    visibility.mockRestore();
    expect(state().playing).toBe(false);
  });
});
