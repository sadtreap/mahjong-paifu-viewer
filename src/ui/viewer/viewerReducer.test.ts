import { describe, expect, it } from "vitest";
import type { Position } from "../navigation";
import { fourPlayerGame, SAMPLE_STEPS, sanmaGame, stepIndexOf } from "./__fixtures__/games";
import type { NavCommand, NavSource, ViewerAction, ViewerState } from "./types";
import { createViewerReducer, initialViewerState } from "./viewerReducer";

const ix = stepIndexOf(fourPlayerGame());
const reduce = createViewerReducer(ix);
const last = SAMPLE_STEPS - 1;

function at(round: number, step: number, patch: Partial<ViewerState> = {}): ViewerState {
  return { ...initialViewerState({ round, step, pov: 0 }, ix), ...patch };
}

const nav = (command: NavCommand, source: NavSource = "user"): ViewerAction => ({
  type: "nav",
  command,
  source,
});
const next = { kind: "step", dir: 1 } as const;
const prev = { kind: "step", dir: -1 } as const;

describe("initialViewerState", () => {
  it("clamps the start and keeps only a playing point of view", () => {
    expect(initialViewerState(null, ix)).toEqual({
      position: { round: 0, step: 0 },
      pov: 0,
      playing: false,
      resultHidden: false,
      lastMove: { kind: "init", dir: 0 },
      pickedKind: null,
      pin: null,
    });
    const start = initialViewerState({ round: 9, step: 99, pov: 3 }, ix);
    expect(start.position).toEqual({ round: 2, step: 3 });
    expect(start.pov).toBe(3);
    const sanma = stepIndexOf(sanmaGame());
    expect(initialViewerState({ round: 0, step: 0, pov: 3 }, sanma).pov).toBe(0);
    expect(initialViewerState({ round: 0, step: 0, pov: 2 }, sanma).pov).toBe(2);
  });
});

describe("navigation", () => {
  it("records a single forward step, and only that, as a forward step", () => {
    expect(reduce(at(0, 3), nav(next)).lastMove).toEqual({ kind: "step", dir: 1 });
    expect(reduce(at(0, 3), nav(prev)).lastMove).toEqual({ kind: "step", dir: -1 });
    expect(reduce(at(0, last), nav(next)).lastMove).toEqual({ kind: "step", dir: 1 });
    // An own-turn skip over several steps is a step for history, but not a single step.
    const skip = reduce(at(0, 1), nav({ kind: "ownTurn", dir: 1 }));
    expect(skip.position).toEqual({ round: 0, step: 7 });
    expect(skip.lastMove).toEqual({ kind: "step", dir: 0 });
    // An own turn that is the very next step is a single step.
    expect(reduce(at(0, 0), nav({ kind: "ownTurn", dir: 1 })).lastMove).toEqual({
      kind: "step",
      dir: 1,
    });
    expect(reduce(at(0, 3), nav({ kind: "keyMoment", dir: 1 })).lastMove).toEqual({
      kind: "jump",
      dir: 1,
    });
    expect(reduce(at(1, 3), nav({ kind: "roundStartOrPrev" })).lastMove).toEqual({
      kind: "jump",
      dir: -1,
    });
    expect(reduce(at(0, 3), nav(next, "repeat")).lastMove).toEqual({ kind: "repeat", dir: 1 });
    expect(reduce(at(0, 3, { playing: true }), nav(next, "autoplay")).lastMove).toEqual({
      kind: "autoplay",
      dir: 1,
    });
  });

  it("returns the same state when a navigation goes nowhere", () => {
    const end = at(2, 3);
    expect(reduce(end, nav(next))).toBe(end);
    const roundEnd = at(0, last);
    expect(reduce(roundEnd, nav(next, "repeat"))).toBe(roundEnd);
  });

  it("pauses autoplay on manual navigation, even when it goes nowhere", () => {
    expect(reduce(at(0, 3, { playing: true }), nav(next)).playing).toBe(false);
    expect(reduce(at(0, 3, { playing: true }), nav(next, "repeat")).playing).toBe(false);
    expect(reduce(at(2, 3, { playing: true }), nav(next)).playing).toBe(false);
  });

  it("keeps autoplay going, pausing on landing at a round's last step", () => {
    const moving = reduce(at(0, 3, { playing: true }), nav(next, "autoplay"));
    expect(moving.playing).toBe(true);
    const landed = reduce(at(0, last - 1, { playing: true }), nav(next, "autoplay"));
    expect(landed.position).toEqual({ round: 0, step: last });
    expect(landed.playing).toBe(false);
    const stuck = reduce(at(0, last, { playing: true }), nav(next, "autoplay"));
    expect(stuck.position).toEqual({ round: 0, step: last });
    expect(stuck.playing).toBe(false);
  });

  it("shows the result again and drops the pin on every move, but keeps the tile pick", () => {
    const pinned = at(0, 3, {
      resultHidden: true,
      pin: { seat: 1, index: 0 },
      pickedKind: 12,
    });
    const moved = reduce(pinned, nav(next));
    expect(moved.resultHidden).toBe(false);
    expect(moved.pin).toBeNull();
    expect(moved.pickedKind).toBe(12);
  });

  it("re-opens a hidden result with End at the round's last step", () => {
    const hidden = at(0, last, { resultHidden: true });
    const shown = reduce(hidden, nav({ kind: "roundEnd" }));
    expect(shown.resultHidden).toBe(false);
    expect(shown.position).toEqual({ round: 0, step: last });
    const visible = at(0, last);
    expect(reduce(visible, nav({ kind: "roundEnd" }))).toBe(visible);
  });
});

