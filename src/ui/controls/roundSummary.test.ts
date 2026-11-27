import { describe, expect, it } from "vitest";
import { makeGame, makeRound, ryukyoku, win } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { gameOverview, roundDeltas, roundOutcome, roundResults } from "./roundSummary";

describe("gameOverview", () => {
  const overview = gameOverview(sanmaCrossFormatGame());

  it("lists the rounds in order with their wind, number and honba", () => {
    expect(overview.map((r) => [r.index, r.wind, r.number, r.honba])).toEqual([
      [0, 0, 1, 0],
      [1, 0, 1, 1],
      [2, 0, 2, 0],
      [3, 0, 3, 0],
      [4, 0, 3, 1],
      [5, 0, 3, 2],
      [6, 0, 3, 3],
    ]);
  });

  it("gives each round's outcome and point changes", () => {
    expect(overview.map((r) => r.outcome?.kind)).toEqual([
      "win",
      "win",
      "win",
      "draw",
      "draw",
      "draw",
      "win",
    ]);
    // A ron names who paid; a tsumo has the winner's own seat there.
    expect(overview[0]?.outcome).toEqual({
      kind: "win",
      wins: [{ seat: 0, from: 1, points: 5800 }],
    });
    const tsumo = overview[1]?.outcome;
    expect(tsumo?.kind === "win" && tsumo.wins.map((w) => w.from === w.seat)).toEqual([true]);
    expect(overview[0]?.deltas).toEqual([6800, -5800, 0, 0]);
  });
});

describe("roundResults, roundOutcome and roundDeltas", () => {
  it("keeps both wins of a double ron and adds up their point changes", () => {
    const round = makeRound({
      events: [
        { type: "draw", seat: 0, tile: "1z" },
        { type: "discard", seat: 0, tile: "1z", tsumogiri: true, riichi: false },
        win(1, 0, [-2000, 1000, 1000, 0], { points: 2000 }),
        win(2, 0, [-1000, 0, 1000, 0]),
      ],
    });
    const results = roundResults(round);
    expect(results).toHaveLength(2);
    expect(roundOutcome(results)).toEqual({
      kind: "win",
      wins: [
        { seat: 1, from: 0, points: 2000 },
        { seat: 2, from: 0, points: undefined },
      ],
    });
    expect(roundDeltas(results)).toEqual([-3000, 1000, 2000, 0]);
  });

  it("calls any round that ends without a win a draw", () => {
    const results = roundResults(
      makeRound({ events: [ryukyoku("exhaustive", [1500, -1500, 0, 0])] }),
    );
    expect(roundOutcome(results)).toEqual({ kind: "draw" });
    expect(roundDeltas(results)).toEqual([1500, -1500, 0, 0]);
  });

  it("has no outcome and no change for a round without a result", () => {
    const [round] = makeGame([
      makeRound({ events: [{ type: "draw", seat: 0, tile: "1z" }] }),
    ]).rounds;
    const results = round ? roundResults(round) : [];
    expect(results).toEqual([]);
    expect(roundOutcome(results)).toBeNull();
    expect(roundDeltas(results)).toEqual([0, 0, 0, 0]);
  });
});
