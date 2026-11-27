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
      { drawn: "7z" },
      { melds: [{ type: "pon", tiles: ["5p", "5p"], from: 2, calledTile: "0p" }] },
      { melds: [] },
      { kita: ["4z"] },
      { discards: [{ tile: "9s", tsumogiri: true, riichi: false, called: true }] },
      { discards: [] },
      { riichi: true },
    ];
    for (const change of changes) {
      expect(seatViewEqual(base, seat(change)), JSON.stringify(change)).toBe(false);
    }
  });

  it("ignores the score, which the console draws", () => {
    expect(seatViewEqual(seat(), seat({ score: 24000 }))).toBe(true);
  });
});