describe("seek", () => {
  it("clamps, records its kind and pauses", () => {
    const sought = reduce(at(0, 3, { playing: true }), {
      type: "seek",
      position: { round: 1, step: 99 },
      kind: "jump",
    });
    expect(sought.position).toEqual({ round: 1, step: last });
    expect(sought.lastMove).toEqual({ kind: "jump", dir: 1 });
    expect(sought.playing).toBe(false);
  });

  it("restores a history entry with its point of view", () => {
    const restored = reduce(at(1, 5), {
      type: "seek",
      position: { round: 0, step: 2 },
      kind: "history",
      pov: 2,
    });
    expect(restored.position).toEqual({ round: 0, step: 2 });
    expect(restored.pov).toBe(2);
    expect(restored.lastMove).toEqual({ kind: "history", dir: -1 });
  });

  it("changes only the point of view when the position is the same", () => {
    const state = at(1, 5, { pin: { seat: 0, index: 1 } });
    const same = reduce(state, {
      type: "seek",
      position: { round: 1, step: 5 },
      kind: "history",
      pov: 1,
    });
    expect(same.pov).toBe(1);
    expect(same.pin).toEqual({ seat: 0, index: 1 });
    expect(same.lastMove).toEqual({ kind: "history", dir: 0 });
    const scrub = reduce(state, { type: "seek", position: { round: 1, step: 5 }, kind: "scrub" });
    expect(scrub).toBe(state);
  });

  it("ignores a point of view that does not play", () => {
    const sanma = stepIndexOf(sanmaGame());
    const reduceSanma = createViewerReducer(sanma);
    const state = initialViewerState(null, sanma);
    const sought = reduceSanma(state, {
      type: "seek",
      position: { round: 0, step: 4 },
      kind: "jump",
      pov: 3,
    });
    expect(sought.pov).toBe(0);
    expect(sought.position).toEqual({ round: 0, step: 4 });
  });
});

