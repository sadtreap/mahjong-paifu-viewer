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
});
