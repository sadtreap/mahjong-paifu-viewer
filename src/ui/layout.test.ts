import { describe, expect, it } from "vitest";
import type { Seat } from "../core/model";
import type { DiscardView, MeldView } from "../replay/types";
import {
  DISCARDS_PER_ROW,
  DRAWN_GAP,
  discardRows,
  fitScale,
  handRowWidth,
  KITA_WIDTH,
  keyed,
  MELD_GAP,
  meldSlots,
  POND_ROWS,
  SIDES,
  seatDistance,
  seatOnSide,
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

  it("lists the sides in turn order from the point of view, counter-clockwise", () => {
    expect(SIDES).toEqual(["bottom", "right", "top", "left"]);
    for (const pov of [0, 1, 2, 3] as Seat[]) {
      expect(SIDES.map((side) => seatOnSide(side, pov))).toEqual(
        [0, 1, 2, 3].map((turn) => (pov + turn) % 4),
      );
    }
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

  it("keeps a long pond in three rows: the third takes every discard after the twelfth", () => {
    for (const n of [18, 19, 24]) {
      const rows = discardRows(Array.from({ length: n }, () => discard("1m")));
      expect(rows.map((row) => row.length)).toEqual([6, 6, n - 12]);
      expect(rows[2]?.at(-1)?.index).toBe(n - 1);
    }
  });

  it("returns no rows for an empty pond", () => {
    expect(discardRows([])).toEqual([]);
  });

  it("keeps the discards in order, each with its tile", () => {
    const tiles = ["1m", "2m", "3m", "4m", "5m", "6m", "7m"] as const;
    const rows = discardRows(tiles.map(discard));
    expect(rows.flat().map((entry) => entry.item.tile)).toEqual([...tiles]);
    expect(rows.flat().map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows[1]?.[0]?.item.tile).toBe("7m");
  });

  it("has three rows of six by default, the numbers the table's geometry is built on", () => {
    expect(DISCARDS_PER_ROW).toBe(6);
    expect(POND_ROWS).toBe(3);
    const rows = discardRows(Array.from({ length: 40 }, () => discard("1m")));
    expect(rows).toHaveLength(POND_ROWS);
    expect(rows[0]).toHaveLength(DISCARDS_PER_ROW);
  });

  it("takes other row lengths and counts", () => {
    const discards = Array.from({ length: 11 }, () => discard("1m"));
    expect(discardRows(discards, 4, 2).map((row) => row.length)).toEqual([4, 7]);
    expect(discardRows(discards, 4, 5).map((row) => row.length)).toEqual([4, 4, 3]);
  });
});

describe("keyed", () => {
  it("gives repeated items distinct keys by their place", () => {
    expect(keyed(["1m", "1m", "2m"])).toEqual([
      { key: "0", index: 0, item: "1m" },
      { key: "1", index: 1, item: "1m" },
      { key: "2", index: 2, item: "2m" },
    ]);
    expect(keyed(["1m"], "d")[0]?.key).toBe("d0");
    expect(keyed([])).toEqual([]);
  });
});

describe("hand row width", () => {
  it("counts tiles, the drawn tile gap and sideways tiles", () => {
    const hand = Array.from({ length: 10 }, () => "1m" as const);
    const kita: never[] = [];
    expect(handRowWidth({ hand, drawn: null, melds: [], kita }, 0)).toBe(10);
    expect(handRowWidth({ hand, drawn: "2m", melds: [], kita }, 0)).toBeCloseTo(11.4);
    expect(handRowWidth({ hand, drawn: null, melds: [pon(2)], kita }, 0)).toBeCloseTo(
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

  it("adds every part of a row together: hand, drawn tile, kita and each meld with its gap", () => {
    const view = {
      hand: Array.from({ length: 7 }, () => "1m" as const),
      drawn: "2m" as const,
      melds: [pon(2)],
      kita: ["4z" as const],
    };
    const meld = MELD_GAP + 2 + 4 / 3;
    expect(handRowWidth(view, 0)).toBeCloseTo(7 + 1 + DRAWN_GAP + KITA_WIDTH + meld);
    expect(handRowWidth({ ...view, kita: [] }, 0)).toBeCloseTo(7 + 1 + DRAWN_GAP + meld);
    expect(handRowWidth({ ...view, melds: [pon(2), pon(1)] }, 0)).toBeCloseTo(
      7 + 1 + DRAWN_GAP + KITA_WIDTH + 2 * meld,
    );
  });

  it("is as wide whichever player a meld's tile came from", () => {
    const hand = Array.from({ length: 10 }, () => "1m" as const);
    const width = (from: Seat) =>
      handRowWidth({ hand, drawn: null, melds: [pon(from)], kita: [] }, 0);
    expect(width(1)).toBe(width(2));
    expect(width(2)).toBe(width(3));
  });

  it("counts a kakan's stack as one sideways tile, and a closed kan as four upright ones", () => {
    const row = (meld: MeldView) =>
      handRowWidth({ hand: [], drawn: null, melds: [meld], kita: [] }, 0);
    expect(row(pon(1, { type: "kakan", addedTile: "5p" }))).toBeCloseTo(row(pon(1)));
    expect(row({ type: "ankan", tiles: ["5s", "5s", "5s", "5s"] })).toBeCloseTo(MELD_GAP + 4);
    expect(
      row({ type: "daiminkan", tiles: ["7z", "7z", "7z"], from: 2, calledTile: "7z" }),
    ).toBeCloseTo(MELD_GAP + 3 + 4 / 3);
  });

  it("is nothing for an empty row", () => {
    expect(handRowWidth({ hand: [], drawn: null, melds: [], kita: [] }, 0)).toBe(0);
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
