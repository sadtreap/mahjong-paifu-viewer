// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { fourPlayerGame, SAMPLE_STEPS, stepIndexOf } from "./__fixtures__/games";
import { useViewerState } from "./useViewerState";

const ix = stepIndexOf(fourPlayerGame());

afterEach(cleanup);

describe("useViewerState", () => {
  it("tells right away whether a navigation moved, so a hold can stop at a hard stop", () => {
    const { result } = renderHook(() =>
      useViewerState(ix, { round: 0, step: SAMPLE_STEPS - 2, pov: 0 }),
    );
    let moved: boolean[] = [];
    act(() => {
      moved = [
        // The hold reaches the round's result and stops there.
        result.current.navigate({ kind: "step", dir: 1 }, "repeat"),
        result.current.navigate({ kind: "step", dir: 1 }, "repeat"),
        // End at the result goes nowhere either.
        result.current.navigate({ kind: "roundEnd" }, "user"),
        // A fresh press goes on to the next round at once.
        result.current.navigate({ kind: "step", dir: 1 }, "user"),
      ];
    });
    expect(moved).toEqual([true, false, false, true]);
    expect(result.current.state.position).toEqual({ round: 1, step: 0 });
  });

  it("returns the new state from dispatch", () => {
    const { result } = renderHook(() => useViewerState(ix, null));
    let pov = -1;
    act(() => {
      pov = result.current.dispatch({ type: "setPov", seat: 2 }).pov;
    });
    expect(pov).toBe(2);
    expect(result.current.state.pov).toBe(2);
  });
});
