import { describe, expect, it } from "vitest";
import type { Seat } from "../../core/model";
import type { SeatView } from "../../replay/types";
import type { Side } from "../viewer/types";
import { emptySide } from "./geometry";
import { seatTagsFor } from "./seatTagInfo";

function seat(view: Partial<SeatView> = {}): SeatView {
  return {
    hand: ["1m", "2m", "3m"],
    drawn: null,
    melds: [],
    kita: [],
    discards: [],
    score: 25000,
    riichi: false,
    ...view,
  };
}

describe("seatTagsFor", () => {
  const seats = [seat({ score: 1 }), seat({ score: 2 }), seat({ score: 3 }), seat({ score: 4 })];
  const names = ["A", "B", "C", "D"];

  it("lists the four seats in side order from the point of view", () => {
    const tags = seatTagsFor({ playerCount: 4, dealer: 2, seats, names, pov: 1, aid: () => null });
    expect(tags.map((tag) => [tag.seat, tag.side, tag.wind, tag.dealer, tag.score])).toEqual([
      [1, "bottom", 3, false, 2],
      [2, "right", 0, true, 3],
      [3, "top", 1, false, 4],
      [0, "left", 2, false, 1],
    ]);
  });

  it("leaves out the empty seat of a three-player game and gives East, South and West", () => {
    for (const pov of [0, 1, 2] as Seat[]) {
      const tags = seatTagsFor({
        playerCount: 3,
        dealer: 1,
        seats,
        names,
        pov,
        aid: (s) => (s === pov ? { kind: "shanten", value: 2 } : null),
      });
      expect(tags.map((tag) => tag.seat).sort()).toEqual([0, 1, 2]);
      expect(tags.map((tag) => tag.wind).sort()).toEqual([0, 1, 2]);
      const sides = tags.map((tag) => tag.side);
      expect(sides).not.toContain(emptySide(3, pov) as Side);
      expect(tags.find((tag) => tag.seat === pov)?.aid).toEqual({ kind: "shanten", value: 2 });
    }
  });
});
