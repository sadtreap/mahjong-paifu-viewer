import { describe, expect, it } from "vitest";
import { makeGame } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { finalScores } from "./finalScores";

describe("finalScores", () => {
  it("uses the source's final scores when it has them", () => {
    expect(finalScores(sanmaCrossFormatGame()).slice(0, 3)).toEqual([42100, 27600, 35300]);
  });

  it("keeps the source's final scores over the scores on the table", () => {
    expect(finalScores(sanmaCrossFormatGame(), [1, 2, 3, 0]).slice(0, 3)).toEqual([
      42100, 27600, 35300,
    ]);
  });

  // The table's scores count the riichi deposits paid in the last round; the point changes do not.
  it("falls back to the scores on the table at the game's last step", () => {
    expect(finalScores(fixtureGame, [20800, 29200, 25000, 25000])).toEqual([
      20800, 29200, 25000, 25000,
    ]);
  });

  it("falls back to the last round's start scores and point changes without them", () => {
    expect(finalScores(fixtureGame)).toEqual([20800, 30200, 25000, 25000]);
  });

  it("is all zero for a game without rounds", () => {
    expect(finalScores(makeGame([]))).toEqual([0, 0, 0, 0]);
  });
});
