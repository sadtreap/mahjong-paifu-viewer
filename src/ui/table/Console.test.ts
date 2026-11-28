import { describe, expect, it } from "vitest";
import type { SeatInfo } from "../viewer/types";
import { consoleCells } from "./Console";

const info = (
  seat: SeatInfo["seat"],
  side: SeatInfo["side"],
  wind: SeatInfo["wind"],
  score: number,
): SeatInfo => ({
  seat,
  side,
  name: "",
  wind,
  dealer: wind === 0,
  score,
  riichi: false,
  aid: null,
});

// Seat 1 looks at the table; seat 2 deals.
const seats: SeatInfo[] = [
  info(1, "bottom", 3, 31200),
  info(2, "right", 0, 25000),
  info(3, "top", 1, -800),
  info(0, "left", 2, 44600),
];
const texts = (...args: Parameters<typeof consoleCells>) =>
  consoleCells(...args).map((cell) => cell.text);

describe("consoleCells", () => {
  it("gives each seat a cell on its side, with the dealer and the turn marked", () => {
    expect(consoleCells(seats, 1, 3, false, "en")).toEqual([
      { side: "bottom", wind: 3, dealer: false, text: "31,200", active: false },
      { side: "right", wind: 0, dealer: true, text: "25,000", active: false },
      { side: "top", wind: 1, dealer: false, text: "−800", active: true },
      { side: "left", wind: 2, dealer: false, text: "44,600", active: false },
    ]);
    expect(consoleCells(seats, 1, null, false, "en").some((cell) => cell.active)).toBe(false);
  });

  it("writes scores with grouped digits and a real minus sign", () => {
    const scores = [
      info(0, "bottom", 0, 0),
      info(1, "right", 1, 123400),
      info(2, "top", 2, -12300),
    ];
    expect(texts(scores, 0, null, false, "en")).toEqual(["0", "123,400", "−12,300"]);
  });

  it("turns every score but the viewed player's into its difference from that one", () => {
    expect(texts(seats, 1, null, true, "en")).toEqual(["31,200", "−6,200", "−32,000", "+13,400"]);
    // From another seat the same table reads differently.
    expect(texts(seats, 0, null, true, "en")).toEqual(["−13,400", "−19,600", "−45,400", "44,600"]);
  });

  it("writes a level score as ±0, and the viewed player's own score in full", () => {
    const level = [info(0, "bottom", 0, 25000), info(1, "right", 1, 25000)];
    expect(texts(level, 0, null, true, "en")).toEqual(["25,000", "±0"]);
    expect(texts(level, 1, null, true, "en")).toEqual(["±0", "25,000"]);
  });

  it("marks the turn the same way while it shows differences", () => {
    expect(consoleCells(seats, 1, 0, true, "en").map((cell) => cell.active)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("has a cell for each seat it is given: three in a three-player game", () => {
    const three = seats.slice(0, 3);
    expect(consoleCells(three, 1, 2, false, "en").map((cell) => cell.side)).toEqual([
      "bottom",
      "right",
      "top",
    ]);
  });
});
