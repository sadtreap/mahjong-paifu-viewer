import { describe, expect, it } from "vitest";
import { tenpaiFromDeltas } from "./tenpai";

describe("tenpaiFromDeltas", () => {
  it("takes the seats that receive noten payments as tenpai", () => {
    expect(tenpaiFromDeltas([3000, -1000, -1000, -1000])).toEqual([0]);
    expect(tenpaiFromDeltas([1500, -1500, 1500, -1500])).toEqual([0, 2]);
    expect(tenpaiFromDeltas([-3000, 1000, 1000, 1000])).toEqual([1, 2, 3]);
  });

  it("cannot tell all-tenpai from all-noten", () => {
    expect(tenpaiFromDeltas([0, 0, 0, 0])).toBeUndefined();
  });

  it("needs both receivers and payers", () => {
    expect(tenpaiFromDeltas([1000, 0, 0, 0])).toBeUndefined();
    expect(tenpaiFromDeltas([-1000, 0, 0, 0])).toBeUndefined();
  });

  it("reads three-player payments from seats 0-2 only", () => {
    expect(tenpaiFromDeltas([2000, -1000, -1000, 0], 3)).toEqual([0]);
    expect(tenpaiFromDeltas([-1000, 2000, -1000, 0], 3)).toEqual([1]);
    expect(tenpaiFromDeltas([1000, 1000, -2000, 0], 3)).toEqual([0, 1]);
    expect(tenpaiFromDeltas([-2000, 1000, 1000, 0], 3)).toEqual([1, 2]);
    expect(tenpaiFromDeltas([0, 0, 0, 0], 3)).toBeUndefined();
    // The empty chair never counts, even when the deltas are broken.
    expect(tenpaiFromDeltas([-1000, -1000, 0, 2000], 3)).toBeUndefined();
    expect(tenpaiFromDeltas([2000, -1000, -1000, 5], 3)).toEqual([0]);
  });
});
