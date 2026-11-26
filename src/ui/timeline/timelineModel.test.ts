import { describe, expect, it } from "vitest";
import type { GameLog, Round } from "../../core/model";
import { MESSAGES } from "../../i18n/messages";
import { buildTimeline } from "../../replay/timeline";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { playerNames } from "../labels";
import { createTimelineCache } from "../timelineCache";
import { createStepIndex } from "../viewer/stepIndex";
import { gameOverview, laneOrder, povMarks, roundMarks } from "./timelineModel";

const { en } = MESSAGES;

function setup(game: GameLog) {
  const timelines = createTimelineCache(game.rounds, game.playerCount);
  const ix = createStepIndex(game, timelines);
  const names = playerNames(en, game.players);
  return { timelines, ix, names, overview: gameOverview(game, ix, en, names, "en") };
}

describe("gameOverview", () => {
  const sanma = sanmaCrossFormatGame();
  const { overview, ix } = setup(sanma);

  it("lays the rounds end to end on one step axis", () => {
    expect(overview.rounds.map((r) => r.label)).toEqual([
      "E1",
      "E1-1",
      "E2",
      "E3",
      "E3-1",
      "E3-2",
      "E3-3",
    ]);
    let offset = 0;
    for (const [index, round] of overview.rounds.entries()) {
      expect(round.offset).toBe(offset);
      expect(round.steps).toBe(ix.stepCount(index));
      offset += round.steps;
    }
    expect(overview.totalSteps).toBe(offset);
  });

  it("gives each round's outcome, deltas and result text", () => {
    expect(overview.rounds.map((r) => r.outcome)).toEqual([
      { kind: "ron", wins: 1 },
      { kind: "tsumo", wins: 1 },
      { kind: "ron", wins: 1 },
      { kind: "draw" },
      { kind: "draw" },
      { kind: "draw" },
      { kind: "tsumo", wins: 1 },
    ]);
    expect(overview.rounds[0]?.deltas).toEqual([6800, -5800, 0, 0]);
    expect(overview.rounds[0]?.startScores).toEqual([35000, 35000, 35000, 0]);
    expect(overview.rounds[0]?.resultText).toBe(
      "A wins by ron off B · 3 han · 30 fu · 5,800 points",
    );
    expect(overview.rounds[3]?.resultText).toBe("Exhaustive draw · tenpai: C");
  });

  it("counts a round that failed to replay as one step", () => {
    const timelines = createTimelineCache(fixtureGame.rounds, 4, () => {
      throw new Error("broken");
    });
    const ix = createStepIndex(fixtureGame, timelines);
    const one = gameOverview(fixtureGame, ix, en, playerNames(en, fixtureGame.players), "en");
    expect(one.rounds[0]?.steps).toBe(1);
    expect(one.rounds[0]?.outcome).toEqual({ kind: "ron", wins: 1 });
    expect(one.totalSteps).toBe(1);
  });
});

describe("roundMarks", () => {
  it("marks every kind of step of the fixture round", () => {
    const { ix } = setup(fixtureGame);
    const round = fixtureGame.rounds[0] as Round;
    const { marks, riichiFrom } = roundMarks(round, buildTimeline(round), ix, 0);
    expect(marks).toEqual([
      { step: 2, seat: 0, kind: "tsumogiri" },
      { step: 4, seat: 1, kind: "discard" },
      { step: 4, seat: 1, kind: "riichi" },
      { step: 5, seat: 2, kind: "call" },
      { step: 6, seat: 2, kind: "discard" },
      { step: 8, seat: 3, kind: "tsumogiri" },
      { step: 10, seat: 0, kind: "tsumogiri" },
      { step: 11, seat: null, kind: "end" },
    ]);
    expect(riichiFrom).toEqual({ 1: 4 });
  });

  it("marks kans with their dora reveal and kita", () => {
    const sanma = sanmaCrossFormatGame();
    const { ix } = setup(sanma);
    const round = sanma.rounds[1] as Round;
    const { marks } = roundMarks(round, buildTimeline(round, 3), ix, 1);
    const kinds = marks.map((mark) => `${mark.step}:${mark.kind}:${mark.seat}`);
    // Ankan (event 1) then its dora: step 2. Kakan (event 14) and its dora after the next draw.
    expect(kinds).toContain("2:kan:0");
    expect(kinds).toContain("2:dora:null");
    expect(kinds.filter((k) => k.includes(":kan:"))).toHaveLength(2);
    expect(kinds.filter((k) => k.includes(":kita:2"))).toHaveLength(1);
    expect(kinds.filter((k) => k.includes(":dora:"))).toHaveLength(2);
  });
});

describe("povMarks", () => {
  const sanma = sanmaCrossFormatGame();
  const { overview } = setup(sanma);

  it("marks the POV's wins, deal-ins and deltas", () => {
    expect(povMarks(sanma, overview, 0)[0]).toEqual({
      round: 0,
      won: true,
      dealtIn: false,
      delta: 6800,
    });
    expect(povMarks(sanma, overview, 1)[0]).toMatchObject({ won: false, dealtIn: true });
    // East 2: seat 0 wins on the North seat 2 set aside.
    expect(povMarks(sanma, overview, 2)[2]).toMatchObject({ dealtIn: true, delta: -8000 });
    expect(povMarks(sanma, overview, 1)[1]).toMatchObject({ won: false, dealtIn: false });
  });
});

describe("laneOrder", () => {
  it("starts with the POV and follows turn order over the playing seats", () => {
    expect(laneOrder(2, 4)).toEqual([2, 3, 0, 1]);
    expect(laneOrder(0, 4)).toEqual([0, 1, 2, 3]);
    expect(laneOrder(1, 3)).toEqual([1, 2, 0]);
    expect(laneOrder(2, 3)).toEqual([2, 0, 1]);
    expect(laneOrder(3, 3)).toEqual([0, 1, 2]);
  });
});
