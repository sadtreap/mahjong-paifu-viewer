import { describe, expect, it } from "vitest";
import type { Seat } from "../core/model";
import {
  type Bounds,
  clampPosition,
  goToRound,
  goToStep,
  isGameEnd,
  isGameStart,
  isRoundEnd,
  keyMoment,
  navLimits,
  nextWhere,
  ownTurn,
  type Position,
  prevWhere,
  resolveNav,
  samePosition,
} from "./navigation";
import {
  fourPlayerGame,
  SAMPLE_STEPS,
  SANMA_STEPS,
  sanmaGame,
  stepIndexOf,
} from "./viewer/__fixtures__/games";
import type { NavCommand, StepInfo } from "./viewer/types";

const bounds: Bounds = { roundCount: 3, stepCount: (round) => [5, 3, 4][round] ?? 1 };

describe("round and step jumps", () => {
  it("goes to the start of a round, clamped to the game", () => {
    expect(goToRound(1, bounds)).toEqual({ round: 1, step: 0 });
    expect(goToRound(7, bounds)).toEqual({ round: 2, step: 0 });
    expect(goToRound(-1, bounds)).toEqual({ round: 0, step: 0 });
  });

  it("clamps a step to the round", () => {
    expect(goToStep({ round: 1, step: 0 }, 9, bounds)).toEqual({ round: 1, step: 2 });
    expect(goToStep({ round: 1, step: 2 }, -3, bounds)).toEqual({ round: 1, step: 0 });
  });
});

describe("clampPosition", () => {
  it("keeps a position inside the game", () => {
    expect(clampPosition({ round: 1, step: 2 }, bounds)).toEqual({ round: 1, step: 2 });
  });

  it("clamps the round first, then the step within that round", () => {
    expect(clampPosition({ round: 9, step: 99 }, bounds)).toEqual({ round: 2, step: 3 });
    expect(clampPosition({ round: -1, step: -5 }, bounds)).toEqual({ round: 0, step: 0 });
    expect(clampPosition({ round: 1, step: 4 }, bounds)).toEqual({ round: 1, step: 2 });
  });

  it("falls back to the first step of a game without rounds", () => {
    const empty: Bounds = { roundCount: 0, stepCount: () => 1 };
    expect(clampPosition({ round: 3, step: 3 }, empty)).toEqual({ round: 0, step: 0 });
  });
});

