import { describe, expect, it } from "vitest";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState } from "../../replay/types";
import { round } from "../__fixtures__/game";
import type { AutoplaySpeed, ViewerState } from "../viewer/types";
import { motionFor } from "./motion";

type LastMove = ViewerState["lastMove"];
const step: LastMove = { kind: "step", dir: 1 };
const none = { landing: null };

// The fixture's steps: 0 deal, 1 draw, 2 discard (seat 0), 3 draw, 4 riichi discard with its
// acceptance (seat 1), 5 pon, 6 discard (seat 2), 7 draw, 8 discard (seat 3), 9 draw, 10 discard
// (seat 0), 11 ron.
const states = buildTimeline(round);
const at = (i: number) => states[i] as BoardState;
/** The motion of the step from `i - 1` to `i`. */
const reach = (i: number, move: LastMove = step, speed: AutoplaySpeed = 1) =>
  motionFor(round, at(i - 1), at(i), move, speed);

describe("motionFor", () => {
  it("lands a single forward step's discard in its pond", () => {
    expect(reach(2)).toEqual({ landing: { seat: 0, index: 0 } });
    // After a call, with no draw before it.
    expect(reach(6)).toEqual({ landing: { seat: 2, index: 0 } });
    expect(reach(8)).toEqual({ landing: { seat: 3, index: 0 } });
    // The index is the discard's place in its own pond.
    expect(reach(10)).toEqual({ landing: { seat: 0, index: 1 } });
  });

  it("lands a riichi discard, whose step also places the stick", () => {
    expect(at(4).seats[1].riichi).toBe(true);
    expect(reach(4)).toEqual({ landing: { seat: 1, index: 0 } });
  });

  it("moves nothing on a step that is not a discard", () => {
    // A draw, a pon and the ron (which outlines the last discard, but nothing lands again).
    for (const i of [1, 3, 5, 7, 9, 11]) {
      expect(reach(i), `step ${i}`).toEqual(none);
    }
  });

  it("lands during autoplay up to 2×, and never at 4×", () => {
    const autoplay: LastMove = { kind: "autoplay", dir: 1 };
    expect(reach(2, autoplay, 0.5).landing).toEqual({ seat: 0, index: 0 });
    expect(reach(2, autoplay, 2).landing).toEqual({ seat: 0, index: 0 });
    expect(reach(2, autoplay, 4)).toEqual(none);
  });

  it("moves nothing after any other move", () => {
    for (const move of [
      { kind: "step", dir: -1 },
      { kind: "step", dir: 0 },
      { kind: "init", dir: 1 },
      { kind: "jump", dir: 1 },
      { kind: "history", dir: 1 },
      { kind: "repeat", dir: 1 },
      { kind: "scrub", dir: 1 },
      { kind: "pov", dir: 0 },
    ] as LastMove[]) {
      expect(reach(2, move), `${move.kind} ${move.dir}`).toEqual(none);
    }
  });

  it("moves nothing where there is no step before: the viewer passes the same state twice", () => {
    expect(motionFor(round, at(0), at(0), step, 1)).toEqual(none);
    // Not even at a discard.
    expect(motionFor(round, at(2), at(2), step, 1)).toEqual(none);
  });

  it("names the last discard of the pond the table shows", () => {
    let landed = 0;
    for (let i = 1; i < states.length; i++) {
      const { landing } = reach(i);
      if (landing === null) {
        continue;
      }
      landed++;
      const state = at(i);
      const discards = state.seats[landing.seat].discards;
      expect(landing.index, `step ${i}`).toBe(discards.length - 1);
      expect(state.lastEvent, `step ${i}`).toMatchObject({
        type: "discard",
        seat: landing.seat,
        tile: discards[landing.index]?.tile,
      });
    }
    expect(landed).toBe(5);
  });
});
