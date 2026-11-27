// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { Seat } from "../../core/model";
import type { Position } from "../navigation";
import type { LinkSource, MoveKind } from "../viewer/types";
import { type HistorySync, useHistorySync } from "./useHistorySync";

const SAMPLE: LinkSource = { kind: "sample", id: "tenhou-json" };

interface ViewState {
  position: Position;
  pov: Seat;
  kind: MoveKind;
}

let view: ViewState;
let sync: HistorySync;
let move: (round: number, step: number, kind: MoveKind, pov?: Seat) => void;

function Harness({
  origin,
  newEntry = false,
  onRestore,
}: {
  origin: LinkSource | null;
  newEntry?: boolean;
  onRestore?: (p: Position, pov: Seat) => void;
}) {
  const [state, setState] = useState<ViewState>({
    position: { round: 0, step: 0 },
    pov: 0,
    kind: "init",
  });
  view = state;
  move = (round, step, kind, pov) =>
    setState((previous) => ({ position: { round, step }, pov: pov ?? previous.pov, kind }));
  sync = useHistorySync({
    origin,
    position: state.position,
    pov: state.pov,
    moveKind: state.kind,
    newEntry,
    onRestore: (position, pov) => {
      onRestore?.(position, pov);
      setState({ position, pov, kind: "history" });
    },
  });
  return null;
}

let pushSpy: MockInstance<History["pushState"]>;
let replaceSpy: MockInstance<History["replaceState"]>;

function act$(fn: () => void) {
  act(fn);
}