describe("resolveNav", () => {
  const ix = stepIndexOf(fourPlayerGame());
  const last = SAMPLE_STEPS - 1;
  const go = (
    round: number,
    step: number,
    command: NavCommand,
    repeat = false,
    pov: Seat = 0,
  ): Position | null => resolveNav({ round, step }, command, ix, { pov, repeat });
  const next: NavCommand = { kind: "step", dir: 1 };
  const prev: NavCommand = { kind: "step", dir: -1 };

  it("steps within a round, fresh or repeated", () => {
    for (const repeat of [false, true]) {
      expect(go(0, 3, next, repeat)).toEqual({ round: 0, step: 4 });
      expect(go(0, 3, prev, repeat)).toEqual({ round: 0, step: 2 });
    }
  });

  it("crosses a round end only on a fresh input", () => {
    expect(go(0, last, next)).toEqual({ round: 1, step: 0 });
    expect(go(0, last, next, true)).toBeNull();
    expect(go(1, 0, prev)).toEqual({ round: 0, step: last });
    expect(go(1, 0, prev, true)).toBeNull();
  });

  it("never wraps around the game's ends", () => {
    for (const repeat of [false, true]) {
      expect(go(2, 3, next, repeat)).toBeNull();
      expect(go(0, 0, prev, repeat)).toBeNull();
      expect(go(2, 3, { kind: "ownTurn", dir: 1 }, repeat)).toBeNull();
      expect(go(2, 3, { kind: "keyMoment", dir: 1 }, repeat)).toBeNull();
      expect(go(0, 0, { kind: "ownTurn", dir: -1 }, repeat)).toBeNull();
      expect(go(0, 0, { kind: "keyMoment", dir: -1 }, repeat)).toBeNull();
      expect(go(2, 1, { kind: "nextRound" }, repeat)).toBeNull();
      expect(go(0, 0, { kind: "roundStartOrPrev" }, repeat)).toBeNull();
    }
  });

  it("jumps by own turns of the point of view, stopping at both ends of the round", () => {
    const own: NavCommand = { kind: "ownTurn", dir: 1 };
    const back: NavCommand = { kind: "ownTurn", dir: -1 };
    const forward = [1, 7, 18, 20, last];
    let step = 0;
    for (const expected of forward) {
      const target = go(0, step, own);
      expect(target).toEqual({ round: 0, step: expected });
      step = target?.step ?? -1;
    }
    expect(go(0, last, own)).toEqual({ round: 1, step: 0 });
    expect(go(0, last, own, true)).toBeNull();
    expect(go(0, 20, back)).toEqual({ round: 0, step: 18 });
    expect(go(0, 1, back)).toEqual({ round: 0, step: 0 });
    expect(go(1, 0, back)).toEqual({ round: 0, step: last });
    expect(go(1, 0, back, true)).toBeNull();
  });

  it("counts calls and replacement draws as own turns", () => {
    const own: NavCommand = { kind: "ownTurn", dir: 1 };
    expect(go(0, 0, own, false, 2)).toEqual({ round: 0, step: 11 });
    expect(go(0, 11, own, false, 2)).toEqual({ round: 0, step: 12 });
    expect(go(0, 12, own, false, 2)).toEqual({ round: 0, step: last });
    expect(go(0, 0, own, false, 1)).toEqual({ round: 0, step: 3 });
  });

  it("jumps by key moments: riichi, calls and kans", () => {
    const moment: NavCommand = { kind: "keyMoment", dir: 1 };
    const stops = [3, 5, 8, 11, 15, 19, last];
    let step = 0;
    for (const expected of stops) {
      const target = go(0, step, moment);
      expect(target).toEqual({ round: 0, step: expected });
      step = target?.step ?? -1;
    }
    expect(go(0, last, { kind: "keyMoment", dir: -1 })).toEqual({ round: 0, step: 19 });
    expect(go(0, 3, { kind: "keyMoment", dir: -1 })).toEqual({ round: 0, step: 0 });
  });

  it("goes to the next round's start, but a repeat never leaves a round's last step", () => {
    expect(go(0, 5, { kind: "nextRound" })).toEqual({ round: 1, step: 0 });
    expect(go(0, 5, { kind: "nextRound" }, true)).toEqual({ round: 1, step: 0 });
    expect(go(0, last, { kind: "nextRound" })).toEqual({ round: 1, step: 0 });
    expect(go(0, last, { kind: "nextRound" }, true)).toBeNull();
  });

  it("goes up to the round's start, then to the previous round's start", () => {
    const up: NavCommand = { kind: "roundStartOrPrev" };
    expect(go(1, 5, up)).toEqual({ round: 1, step: 0 });
    expect(go(1, 5, up, true)).toEqual({ round: 1, step: 0 });
    expect(go(1, 0, up)).toEqual({ round: 0, step: 0 });
    expect(go(1, 0, up, true)).toBeNull();
  });

  it("goes to the round's start or last step, and nowhere when already there", () => {
    expect(go(1, 5, { kind: "roundStart" })).toEqual({ round: 1, step: 0 });
    expect(go(1, 0, { kind: "roundStart" })).toBeNull();
    expect(go(1, 5, { kind: "roundEnd" })).toEqual({ round: 1, step: last });
    expect(go(1, last, { kind: "roundEnd" })).toBeNull();
  });

  it("clamps a position out of range first", () => {
    expect(go(9, 99, prev)).toEqual({ round: 2, step: 2 });
    expect(go(-1, -1, next)).toEqual({ round: 0, step: 1 });
  });

  it("treats a round that failed to replay as one step that is both its start and its end", () => {
    const broken = stepIndexOf(fourPlayerGame(), [1]);
    const at = (round: number, step: number, command: NavCommand, repeat = false) =>
      resolveNav({ round, step }, command, broken, { pov: 0, repeat });
    expect(at(0, last, next)).toEqual({ round: 1, step: 0 });
    expect(at(1, 0, next)).toEqual({ round: 2, step: 0 });
    expect(at(1, 0, next, true)).toBeNull();
    expect(at(1, 0, prev)).toEqual({ round: 0, step: last });
    expect(at(1, 0, prev, true)).toBeNull();
    expect(at(1, 0, { kind: "ownTurn", dir: 1 })).toEqual({ round: 2, step: 0 });
    expect(at(1, 0, { kind: "roundEnd" })).toBeNull();
    expect(at(1, 0, { kind: "roundStart" })).toBeNull();
  });

  it("finds kita and replacement draws as own turns in a three-player game", () => {
    const sanma = stepIndexOf(sanmaGame());
    const own = (step: number, pov: Seat) =>
      resolveNav({ round: 0, step }, { kind: "ownTurn", dir: 1 }, sanma, { pov, repeat: false });
    const forward: number[] = [];
    for (let step = 0; step < SANMA_STEPS - 1; ) {
      step = own(step, 0)?.step ?? SANMA_STEPS;
      forward.push(step);
    }
    expect(forward).toEqual([1, 3, 11, 17, 19, SANMA_STEPS - 1]);
    const moments: number[] = [];
    for (let step = 0; step < SANMA_STEPS - 1; ) {
      step =
        resolveNav({ round: 0, step }, { kind: "keyMoment", dir: 1 }, sanma, {
          pov: 0,
          repeat: false,
        })?.step ?? SANMA_STEPS;
      moments.push(step);
    }
    expect(moments).toEqual([2, 6, 11, 14, 18, 22, SANMA_STEPS - 1]);
    expect(own(SANMA_STEPS - 1, 0)).toEqual({ round: 1, step: 0 });
  });
});

