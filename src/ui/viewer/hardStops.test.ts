import { describe, expect, it } from "vitest";
import { fourPlayerGame, SAMPLE_STEPS, stepIndexOf } from "./__fixtures__/games";
import type { NavCommand, NavSource, ViewerState } from "./types";
import { createViewerReducer, initialViewerState } from "./viewerReducer";

/**
 * Every navigation source against the hard stops: a fresh single input ("user": a click, a tap, a
 * swipe, a key press, a wheel notch, a button press) crosses a round's end and its start; held,
 * auto-repeated and burst inputs ("repeat") and autoplay stop there; nothing passes the game's
 * ends.
 */
const ix = stepIndexOf(fourPlayerGame());
const reduce = createViewerReducer(ix);
const last = SAMPLE_STEPS - 1;
const stopped: readonly NavSource[] = ["repeat", "autoplay"];
const all: readonly NavSource[] = ["user", ...stopped];

function from(round: number, step: number, playing = false): ViewerState {
  return { ...initialViewerState({ round, step, pov: 0 }, ix), playing };
}

function press(source: NavSource, state: ViewerState, command: NavCommand) {
  return reduce(state, { type: "nav", command, source }).position;
}

const forward: readonly NavCommand[] = [
  { kind: "step", dir: 1 },
  { kind: "ownTurn", dir: 1 },
  { kind: "nextRound" },
];
const backward: readonly NavCommand[] = [
  { kind: "step", dir: -1 },
  { kind: "ownTurn", dir: -1 },
  { kind: "roundStartOrPrev" },
];

describe("hard stops for every navigation source", () => {
  it("crosses a round's end and start on a fresh input", () => {
    expect(press("user", from(0, last), { kind: "step", dir: 1 })).toEqual({ round: 1, step: 0 });
    expect(press("user", from(1, 0), { kind: "step", dir: -1 })).toEqual({ round: 0, step: last });
  });

  it.each(stopped)("stops a %s input at a round's end and start", (source) => {
    const playing = source === "autoplay";
    for (const command of forward) {
      expect(press(source, from(0, last, playing), command)).toEqual({ round: 0, step: last });
    }
    for (const command of backward) {
      expect(press(source, from(1, 0, playing), command)).toEqual({ round: 1, step: 0 });
    }
  });

  it.each(all)("moves a %s input within a round", (source) => {
    expect(press(source, from(0, 3, source === "autoplay"), { kind: "step", dir: 1 })).toEqual({
      round: 0,
      step: 4,
    });
  });

  it.each(all)("never lets a %s input pass the game's ends", (source) => {
    for (const command of forward) {
      expect(press(source, from(2, 3), command)).toEqual({ round: 2, step: 3 });
    }
    for (const command of backward) {
      expect(press(source, from(0, 0), command)).toEqual({ round: 0, step: 0 });
    }
  });
});
