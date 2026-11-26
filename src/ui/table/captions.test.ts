import { describe, expect, it } from "vitest";
import type { Round, RoundEvent } from "../../core/model";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState } from "../../replay/types";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { round } from "../__fixtures__/game";
import type { ViewerState } from "../viewer/types";
import { captionsFor, isSingleForwardStep, stepEvents } from "./captions";

type LastMove = ViewerState["lastMove"];
const step: LastMove = { kind: "step", dir: 1 };
const states = buildTimeline(round);

/** Captions at each step of the fixture after a single forward step. */
function kindsAt(
  r: Round,
  list: readonly BoardState[],
  move: LastMove = step,
  speed: 1 | 2 | 4 = 1,
) {
  return list.map((state) => captionsFor(r, state, move, speed).map((c) => `${c.kind}:${c.seat}`));
}

describe("isSingleForwardStep", () => {
  it("accepts single forward steps and autoplay up to 2×", () => {
    expect(isSingleForwardStep({ kind: "step", dir: 1 }, 1)).toBe(true);
    expect(isSingleForwardStep({ kind: "autoplay", dir: 1 }, 2)).toBe(true);
    expect(isSingleForwardStep({ kind: "autoplay", dir: 1 }, 4)).toBe(false);
    for (const kind of ["init", "repeat", "jump", "scrub", "history", "pov"] as const) {
      expect(isSingleForwardStep({ kind, dir: 1 }, 1)).toBe(false);
    }
    expect(isSingleForwardStep({ kind: "step", dir: -1 }, 1)).toBe(false);
    expect(isSingleForwardStep({ kind: "step", dir: 0 }, 1)).toBe(false);
  });
});

describe("stepEvents", () => {
  it("includes the events folded into a step", () => {
    // Step 4 is the riichi discard with its folded riichiAccepted.
    expect(stepEvents(round, states[4] as BoardState).map((e) => e.type)).toEqual([
      "discard",
      "riichiAccepted",
    ]);
    expect(stepEvents(round, states[0] as BoardState)).toEqual([]);
  });
});

describe("captionsFor", () => {
  it("captions riichi, pon and ron, and nothing for draws and discards", () => {
    expect(kindsAt(round, states)).toEqual([
      [],
      [],
      [],
      [],
      ["riichi:1"],
      ["pon:2"],
      [],
      [],
      [],
      [],
      [],
      ["ron:1"],
    ]);
  });

  it("captions kita, kan and tsumo in a three-player game", () => {
    const game = sanmaCrossFormatGame();
    const seen = new Set<string>();
    for (const r of game.rounds) {
      for (const kinds of kindsAt(r, buildTimeline(r, 3))) {
        for (const kind of kinds) {
          seen.add(kind.split(":")[0] as string);
        }
      }
    }
    expect([...seen].sort()).toEqual(["kan", "kita", "pon", "riichi", "ron", "tsumo"]);
  });

  it("gives every winner of a multiple ron a caption, with distinct ids", () => {
    const events: RoundEvent[] = [
      { type: "draw", seat: 0, tile: "1m" },
      { type: "discard", seat: 0, tile: "1m", tsumogiri: true, riichi: false },
      { type: "win", seat: 1, from: 0, deltas: [0, 0, 0, 0] },
      { type: "win", seat: 3, from: 0, deltas: [0, 0, 0, 0] },
    ];
    const r: Round = { ...round, events };
    const state = { eventIndex: 3, lastEvent: events[2] ?? null } as BoardState;
    const captions = captionsFor(r, state, step, 1);
    expect(captions.map((c) => `${c.kind}:${c.seat}`)).toEqual(["ron:1", "ron:3"]);
    expect(new Set(captions.map((c) => c.id)).size).toBe(2);
  });

  it("captions nothing for backward moves, jumps, repeats, history moves or 4× autoplay", () => {
    const none = states.map(() => []);
    for (const move of [
      { kind: "step", dir: -1 },
      { kind: "jump", dir: 1 },
      { kind: "repeat", dir: 1 },
      { kind: "history", dir: 1 },
      { kind: "scrub", dir: 1 },
    ] as LastMove[]) {
      expect(kindsAt(round, states, move)).toEqual(none);
    }
    expect(kindsAt(round, states, { kind: "autoplay", dir: 1 }, 4)).toEqual(none);
    expect(kindsAt(round, states, { kind: "autoplay", dir: 1 }, 2)[5]).toEqual(["pon:2"]);
  });
});