describe("nextWhere and prevWhere", () => {
  const ix = stepIndexOf(fourPlayerGame());
  it("stop at the round's last step and step 0 when nothing matches", () => {
    const never = () => false;
    expect(nextWhere({ round: 0, step: 3 }, ix, never)).toEqual({ round: 0, step: 24 });
    expect(nextWhere({ round: 0, step: 24 }, ix, never)).toBeNull();
    expect(prevWhere({ round: 0, step: 3 }, ix, never)).toEqual({ round: 0, step: 0 });
    expect(prevWhere({ round: 0, step: 0 }, ix, never)).toBeNull();
  });

  it("match own turns and key moments by step kind", () => {
    const info = (kind: StepInfo["kind"], seat: Seat | null): StepInfo => ({
      kind,
      seat,
      tsumogiri: false,
      doraReveal: false,
    });
    expect(ownTurn(1)(info("draw", 1))).toBe(true);
    expect(ownTurn(1)(info("pon", 1))).toBe(true);
    expect(ownTurn(1)(info("discard", 1))).toBe(false);
    expect(ownTurn(1)(info("ankan", 1))).toBe(false);
    expect(ownTurn(1)(info("draw", 2))).toBe(false);
    for (const kind of ["riichi", "chi", "pon", "daiminkan", "ankan", "kakan", "kita"] as const) {
      expect(keyMoment(info(kind, 0))).toBe(true);
    }
    for (const kind of ["deal", "draw", "discard", "result"] as const) {
      expect(keyMoment(info(kind, 0))).toBe(false);
    }
  });
});

describe("position predicates", () => {
  it("know the round and game ends", () => {
    expect(isRoundEnd({ round: 0, step: 4 }, bounds)).toBe(true);
    expect(isRoundEnd({ round: 0, step: 3 }, bounds)).toBe(false);
    expect(isGameEnd({ round: 2, step: 3 }, bounds)).toBe(true);
    expect(isGameEnd({ round: 1, step: 2 }, bounds)).toBe(false);
    expect(isGameStart({ round: 0, step: 0 })).toBe(true);
    expect(isGameStart({ round: 0, step: 1 })).toBe(false);
    expect(samePosition({ round: 1, step: 2 }, { round: 1, step: 2 })).toBe(true);
    expect(samePosition({ round: 1, step: 2 }, { round: 2, step: 1 })).toBe(false);
  });

  it("give the transport its limits", () => {
    expect(navLimits({ round: 0, step: 0 }, bounds)).toEqual({
      gameStart: true,
      gameEnd: false,
      firstRound: true,
      lastRound: false,
    });
    expect(navLimits({ round: 2, step: 3 }, bounds)).toEqual({
      gameStart: false,
      gameEnd: true,
      firstRound: false,
      lastRound: true,
    });
    expect(navLimits({ round: 2, step: 1 }, bounds).gameEnd).toBe(false);
  });
});
