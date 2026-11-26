import { describe, expect, it } from "vitest";
import type { Seat } from "../core/model";
import type { DiscardView, MeldView } from "../replay/types";
import {
  discardRows,
  doraSlots,
  fitScale,
  handRowWidth,
  KITA_WIDTH,
  meldSlots,
  ownRowUnits,
  seatDistance,
  seatOnSide,
  seatWind,
  sideOf,
  splitWinningHand,
} from "./layout";

describe("seat geometry", () => {
  it("puts the point of view at the bottom and the next player on the right", () => {
    expect(sideOf(0, 0)).toBe("bottom");
    expect(sideOf(1, 0)).toBe("right");
    expect(sideOf(2, 0)).toBe("top");
    expect(sideOf(3, 0)).toBe("left");
    expect(sideOf(0, 2)).toBe("top");
    expect(sideOf(1, 2)).toBe("left");
  });

  it("finds the seat on each side, inverse of sideOf", () => {
    for (const pov of [0, 1, 2, 3] as Seat[]) {
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        expect(seatOnSide(sideOf(seat, pov), pov)).toBe(seat);
      }
    }
  });

  it("counts turn-order distance", () => {
    expect(seatDistance(0, 3)).toBe(3);
    expect(seatDistance(3, 0)).toBe(1);
    expect(seatDistance(2, 2)).toBe(0);
  });

  it("gives the dealer East and the others in turn order", () => {
    expect(seatWind(2, 2)).toBe(0);
    expect(seatWind(3, 2)).toBe(1);
    expect(seatWind(0, 2)).toBe(2);
    expect(seatWind(1, 2)).toBe(3);
  });
});

function pon(from: Seat, extra: Partial<MeldView> = {}): MeldView {
  return { type: "pon", tiles: ["5p", "5p"], from, calledTile: "0p", ...extra };
}

describe("meldSlots", () => {
  it("lays the called tile leftmost from the previous player", () => {
    const slots = meldSlots({ type: "chi", tiles: ["4m", "5m"], from: 3, calledTile: "3m" }, 0);
    expect(slots.map((s) => [s.tile, s.sideways])).toEqual([
      ["3m", true],
      ["4m", false],
      ["5m", false],
    ]);
  });

  it("lays the called tile in the middle from the player opposite", () => {
    expect(meldSlots(pon(3), 1).map((s) => s.sideways)).toEqual([false, true, false]);
  });

  it("lays the called tile rightmost from the next player", () => {
    expect(meldSlots(pon(2), 1).map((s) => s.sideways)).toEqual([false, false, true]);
  });

  it("puts a daiminkan's tile from the player opposite second from the left", () => {
    const meld: MeldView = {
      type: "daiminkan",
      tiles: ["7z", "7z", "7z"],
      from: 2,
      calledTile: "7z",
    };
    expect(meldSlots(meld, 0).map((s) => s.sideways)).toEqual([false, true, false, false]);
  });

  it("stacks a kakan's added tile on the sideways tile", () => {
    const slots = meldSlots(pon(1, { type: "kakan", addedTile: "5p" }), 0);
    expect(slots).toEqual([
      { tile: "5p", sideways: false, faceDown: false },
      { tile: "5p", sideways: false, faceDown: false },
      { tile: "0p", sideways: true, faceDown: false, added: "5p" },
    ]);
  });

  it("shows a closed kan with face-down ends and red fives face up", () => {
    const slots = meldSlots({ type: "ankan", tiles: ["0s", "5s", "5s", "5s"] }, 0);
    expect(slots.map((s) => [s.tile, s.faceDown])).toEqual([
      ["5s", true],
      ["0s", false],
      ["5s", false],
      ["5s", true],
    ]);
    expect(slots.every((s) => !s.sideways)).toBe(true);
  });
});

