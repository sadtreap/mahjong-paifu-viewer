import { describe, expect, it } from "vitest";
import type { GameLog } from "../core/model";
import { LogParseError } from "../formats/errors";
import { closeJson, cutPoints, garbled, parseOutcome } from "./fuzz";

describe("fuzz helpers", () => {
  it("spreads cut points over the whole text", () => {
    expect(cutPoints(10, 3)).toEqual([0, 5, 10]);
    expect(cutPoints(1000, 150)).toHaveLength(150);
  });

  it("closes truncated JSON", () => {
    expect(JSON.parse(closeJson('{"log":[[1,2],[3,'))).toEqual({ log: [[1, 2], [3]] });
    expect(JSON.parse(closeJson('{"name":["A","B\\'))).toEqual({ name: ["A", "B"] });
    expect(closeJson('[1,{"a":')).toBe('[1,{"a"}]');
  });

  it("garbles one character per copy, reproducibly", () => {
    const copies = garbled("aaaaaaaa", "b", 5);
    expect(copies).toEqual(garbled("aaaaaaaa", "b", 5));
    for (const copy of copies) {
      expect(copy.replace(/a/g, "")).toBe("b");
    }
  });

  it("reports games and LogParseErrors, and rethrows anything else", () => {
    const game = {} as GameLog;
    expect(parseOutcome(() => game, "x")).toBe("game");
    expect(
      parseOutcome(() => {
        throw new LogParseError("invalid");
      }, "x"),
    ).toBe("invalid");
    expect(() =>
      parseOutcome(() => {
        throw new TypeError("boom");
      }, "x"),
    ).toThrow("TypeError: boom for input: x");
  });
});
