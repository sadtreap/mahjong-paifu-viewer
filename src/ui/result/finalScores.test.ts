import { describe, expect, it } from "vitest";
import { makeGame } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { finalScores } from "./finalScores";

describe("finalScores", () => {
  it("uses the source's final scores when it has them", () => {
    expect(finalScores(sanmaCrossFormatGame()).slice(0, 3)).toEqual([42100, 27600, 35300]);
  });

  it("falls back to the last round's end scores", () => {
    expect(finalScores(fixtureGame)).toEqual([20800, 30200, 25000, 25000]);
  });

  it("is all zero for a game without rounds", () => {
    expect(finalScores(makeGame([]))).toEqual([0, 0, 0, 0]);
  });
});