function popTo(state: unknown, url?: string) {
  window.history.replaceState(state, "", url);
  act$(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

const lastCall = (spy: MockInstance<History["pushState"]>) => spy.mock.calls.at(-1);

/** The state the hook last wrote for its entry `n`: what Back or Forward to it hands back. */
function entryState(n: number): unknown {
  const written = [pushSpy, replaceSpy]
    .flatMap((spy) =>
      spy.mock.calls.map((call, index) => ({
        order: spy.mock.invocationCallOrder[index] ?? 0,
        state: call[0] as { n?: number } | null,
      })),
    )
    .sort((a, b) => a.order - b.order);
  return written.findLast((entry) => entry.state?.n === n)?.state ?? null;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/viewer/?lang=en");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  pushSpy = vi.spyOn(window.history, "pushState");
  replaceSpy = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useHistorySync", () => {
  it("stamps the current entry with the start and the sample's parameters", () => {
    render(<Harness origin={SAMPLE} />);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const [state, , url] = lastCall(replaceSpy) ?? [];
    expect(state).toEqual({ v: 1, round: 0, step: 0, pov: 0, sid: expect.any(String), n: 0 });
    expect(url).toBe("/viewer/?sample=tenhou-json&round=1&step=1&pov=1&lang=en");
    expect(window.location.search).toBe("?sample=tenhou-json&round=1&step=1&pov=1&lang=en");
  });

  it("pushes the first entry of a game that replaced another", () => {
    render(<Harness origin={null} newEntry />);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(lastCall(pushSpy)?.[2]).toBe("/viewer/?lang=en");
  });

  it("updates the entry for single steps, debounced, with the latest position", () => {
    render(<Harness origin={SAMPLE} />);
    replaceSpy.mockClear();
    act$(() => move(0, 1, "step"));
    act$(() => move(0, 2, "repeat"));
    act$(() => move(0, 3, "step"));
    expect(replaceSpy).not.toHaveBeenCalled();
    act$(() => {
      vi.advanceTimersByTime(250);
    });
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(lastCall(replaceSpy)?.[0]).toMatchObject({ round: 0, step: 3, pov: 0, n: 0 });
    expect(window.location.search).toBe("?sample=tenhou-json&round=1&step=4&pov=1&lang=en");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("pushes a jump after writing the step it left", () => {
    render(<Harness origin={SAMPLE} />);
    replaceSpy.mockClear();
    act$(() => move(0, 3, "step"));
    act$(() => move(2, 0, "jump"));
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(lastCall(replaceSpy)?.[0]).toMatchObject({ round: 0, step: 3, n: 0 });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(lastCall(pushSpy)?.[0]).toMatchObject({ round: 2, step: 0, n: 1 });
    expect(lastCall(pushSpy)?.[2]).toBe("/viewer/?sample=tenhou-json&round=3&step=1&pov=1&lang=en");
    expect(entryState(0)).toMatchObject({ round: 0, step: 3, pov: 0 });
  });

  it("folds a burst of jumps into one entry, and pushes again after a second", () => {
    render(<Harness origin={SAMPLE} />);
    act$(() => move(1, 0, "jump"));
    act$(() => {
      vi.advanceTimersByTime(400);
    });
    act$(() => move(2, 0, "jump"));
    act$(() => {
      vi.advanceTimersByTime(400);
    });
    act$(() => move(3, 0, "jump"));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(lastCall(replaceSpy)?.[0]).toMatchObject({ round: 3, step: 0, n: 1 });
    expect(entryState(0)).toMatchObject({ round: 0, step: 0 });
    act$(() => {
      vi.advanceTimersByTime(1000);
    });
    act$(() => move(4, 0, "jump"));
    expect(pushSpy).toHaveBeenCalledTimes(2);
    expect(lastCall(pushSpy)?.[0]).toMatchObject({ round: 4, step: 0, n: 2 });
    expect(entryState(1)).toMatchObject({ round: 3, step: 0 });
  });

  it("pushes a change of the point of view", () => {
    render(<Harness origin={SAMPLE} />);
    act$(() => move(0, 0, "pov", 2));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(lastCall(pushSpy)?.[0]).toMatchObject({ pov: 2, n: 1 });
    expect(window.location.search).toContain("pov=3");
  });

  it("keeps a local log's address bare, with the state for Back and Forward", () => {
    render(<Harness origin={null} />);
    act$(() => move(1, 5, "jump"));
    expect(window.location.pathname + window.location.search).toBe("/viewer/?lang=en");
    expect(window.history.state).toMatchObject({ v: 1, round: 1, step: 5 });
    expect(sync.link()).toBeNull();
  });

  it("restores this game's entry on Back without writing a new one", () => {
    const onRestore = vi.fn();
    render(<Harness origin={SAMPLE} onRestore={onRestore} />);
    act$(() => move(0, 7, "step"));
    act$(() => move(3, 0, "jump"));
    const previous = entryState(0);
    pushSpy.mockClear();
    popTo(previous, "/viewer/?sample=tenhou-json&round=1&step=8&pov=1&lang=en");
    replaceSpy.mockClear();
    expect(onRestore).toHaveBeenCalledWith({ round: 0, step: 7 }, 0);
    expect(view).toMatchObject({ position: { round: 0, step: 7 }, kind: "history" });
    act$(() => {
      vi.advanceTimersByTime(500);
    });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("restores Forward too, and a jump from there drops the entries after it", () => {
    render(<Harness origin={SAMPLE} />);
    act$(() => move(1, 0, "jump"));
    act$(() => {
      vi.advanceTimersByTime(1000);
    });
    act$(() => move(2, 0, "jump"));
    const first = entryState(1);
    const second = entryState(2);
    expect(first).toMatchObject({ round: 1 });
    popTo(first);
    expect(view.position).toEqual({ round: 1, step: 0 });
    popTo(second);
    expect(view.position).toEqual({ round: 2, step: 0 });
    popTo(first);
    act$(() => {
      vi.advanceTimersByTime(1000);
    });
    act$(() => move(5, 0, "jump"));
    expect(lastCall(pushSpy)?.[0]).toMatchObject({ round: 5, n: 2 });
    // The entry that was at 2 is gone: going "forward" to it now restores the new one.
    popTo(first);
    popTo(second);
    expect(view.position).toEqual({ round: 5, step: 0 });
  });

  it("adopts an entry from before a reload when the address names this game", () => {
    const onRestore = vi.fn();
    render(<Harness origin={SAMPLE} onRestore={onRestore} />);
    popTo(
      { v: 1, round: 2, step: 9, pov: 1, sid: "old", n: 4 },
      "/viewer/?sample=tenhou-json&round=3&step=10&pov=2",
    );
    expect(onRestore).toHaveBeenCalledWith({ round: 2, step: 9 }, 1);
    expect(window.history.state).toMatchObject({ round: 2, step: 9, n: 0 });
    expect(window.history.state.sid).not.toBe("old");
  });

  it("ignores another game's entries and states that are not the viewer's", () => {
    const onRestore = vi.fn();
    render(<Harness origin={SAMPLE} onRestore={onRestore} />);
    popTo({ v: 1, round: 2, step: 9, pov: 1, sid: "old", n: 4 }, "/viewer/?sample=sanma&round=3");
    popTo({ v: 1, round: 2, step: 9, pov: 1 }, "/viewer/");
    popTo(null);
    popTo({ page: 2 });
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("writes the waiting step when a mouse back button is pressed", () => {
    render(<Harness origin={SAMPLE} />);
    act$(() => move(0, 6, "step"));
    replaceSpy.mockClear();
    act$(() => {
      window.dispatchEvent(new PointerEvent("pointerdown", { button: 3 }));
    });
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(lastCall(replaceSpy)?.[0]).toMatchObject({ step: 6 });
  });

  it("writes the waiting step when the game is replaced", () => {
    const { unmount } = render(<Harness origin={SAMPLE} />);
    act$(() => move(0, 2, "step"));
    replaceSpy.mockClear();
    unmount();
    expect(lastCall(replaceSpy)?.[0]).toMatchObject({ step: 2 });
  });

  it("gives the absolute link to the current position", () => {
    render(<Harness origin={{ kind: "tenhou", logId: "2000010100gm-0089-0000-0123abcd" }} />);
    act$(() => move(1, 2, "step", 3));
    expect(sync.link()).toBe(
      `${window.location.origin}/viewer/?tenhou=2000010100gm-0089-0000-0123abcd&round=2&step=3&pov=4&lang=en`,
    );
  });
});
