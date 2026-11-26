import { describe, expect, it } from "vitest";
import type { Round } from "../../core/model";
import { buildTimeline } from "../../replay/timeline";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { round as fixtureRound } from "../__fixtures__/game";
import { discardIndex } from "./discardIndex";

describe("discardIndex", () => {
  const states = buildTimeline(fixtureRound);
  const index = discardIndex(fixtureRound, states, 4);

  it("gives each pond tile's step, decision step, turn and flags", () => {
    expect(index.get({ seat: 0, index: 0 })).toEqual({
      step: 2,
      decisionStep: 1,
      turn: 1,
      tile: "5z",
      tsumogiri: true,
      riichi: false,
      afterRiichi: false,
      called: false,
    });
    expect(index.get({ seat: 1, index: 0 })).toMatchObject({
      step: 4,
      decisionStep: 3,
      turn: 1,
      tile: "9m",
      riichi: true,
      called: true,
    });
    expect(index.get({ seat: 2, index: 0 })).toMatchObject({ step: 6, turn: 1, tile: "1z" });
    expect(index.get({ seat: 3, index: 0 })).toMatchObject({ step: 8, turn: 1, tsumogiri: true });
    // The fifth discard of the round starts turn 2.
    expect(index.get({ seat: 0, index: 1 })).toMatchObject({ step: 10, turn: 2, tile: "1p" });
  });

  it("is undefined for a pond tile that does not exist", () => {
    expect(index.get({ seat: 0, index: 5 })).toBeUndefined();
    expect(index.get({ seat: 3, index: 1 })).toBeUndefined();
  });

  it("marks discards after the seat's riichi, in a three-player round", () => {
    const sanma = sanmaCrossFormatGame();
    const round = sanma.rounds[0] as Round;
    const sanmaStates = buildTimeline(round, 3);
    const sanmaIndex = discardIndex(round, sanmaStates, 3);
    expect(sanmaIndex.get({ seat: 1, index: 0 })).toMatchObject({
      step: 6,
      turn: 1,
      tile: "9p",
      called: true,
      afterRiichi: false,
    });
    expect(sanmaIndex.get({ seat: 1, index: 1 })).toMatchObject({
      step: 10,
      turn: 2,
      riichi: true,
      afterRiichi: false,
    });
    expect(sanmaIndex.get({ seat: 1, index: 2 })).toMatchObject({
      step: 20,
      turn: 3,
      tsumogiri: true,
      afterRiichi: true,
      called: false,
    });
    expect(sanmaIndex.get({ seat: 3, index: 0 })).toBeUndefined();
  });

  it("is empty for a round with no steps", () => {
    expect(discardIndex(fixtureRound, [], 4).get({ seat: 0, index: 0 })).toBeUndefined();
  });
});