describe("point of view", () => {
  it("sets a playing seat and records a pov move", () => {
    const state = reduce(at(0, 3), { type: "setPov", seat: 3 });
    expect(state.pov).toBe(3);
    expect(state.position).toEqual({ round: 0, step: 3 });
    expect(state.lastMove).toEqual({ kind: "pov", dir: 0 });
  });

  it("rejects seat 3 in a three-player game and cycles over the playing seats", () => {
    const sanma = stepIndexOf(sanmaGame());
    const reduceSanma = createViewerReducer(sanma);
    const state = initialViewerState({ round: 0, step: 0, pov: 2 }, sanma);
    expect(reduceSanma(state, { type: "setPov", seat: 3 })).toBe(state);
    expect(reduceSanma(state, { type: "cyclePov", delta: 1 }).pov).toBe(0);
    const zero = reduceSanma(state, { type: "setPov", seat: 0 });
    expect(reduceSanma(zero, { type: "cyclePov", delta: -1 }).pov).toBe(2);
  });

  it("cycles through all four seats in a four-player game", () => {
    let state = at(0, 0);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = reduce(state, { type: "cyclePov", delta: 1 });
      seen.push(state.pov);
    }
    expect(seen).toEqual([1, 2, 3, 0]);
  });

  it("does not pause autoplay", () => {
    expect(reduce(at(0, 3, { playing: true }), { type: "setPov", seat: 1 }).playing).toBe(true);
  });
});

describe("autoplay", () => {
  it("plays and pauses", () => {
    const playing = reduce(at(0, 3), { type: "play" });
    expect(playing.playing).toBe(true);
    expect(reduce(playing, { type: "pause" }).playing).toBe(false);
    expect(reduce(playing, { type: "togglePlay" }).playing).toBe(false);
    expect(reduce(at(0, 3), { type: "togglePlay" }).playing).toBe(true);
  });

  it("goes on to the next round when started at a round's result", () => {
    const resumed = reduce(at(0, last), { type: "togglePlay" });
    expect(resumed.playing).toBe(true);
    expect(resumed.position).toEqual({ round: 1, step: 0 });
    expect(resumed.lastMove).toEqual({ kind: "step", dir: 1 });
  });

  it("does nothing at the game's end", () => {
    const end = at(2, 3);
    expect(reduce(end, { type: "play" })).toBe(end);
    expect(reduce(end, { type: "togglePlay" })).toBe(end);
  });
});

describe("result card, pick and pin", () => {
  it("hides and shows the result", () => {
    const hidden = reduce(at(0, last), { type: "hideResult" });
    expect(hidden.resultHidden).toBe(true);
    expect(reduce(hidden, { type: "hideResult" })).toBe(hidden);
    expect(reduce(hidden, { type: "showResult" }).resultHidden).toBe(false);
  });

  it("sets and clears the sticky pick and the pin", () => {
    const picked = reduce(at(0, 3), { type: "pick", kind: 5 });
    expect(picked.pickedKind).toBe(5);
    expect(reduce(picked, { type: "pick", kind: 5 })).toBe(picked);
    expect(reduce(picked, { type: "pick", kind: null }).pickedKind).toBeNull();
    const ref = { seat: 2 as const, index: 3 };
    const pinned = reduce(picked, { type: "pin", ref });
    expect(pinned.pin).toBe(ref);
    expect(reduce(pinned, { type: "pin", ref: null }).pin).toBeNull();
  });
});

describe("a walk through the game", () => {
  it("reaches the end by single steps, crossing every round end once", () => {
    let state = at(0, 0);
    const rounds = new Set<number>();
    let steps = 0;
    for (;;) {
      const nextState = reduce(state, nav(next));
      if (nextState === state) {
        break;
      }
      state = nextState;
      rounds.add(state.position.round);
      steps++;
    }
    const end: Position = { round: 2, step: 3 };
    expect(state.position).toEqual(end);
    expect(steps).toBe(SAMPLE_STEPS * 2 + 4 - 1);
    expect([...rounds]).toEqual([0, 1, 2]);
  });
});
