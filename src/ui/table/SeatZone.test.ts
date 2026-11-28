import { describe, expect, it } from "vitest";
import type { SeatView } from "../../replay/types";
import { seatViewEqual } from "./SeatZone";

function seat(view: Partial<SeatView> = {}): SeatView {
  return {
    hand: ["1m", "2m", "3m"],
    drawn: null,
    melds: [{ type: "pon", tiles: ["5p", "5p"], from: 1, calledTile: "0p" }],
    kita: [],
    discards: [{ tile: "9s", tsumogiri: true, riichi: false, called: false }],
    score: 25000,
    riichi: false,
    ...view,
  };
}

describe("seatViewEqual", () => {
  it("compares snapshots by content, not identity", () => {
    expect(seatViewEqual(seat(), seat())).toBe(true);
  });

  it("sees every difference a seat's layer draws", () => {
    const base = seat();
    const changes: Partial<SeatView>[] = [
      { hand: ["1m", "2m", "4m"] },
      { hand: ["1m", "2m"] },
      { hand: ["1m", "2m", "3m", "4m"] },
      { drawn: "7z" },
      { melds: [{ type: "pon", tiles: ["5p", "5p"], from: 2, calledTile: "0p" }] },
      { melds: [{ type: "pon", tiles: ["5p", "5p"], from: 1, calledTile: "5p" }] },
      { melds: [{ type: "pon", tiles: ["5p", "0p"], from: 1, calledTile: "0p" }] },
      { melds: [{ type: "kakan", tiles: ["5p", "5p"], from: 1, calledTile: "0p" }] },
      {
        melds: [{ type: "kakan", tiles: ["5p", "5p"], from: 1, calledTile: "0p", addedTile: "5p" }],
      },
      { melds: [] },
      { kita: ["4z"] },
      { discards: [{ tile: "8s", tsumogiri: true, riichi: false, called: false }] },
      { discards: [{ tile: "9s", tsumogiri: false, riichi: false, called: false }] },
      { discards: [{ tile: "9s", tsumogiri: true, riichi: true, called: false }] },
      { discards: [{ tile: "9s", tsumogiri: true, riichi: false, called: true }] },
      { discards: [...base.discards, ...base.discards] },
      { discards: [] },
      { riichi: true },
    ];
    for (const change of changes) {
      expect(seatViewEqual(base, seat(change)), JSON.stringify(change)).toBe(false);
      expect(seatViewEqual(seat(change), base), JSON.stringify(change)).toBe(false);
      expect(seatViewEqual(seat(change), seat(change)), JSON.stringify(change)).toBe(true);
    }
  });

  it("counts the kita, which are all North tiles", () => {
    expect(seatViewEqual(seat({ kita: ["4z"] }), seat({ kita: ["4z"] }))).toBe(true);
    expect(seatViewEqual(seat({ kita: ["4z"] }), seat({ kita: ["4z", "4z"] }))).toBe(false);
  });

  it("takes the same snapshot as equal without looking into it", () => {
    const view = seat();
    expect(seatViewEqual(view, view)).toBe(true);
  });

  it("ignores the score, which the console draws", () => {
    expect(seatViewEqual(seat(), seat({ score: 24000 }))).toBe(true);
  });
});
