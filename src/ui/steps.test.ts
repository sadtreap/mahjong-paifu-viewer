import { describe, expect, it } from "vitest";
import type { Quad, Round } from "../core/model";
import { MESSAGES } from "../i18n/messages";
import { boardState, round } from "./__fixtures__/game";
import { describeStep, highlightedDiscard, stepEvent } from "./steps";

const names: Quad<string> = ["A", "B", "C", "D"];
const en = MESSAGES.en;
const all = () => true;

describe("stepEvent", () => {
  it("is null for the deal", () => {
    expect(stepEvent(round.events, { eventIndex: -1, lastEvent: null })).toBeNull();
  });

  it("skips a folded riichiAccepted back to the riichi discard", () => {
    expect(stepEvent(round.events, { eventIndex: 4, lastEvent: round.events[3] ?? null })).toBe(
      round.events[3],
    );
  });
});

describe("highlightedDiscard", () => {
  it("marks the discard just made", () => {
    const state = boardState({ eventIndex: 8 });
    expect(highlightedDiscard(round.events, state)).toEqual({ seat: 3, index: 0 });
  });

  it("marks the tile that was ronned", () => {
    const state = boardState({ eventIndex: 11 });
    state.seats[0].discards = [
      { tile: "5z", tsumogiri: true, riichi: false, called: false },
      { tile: "1p", tsumogiri: true, riichi: false, called: false },
    ];
    expect(highlightedDiscard(round.events, state)).toEqual({ seat: 0, index: 1 });
  });

  it("marks nothing after a draw", () => {
    expect(highlightedDiscard(round.events, boardState({ eventIndex: 7 }))).toBeNull();
  });

  it("does not mark a discard before a chankan", () => {
    const chankan: Round = {
      ...round,
      events: [
        { type: "discard", seat: 0, tile: "1m", tsumogiri: false, riichi: false },
        { type: "kakan", seat: 1, tile: "2m" },
        { type: "win", seat: 2, from: 1, deltas: [0, -1000, 1000, 0] },
      ],
    };
    expect(highlightedDiscard(chankan.events, boardState({ eventIndex: 2 }))).toBeNull();
  });
});

describe("describeStep", () => {
  it("describes the deal, draws, riichi and calls", () => {
    expect(describeStep(en, round, boardState({ eventIndex: -1 }), names, all)).toBe(
      "East 1, 1 honba: starting hands dealt",
    );
    expect(describeStep(MESSAGES.ja, round, boardState({ eventIndex: -1 }), names, all)).toBe(
      "東1局 1本場 配牌",
    );
    expect(describeStep(en, round, boardState({ eventIndex: 0 }), names, all)).toBe("A draws Haku");
    expect(describeStep(en, round, boardState({ eventIndex: 4 }), names, all)).toBe(
      "B declares riichi, discarding 9 Man",
    );
    expect(describeStep(en, round, boardState({ eventIndex: 5 }), names, all)).toBe(
      "C calls Pon on 9 Man",
    );
  });

  it("hides the drawn tile of a hidden hand", () => {
    expect(describeStep(en, round, boardState({ eventIndex: 7 }), names, () => false)).toBe(
      "D draws",
    );
  });

  it("describes the round result", () => {
    const win = round.events[11];
    if (win?.type !== "win") throw new Error("fixture changed");
    const state = boardState({ eventIndex: 11, results: [win] });
    expect(describeStep(en, round, state, names, all)).toBe("B wins by ron off A");
    expect(describeStep(MESSAGES.ko, round, state, names, all)).toBe("B 론 화료 (A 방총)");
  });
});
