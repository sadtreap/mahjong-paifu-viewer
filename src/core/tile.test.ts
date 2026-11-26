import { describe, expect, it } from "vitest";
import {
  compareTiles,
  doraFromIndicator,
  isSameKind,
  isTile,
  normalizeTile,
  sortTiles,
  tileFromKind,
  tileKind,
} from "./tile";

describe("tile helpers", () => {
  it("validates mpsz notation", () => {
    for (const valid of ["1m", "9p", "0s", "1z", "7z", "?"]) {
      expect(isTile(valid)).toBe(true);
    }
    for (const invalid of ["0z", "8z", "10m", "5", "m5", "", "5mr"]) {
      expect(isTile(invalid)).toBe(false);
    }
  });

  it("maps tiles to kinds and back", () => {
    expect(tileKind("1m")).toBe(0);
    expect(tileKind("0p")).toBe(13);
    expect(tileKind("9s")).toBe(26);
    expect(tileKind("7z")).toBe(33);
    expect(tileKind("?")).toBe(-1);
    for (let kind = 0; kind < 34; kind++) {
      expect(tileKind(tileFromKind(kind))).toBe(kind);
    }
    expect(tileFromKind(4, true)).toBe("0m");
    expect(() => tileFromKind(3, true)).toThrow(RangeError);
  });

  it("normalizes red fives", () => {
    expect(normalizeTile("0s")).toBe("5s");
    expect(normalizeTile("5s")).toBe("5s");
    expect(isSameKind("0m", "5m")).toBe(true);
    expect(isSameKind("?", "?")).toBe(false);
  });

  it("sorts by suit, number, red five first, unknown last", () => {
    expect(sortTiles(["?", "1z", "5m", "0m", "9p", "1s", "4m"])).toEqual([
      "4m",
      "0m",
      "5m",
      "9p",
      "1s",
      "1z",
      "?",
    ]);
    expect(compareTiles("5p", "5p")).toBe(0);
  });

  it("finds the dora from an indicator", () => {
    expect(doraFromIndicator("9m")).toBe("1m");
    expect(doraFromIndicator("0p")).toBe("6p");
    expect(doraFromIndicator("4z")).toBe("1z");
    expect(doraFromIndicator("2z")).toBe("3z");
    expect(doraFromIndicator("7z")).toBe("5z");
    expect(doraFromIndicator("5z")).toBe("6z");
  });

  it("skips 2m-8m when finding the dora of a three-player game", () => {
    expect(doraFromIndicator("1m", 3)).toBe("9m");
    expect(doraFromIndicator("9m", 3)).toBe("1m");
    expect(doraFromIndicator("9p", 3)).toBe("1p");
    expect(doraFromIndicator("0s", 3)).toBe("6s");
    expect(doraFromIndicator("4z", 3)).toBe("1z");
    expect(doraFromIndicator("7z", 3)).toBe("5z");
    // Four-player games, the default, keep the plain order.
    expect(doraFromIndicator("1m")).toBe("2m");
    expect(doraFromIndicator("1m", 4)).toBe("2m");
    expect(doraFromIndicator("9m", 4)).toBe("1m");
  });
});
