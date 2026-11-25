import { describe, expect, it } from "vitest";
import {
  type Bounds,
  clampPosition,
  goToRound,
  goToStep,
  nextRound,
  nextStep,
  prevRound,
  prevStep,
} from "./navigation";

const bounds: Bounds = { roundCount: 3, stepCount: (round) => [5, 3, 4][round] ?? 1 };

describe("step navigation", () => {
  it("moves within a round", () => {
    expect(nextStep({ round: 0, step: 1 }, bounds)).toEqual({ round: 0, step: 2 });
    expect(prevStep({ round: 0, step: 1 }, bounds)).toEqual({ round: 0, step: 0 });
  });

  it("crosses into the next round's start and the previous round's end", () => {
    expect(nextStep({ round: 0, step: 4 }, bounds)).toEqual({ round: 1, step: 0 });
    expect(prevStep({ round: 1, step: 0 }, bounds)).toEqual({ round: 0, step: 4 });
  });

  it("stops at the ends of the game", () => {
    expect(nextStep({ round: 2, step: 3 }, bounds)).toEqual({ round: 2, step: 3 });
    expect(prevStep({ round: 0, step: 0 }, bounds)).toEqual({ round: 0, step: 0 });
  });
});

describe("round and step jumps", () => {
  it("goes to the start of a round, clamped to the game", () => {
    expect(goToRound(1, bounds)).toEqual({ round: 1, step: 0 });
    expect(goToRound(7, bounds)).toEqual({ round: 2, step: 0 });
    expect(goToRound(-1, bounds)).toEqual({ round: 0, step: 0 });
  });

  it("moves to the start of the next or previous round", () => {
    expect(nextRound({ round: 0, step: 3 }, bounds)).toEqual({ round: 1, step: 0 });
    expect(prevRound({ round: 2, step: 1 }, bounds)).toEqual({ round: 1, step: 0 });
  });

  it("stays put at the first and last round, like the disabled buttons", () => {
    const last = { round: 2, step: 3 };
    expect(nextRound(last, bounds)).toBe(last);
    const first = { round: 0, step: 2 };
    expect(prevRound(first, bounds)).toBe(first);
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