describe("discardRows", () => {
  const discard = (tile: DiscardView["tile"]): DiscardView => ({
    tile,
    tsumogiri: false,
    riichi: false,
    called: false,
  });

  it("splits into rows of six and keeps the overall index", () => {
    const discards = Array.from({ length: 14 }, () => discard("1m"));
    const rows = discardRows(discards);
    expect(rows.map((row) => row.length)).toEqual([6, 6, 2]);
    expect(rows[2]?.[1]?.index).toBe(13);
    expect(new Set(rows.flat().map((entry) => entry.key)).size).toBe(14);
  });

  it("returns no rows for an empty pond", () => {
    expect(discardRows([])).toEqual([]);
  });
});

describe("doraSlots", () => {
  it("pads the revealed indicators to five slots", () => {
    expect(doraSlots(["3m", "7z"])).toEqual(["3m", "7z", null, null, null]);
  });

  it("never drops indicators beyond five", () => {
    expect(doraSlots(["1m", "2m", "3m", "4m", "5m", "6m"])).toHaveLength(6);
  });
});

describe("hand row width", () => {
  it("counts tiles, the drawn tile gap and sideways tiles", () => {
    const hand = Array.from({ length: 10 }, () => "1m" as const);
    expect(handRowWidth({ hand, drawn: null, melds: [] }, 0)).toBe(10);
    expect(handRowWidth({ hand, drawn: "2m", melds: [] }, 0)).toBeCloseTo(11.4);
    expect(handRowWidth({ hand, drawn: null, melds: [pon(2)] }, 0)).toBeCloseTo(
      10 + 0.25 + 2 + 4 / 3,
    );
  });

  it("adds the kita group's width once, whatever the count", () => {
    const hand = Array.from({ length: 10 }, () => "1m" as const);
    const width = (kita: readonly ("4z" | "?")[]) =>
      handRowWidth({ hand, drawn: null, melds: [], kita: [...kita] }, 0);
    expect(KITA_WIDTH).toBe(1.85);
    expect(width([])).toBe(10);
    expect(width(["4z"])).toBeCloseTo(10 + KITA_WIDTH);
    expect(width(["4z", "4z", "4z", "4z"])).toBeCloseTo(10 + KITA_WIDTH);
  });

  it("measures the own hand with the same parts", () => {
    const view = {
      hand: Array.from({ length: 7 }, () => "1m" as const),
      drawn: "2m" as const,
      melds: [pon(2)],
      kita: ["4z" as const],
      discards: [],
      score: 0,
      riichi: false,
    };
    expect(ownRowUnits(view, 0)).toBeCloseTo(7 + 1.4 + KITA_WIDTH + 0.25 + 2 + 4 / 3);
    expect(ownRowUnits({ ...view, kita: [] }, 0)).toBeCloseTo(7 + 1.4 + 0.25 + 2 + 4 / 3);
  });

  it("keeps the drawn tile's slot in the own hand between turns", () => {
    const drawn = { hand: Array.from({ length: 13 }, () => "1m" as const), drawn: "2m" as const };
    const view = { ...drawn, melds: [], kita: [], discards: [], score: 0, riichi: false };
    // After the discard the hand is 13 tiles again and nothing is drawn: same width.
    expect(ownRowUnits({ ...view, drawn: null }, 0)).toBeCloseTo(ownRowUnits(view, 0));
    expect(ownRowUnits({ ...view, drawn: null }, 0)).toBeCloseTo(13 + 1.4);
  });

  it("scales down only when the row is too wide", () => {
    expect(fitScale(15, 18)).toBe(1);
    expect(fitScale(20, 18)).toBeCloseTo(0.9);
  });
});

describe("splitWinningHand", () => {
  it("takes the winning tile out and sorts the rest", () => {
    expect(splitWinningHand(["3m", "1m", "2m", "5z"], "1m")).toEqual({
      rest: ["2m", "3m", "5z"],
      winning: "1m",
    });
  });

  it("matches a red five by kind and keeps the hand's own tile", () => {
    expect(splitWinningHand(["0p", "4p", "6p"], "5p")).toEqual({
      rest: ["4p", "6p"],
      winning: "0p",
    });
  });

  it("sorts everything when the winning tile is unknown", () => {
    expect(splitWinningHand(["2s", "1s"], undefined)).toEqual({
      rest: ["1s", "2s"],
      winning: null,
    });
  });
});
