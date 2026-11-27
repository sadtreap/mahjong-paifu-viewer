import { describe, expect, it } from "vitest";
import type { SeatTagInfo } from "../viewer/types";
import { consoleCells, scoreText } from "./Console";

const seats: SeatTagInfo[] = (
  [
    [1, "bottom", 3, 31200],
    [2, "right", 0, 25000],
    [3, "top", 1, -800],
    [0, "left", 2, 44600],
  ] as const
).map(([seat, side, wind, score]) => ({
  seat,
  side,
  name: "",
  wind,
  dealer: wind === 0,
  score,
  riichi: false,
  aid: null,
}));

describe("console scores", () => {
  it("writes scores in plain digits, with a real minus sign", () => {
    expect(scoreText(25000)).toBe("25000");
    expect(scoreText(0)).toBe("0");
    expect(scoreText(-800)).toBe("−800");
  });

  it("gives each seat a cell on its side, with the dealer and the turn marked", () => {
    expect(consoleCells(seats, 1, 3, false, "en")).toEqual([
      { side: "bottom", wind: 3, dealer: false, text: "31200", active: false },
      { side: "right", wind: 0, dealer: true, text: "25000", active: false },
      { side: "top", wind: 1, dealer: false, text: "−800", active: true },
      { side: "left", wind: 2, dealer: false, text: "44600", active: false },
    ]);
    expect(consoleCells(seats, 1, null, false, "en").some((cell) => cell.active)).toBe(false);
  });

  it("turns every score but the viewed player's into its difference from that one, ungrouped", () => {
    expect(consoleCells(seats, 1, null, true, "en").map((cell) => cell.text)).toEqual([
      "31200",
      "−6200",
      "−32000",
      "+13400",
    ]);
    // From another seat the same table reads differently.
    expect(consoleCells(seats, 0, null, true, "en").map((cell) => cell.text)).toEqual([
      "−13400",
      "−19600",
      "−45400",
      "44600",
    ]);
  });
});
