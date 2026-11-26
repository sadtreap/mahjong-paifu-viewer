import { describe, expect, it } from "vitest";
import type { GameLog, Round } from "../../core/model";
import { MESSAGES } from "../../i18n/messages";
import { buildTimeline } from "../../replay/timeline";
import { makeGame, makeRound, win } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { boardState, game as fixtureGame } from "../__fixtures__/game";
import { playerNames } from "../labels";
import { gameOverview } from "../timeline/timelineModel";
import { createTimelineCache } from "../timelineCache";
import { createStepIndex } from "../viewer/stepIndex";
import { roundMatrix } from "./matrix";
import { movesOf } from "./moves";
import { playerRows } from "./players";
import { finalScores, scoreSeries } from "./scoreHistory";

const { en } = MESSAGES;

function setup(game: GameLog) {
  const timelines = createTimelineCache(game.rounds, game.playerCount);
  const ix = createStepIndex(game, timelines);
  const names = playerNames(en, game.players);
  const overview = gameOverview(game, ix, en, names, "en");
  return { timelines, ix, names, overview };
}

describe("roundMatrix", () => {
  it("gives each seat its role, riichi flag and jump target", () => {
    const { timelines, ix, overview } = setup(fixtureGame);
    const [row] = roundMatrix(fixtureGame, overview, timelines, ix);
    expect(row?.label).toBe("E1-1");
    expect(row?.start).toEqual({ round: 0, step: 0 });
    expect(row?.outcome).toEqual({ kind: "ron", wins: 1 });
    // B won by ron off A: the result step (11); A dealt in with the discard at step 10.
    expect(row?.cells[1]).toEqual({
      delta: 5200,
      role: "win",
      riichi: true,
      target: { round: 0, step: 11 },
    });
    expect(row?.cells[0]).toEqual({
      delta: -4200,
      role: "dealin",
      riichi: false,
      target: { round: 0, step: 9 },
    });
    expect(row?.cells[2]).toEqual({
      delta: 0,
      role: null,
      riichi: false,
      target: { round: 0, step: 0 },
    });
  });

  it("has three columns in a three-player game, tenpai at draws and riichi targets", () => {
    const sanma = sanmaCrossFormatGame();
    const { timelines, ix, overview } = setup(sanma);
    const rows = roundMatrix(sanma, overview, timelines, ix);
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(Object.keys(row.cells)).toEqual(["0", "1", "2"]);
    }
    // East 1: B declared riichi at step 10 and dealt in.
    expect(rows[0]?.cells[1]).toMatchObject({ role: "dealin", riichi: true });
    // East 3: only the dealer C is tenpai, after a riichi on its first discard.
    expect(rows[3]?.cells[2]).toMatchObject({ role: "tenpai", riichi: true });
    expect(rows[3]?.cells[2]?.target.step).toBeGreaterThan(0);
    expect(rows[3]?.cells[0]).toMatchObject({ role: null, riichi: false });
    expect(rows[3]?.cells[1]).toMatchObject({ role: null, target: { round: 3, step: 0 } });
  });

  it("marks both winners of a double ron", () => {
    const round = makeRound({
      events: [
        { type: "draw", seat: 0, tile: "1z" },
        { type: "discard", seat: 0, tile: "1z", tsumogiri: true, riichi: false },
        win(1, 0, [-2000, 1000, 1000, 0]),
        win(2, 0, [0, 0, 0, 0]),
      ],
    });
    const game = makeGame([round]);
    const { timelines, ix, overview } = setup(game);
    const [row] = roundMatrix(game, overview, timelines, ix);
    expect(row?.outcome).toEqual({ kind: "ron", wins: 2 });
    expect(row?.cells[1]?.role).toBe("win");
    expect(row?.cells[2]?.role).toBe("win");
    expect(row?.cells[0]).toMatchObject({ role: "dealin", target: { step: 1 } });
  });
});

