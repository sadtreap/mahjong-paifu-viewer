import { describe, expect, it } from "vitest";
import type { Round } from "../../core/model";
import { buildTimeline } from "../../replay/timeline";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { round as fixtureRound } from "../__fixtures__/game";
import { discardIndex } from "./discardIndex";

describe("discardIndex", () => {
  const index = discardIndex(buildTimeline(fixtureRound));

  it("gives the step before each pond tile's discard", () => {
    // Discards at steps 2 (A), 4 (B, riichi), 6 (C, after the pon), 8 (D) and 10 (A).
    expect(index.decisionStep({ seat: 0, index: 0 })).toBe(1);
    expect(index.decisionStep({ seat: 1, index: 0 })).toBe(3);
    expect(index.decisionStep({ seat: 2, index: 0 })).toBe(5);
    expect(index.decisionStep({ seat: 3, index: 0 })).toBe(7);
    expect(index.decisionStep({ seat: 0, index: 1 })).toBe(9);
  });

  it("is undefined for a pond tile that does not exist", () => {
    expect(index.decisionStep({ seat: 0, index: 5 })).toBeUndefined();
    expect(index.decisionStep({ seat: 3, index: 1 })).toBeUndefined();
  });

  it("keeps counting past a called tile, in a three-player round", () => {
    const sanma = sanmaCrossFormatGame();
    const round = sanma.rounds[0] as Round;
    const sanmaIndex = discardIndex(buildTimeline(round, 3));
    // B's first discard (step 6) is called; the next two come at steps 10 and 20.
    expect(sanmaIndex.decisionStep({ seat: 1, index: 0 })).toBe(5);
    expect(sanmaIndex.decisionStep({ seat: 1, index: 1 })).toBe(9);
    expect(sanmaIndex.decisionStep({ seat: 1, index: 2 })).toBe(19);
    expect(sanmaIndex.decisionStep({ seat: 3, index: 0 })).toBeUndefined();
  });

  it("is empty for a round with no steps", () => {
    expect(discardIndex([]).decisionStep({ seat: 0, index: 0 })).toBeUndefined();
  });
});
