import { describe, expect, it } from "vitest";
import type { Seat } from "../../core/model";
import { buildTimeline } from "../../replay/timeline";
import {
  draw,
  makeGame,
  makeRound,
  sampleRound,
  sampleSanmaRound,
  tsumogiri,
  win,
} from "../../test/round-builder";
import { createTimelineCache } from "../timelineCache";
import {
  doubleRonRound,
  fourPlayerGame,
  SAMPLE_STEPS,
  SANMA_STEPS,
  stepIndexOf,
} from "./__fixtures__/games";
import { createStepIndex, stepInfo, turnNumber } from "./stepIndex";
import type { StepInfo, StepKind } from "./types";

const kinds = (round: ReturnType<typeof sampleRound>, playerCount: 3 | 4 = 4) =>
  buildTimeline(round, playerCount).map((state) => stepInfo(state));

describe("stepInfo", () => {
  it("names every step of a four-player round", () => {
    const infos = kinds(sampleRound());
    expect(infos).toHaveLength(SAMPLE_STEPS);
    const expected: Array<[StepKind, Seat | null]> = [
      ["deal", null],
      ["draw", 0],
      ["discard", 0],
      ["chi", 1],
      ["discard", 1],
      ["pon", 3],
      ["discard", 3],
      ["draw", 0],
      ["riichi", 0],
      ["draw", 1],
      ["discard", 1],
      ["daiminkan", 2],
      ["draw", 2],
      ["discard", 2],
      ["draw", 3],
      ["kakan", 3],
      ["draw", 3],
      ["discard", 3],
      ["draw", 0],
      ["ankan", 0],
      ["draw", 0],
      ["discard", 0],
      ["draw", 1],
      ["discard", 1],
      ["result", 0],
    ];
    expect(infos.map((info) => [info.kind, info.seat])).toEqual(expected);
  });

  it("marks tsumogiri", () => {
    const infos = kinds(sampleRound());
    expect(infos[10]?.tsumogiri).toBe(true);
    expect(infos[2]?.tsumogiri).toBe(false);
  });

  it("folds the riichi acceptance into the riichi step", () => {
    const info = kinds(sampleRound())[8] as StepInfo;
    expect(info).toEqual({ kind: "riichi", seat: 0, tsumogiri: false });
  });

  it("makes a double ron one result step", () => {
    const infos = kinds(doubleRonRound());
    expect(infos.map((info) => info.kind)).toEqual(["deal", "draw", "discard", "result"]);
  });

  it("names kita steps in a three-player round", () => {
    const infos = kinds(sampleSanmaRound(), 3);
    expect(infos).toHaveLength(SANMA_STEPS);
    expect(
      infos.flatMap((info, step) => (info.kind === "kita" ? [[step, info.seat]] : [])),
    ).toEqual([
      [2, 0],
      [6, 1],
      [22, 1],
    ]);
    expect(infos[18]).toEqual({ kind: "ankan", seat: 0, tsumogiri: false });
    expect(infos[SANMA_STEPS - 1]?.kind).toBe("result");
  });

  it("treats a dora with no step before it as part of the deal", () => {
    const round = makeRound({ events: [{ type: "dora", indicator: "5m" }] });
    const infos = kinds(round);
    expect(infos).toEqual([
      { kind: "deal", seat: null, tsumogiri: false },
      { kind: "deal", seat: null, tsumogiri: false },
    ]);
  });
});

describe("createStepIndex", () => {
  it("exposes the bounds of the game and the player count", () => {
    const game = fourPlayerGame();
    const ix = stepIndexOf(game);
    expect(ix.roundCount).toBe(3);
    expect(ix.stepCount(0)).toBe(SAMPLE_STEPS);
    expect(ix.stepCount(2)).toBe(4);
    expect(ix.playerCount).toBe(4);
    expect(ix.info(0, 8).kind).toBe("riichi");
  });

  it("reads a failed round, and positions out of range, as a deal", () => {
    const ix = stepIndexOf(fourPlayerGame(), [1]);
    expect(ix.stepCount(1)).toBe(1);
    expect(ix.info(1, 0)).toEqual({ kind: "deal", seat: null, tsumogiri: false });
    expect(ix.info(0, 99).kind).toBe("deal");
    expect(ix.info(9, 0).kind).toBe("deal");
  });

  it("replays each round once, on first use", () => {
    const game = makeGame([sampleRound(), sampleRound()]);
    let builds = 0;
    const timelines = createTimelineCache(game.rounds, 4, (round) => {
      builds++;
      return buildTimeline(round, 4);
    });
    const ix = createStepIndex(game, timelines);
    expect(builds).toBe(0);
    ix.info(1, 3);
    ix.info(1, 4);
    ix.stepCount(1);
    expect(builds).toBe(1);
  });
});

describe("turnNumber", () => {
  it("counts the discards made before the step, per player", () => {
    const states = buildTimeline(sampleRound(), 4);
    expect(turnNumber(states, 0, 4)).toBe(1);
    expect(turnNumber(states, 2, 4)).toBe(1);
    // Steps 2, 4 and 6 are the first three discards; step 8 is the fourth (turn 1).
    expect(turnNumber(states, 8, 4)).toBe(1);
    // Five discards (steps 2, 4, 6, 8, 10) before step 11.
    expect(turnNumber(states, 11, 4)).toBe(2);
    expect(turnNumber(states, 99, 4)).toBe(1);
  });

  it("keeps the round's last turn on the result step", () => {
    // One go-around of draws and discards, then a ron on the fourth discard (step 8).
    const round = makeRound({
      events: [
        ...([0, 1, 2, 3] as const).flatMap((seat) => [draw(seat, "4z"), tsumogiri(seat, "4z")]),
        win(0, 3, [8000, 0, 0, -8000]),
      ],
    });
    const states = buildTimeline(round, 4);
    expect(states).toHaveLength(10);
    expect(turnNumber(states, 8, 4)).toBe(1);
    // Four discards lie before the result, yet turn 2 never began.
    expect(turnNumber(states, 9, 4)).toBe(1);
  });

  it("divides by three in a three-player game", () => {
    const states = buildTimeline(sampleSanmaRound(), 3);
    // Discards at steps 4, 8 and 10: the third player's discard ends turn 1.
    expect(turnNumber(states, 10, 3)).toBe(1);
    expect(turnNumber(states, 11, 3)).toBe(2);
  });
});
