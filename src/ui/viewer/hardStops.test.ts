import { describe, expect, it } from "vitest";
import { fourPlayerGame, SAMPLE_STEPS, stepIndexOf } from "./__fixtures__/games";
import { type InputKind, navSource } from "./commands";
import type { NavCommand, ViewerState } from "./types";
import { createViewerReducer, initialViewerState } from "./viewerReducer";

/**
 * Every input source against the hard stops (SPEC §3.5): fresh single inputs cross a round's end
 * and its start; held, auto-repeated and burst inputs and autoplay stop there; nothing passes
 * the game's ends.
 */
const ix = stepIndexOf(fourPlayerGame());
const reduce = createViewerReducer(ix);
const last = SAMPLE_STEPS - 1;
const fresh: readonly InputKind[] = ["click", "tap", "swipe", "key", "wheel", "button", "menu"];
const repeated: readonly InputKind[] = [
  "hold",
  "keyRepeat",
  "wheelBurst",
  "buttonHold",
  "autoplay",
];

function from(round: number, step: number, playing = false): ViewerState {
  return { ...initialViewerState({ round, step, pov: 0 }, ix), playing };
}

function press(kind: InputKind, state: ViewerState, command: NavCommand) {
  return reduce(state, { type: "nav", command, source: navSource(kind) }).position;
}

const forward: readonly NavCommand[] = [
  { kind: "step", dir: 1 },
  { kind: "ownTurn", dir: 1 },
  { kind: "keyMoment", dir: 1 },
  { kind: "nextRound" },
];
const backward: readonly NavCommand[] = [
  { kind: "step", dir: -1 },
  { kind: "ownTurn", dir: -1 },
  { kind: "keyMoment", dir: -1 },
  { kind: "roundStartOrPrev" },
];

describe("hard stops for every input source", () => {
  it.each(fresh)("%s crosses a round's end and start", (kind) => {
    expect(press(kind, from(0, last), { kind: "step", dir: 1 })).toEqual({ round: 1, step: 0 });
    expect(press(kind, from(1, 0), { kind: "step", dir: -1 })).toEqual({ round: 0, step: last });
  });

  it.each(repeated)("%s stops at a round's end and start", (kind) => {
    const playing = kind === "autoplay";
    for (const command of forward) {
      expect(press(kind, from(0, last, playing), command)).toEqual({ round: 0, step: last });
    }
    for (const command of backward) {
      expect(press(kind, from(1, 0, playing), command)).toEqual({ round: 1, step: 0 });
    }
  });

  it.each([...fresh, ...repeated])("%s moves within a round", (kind) => {
    expect(press(kind, from(0, 3, kind === "autoplay"), { kind: "step", dir: 1 })).toEqual({
      round: 0,
      step: 4,
    });
  });

  it.each([...fresh, ...repeated])("%s never passes the game's ends", (kind) => {
    for (const command of forward) {
      expect(press(kind, from(2, 3), command)).toEqual({ round: 2, step: 3 });
    }
    for (const command of backward) {
      expect(press(kind, from(0, 0), command)).toEqual({ round: 0, step: 0 });
    }
  });

  it("maps every input kind to its source", () => {
    expect(fresh.map(navSource)).toEqual(fresh.map(() => "user"));
    expect(repeated.map(navSource)).toEqual(["repeat", "repeat", "repeat", "repeat", "autoplay"]);
  });
});