describe("movesOf", () => {
  it("lists discards, calls, draws and the result with decision-step targets", () => {
    const { ix } = setup(fixtureGame);
    const round = fixtureGame.rounds[0] as Round;
    const rows = movesOf(round, buildTimeline(round), ix, 0);
    expect(rows.map((r) => [r.step, r.target.step, r.turn, r.seat, r.tile, r.notes])).toEqual([
      [1, 1, 1, 0, "5z", ["draw"]],
      [2, 1, 1, 0, "5z", ["tsumogiri"]],
      [3, 3, 1, 1, "2p", ["draw"]],
      [4, 3, 1, 1, "9m", ["riichi", "called"]],
      [5, 4, 1, 2, "9m", ["pon"]],
      [6, 5, 1, 2, "1z", ["discard"]],
      [7, 7, 1, 3, "7s", ["draw"]],
      [8, 7, 1, 3, "7s", ["tsumogiri"]],
      [9, 9, 2, 0, "1p", ["draw"]],
      [10, 9, 2, 0, "1p", ["tsumogiri"]],
      [11, 11, 2, 1, "1p", ["ron"]],
    ]);
    expect(rows[1]?.kind).toBe(31); // 5z
  });

  it("lists kans, kita and draws of a three-player round", () => {
    const sanma = sanmaCrossFormatGame();
    const { ix } = setup(sanma);
    const round = sanma.rounds[1] as Round;
    const rows = movesOf(round, buildTimeline(round, 3), ix, 1);
    expect(rows.filter((r) => r.notes.includes("kan")).map((r) => [r.seat, r.tile])).toEqual([
      [0, "1p"],
      [2, "6z"],
    ]);
    expect(rows.filter((r) => r.notes.includes("kita")).map((r) => r.seat)).toEqual([2]);
    expect(rows[rows.length - 1]).toMatchObject({ seat: 2, tile: "1z", notes: ["tsumo"] });
    const draw = makeGame([
      makeRound({ events: [{ type: "ryukyoku", reason: "kyuushuKyuuhai", deltas: [0, 0, 0, 0] }] }),
    ]);
    const drawRows = movesOf(
      draw.rounds[0] as Round,
      buildTimeline(draw.rounds[0] as Round),
      setup(draw).ix,
      0,
    );
    expect(drawRows).toEqual([
      {
        step: 1,
        target: { round: 0, step: 1 },
        turn: 1,
        seat: null,
        tile: null,
        kind: null,
        notes: ["drawEnd"],
      },
    ]);
  });
});

describe("scoreSeries", () => {
  it("has one series per playing seat and ends with the source's final scores", () => {
    const sanma = sanmaCrossFormatGame();
    const series = scoreSeries(sanma);
    expect(series).toHaveLength(3);
    expect(series[0]).toHaveLength(sanma.rounds.length + 1);
    expect(series.map((s) => s[0])).toEqual([35000, 35000, 35000]);
    expect(series.map((s) => s[s.length - 1])).toEqual([42100, 27600, 35300]);
  });

  it("falls back to the last round's end scores", () => {
    const series = scoreSeries(fixtureGame);
    expect(series).toHaveLength(4);
    expect(series.map((s) => s[1])).toEqual([20800, 30200, 25000, 25000]);
    expect(finalScores(makeGame([]))).toEqual([0, 0, 0, 0]);
    expect(scoreSeries(makeGame([]))).toEqual([[], [], [], []]);
  });
});

describe("playerRows", () => {
  it("gives each playing seat its wind, rank, rating, riichi, score and place", () => {
    const names = playerNames(en, fixtureGame.players);
    const rows = playerRows(en, fixtureGame, fixtureGame.rounds[0] as Round, boardState(), names);
    expect(rows[0]).toEqual({
      seat: 0,
      name: "A",
      rank: "4 dan",
      rating: "R1913",
      wind: 0,
      dealer: true,
      riichi: false,
      score: 25000,
      place: 1,
    });
    expect(rows[1]).toMatchObject({
      rank: null,
      rating: null,
      riichi: true,
      score: 24000,
      place: 4,
    });
  });

  it("skips the empty chair and uses three-player winds", () => {
    const sanma = sanmaCrossFormatGame();
    const names = playerNames(en, sanma.players);
    const round = sanma.rounds[2] as Round; // dealer: seat 1
    const rows = playerRows(en, sanma, round, null, names);
    expect(rows.map((r) => [r.seat, r.wind, r.dealer, r.place])).toEqual([
      [0, 2, false, 2],
      [1, 0, true, 3],
      [2, 1, false, 1],
    ]);
  });
});
