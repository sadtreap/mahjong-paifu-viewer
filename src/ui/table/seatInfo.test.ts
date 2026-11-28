import { describe, expect, it } from "vitest";
import type { Seat } from "../../core/model";
import type { SeatView } from "../../replay/types";
import type { SeatAid, Side } from "../viewer/types";
import { emptySide } from "./geometry";
import { seatInfoFor } from "./seatInfo";

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

describe("seatInfoFor", () => {
  const seats = [seat({ score: 1 }), seat({ score: 2 }), seat({ score: 3 }), seat({ score: 4 })];
  const names = ["A", "B", "C", "D"];

  it("lists the four seats in side order from the point of view", () => {
    const infos = seatInfoFor({ playerCount: 4, dealer: 2, seats, names, pov: 1, aid: () => null });
    expect(infos.map((info) => [info.seat, info.side, info.wind, info.dealer, info.score])).toEqual(
      [
        [1, "bottom", 3, false, 2],
        [2, "right", 0, true, 3],
        [3, "top", 1, false, 4],
        [0, "left", 2, false, 1],
      ],
    );
  });

  it("carries each seat's name, its riichi and its aid", () => {
    const waits: SeatAid = { kind: "waits", tiles: ["1m", "4m"], left: 5, furiten: false };
    const asked: Seat[] = [];
    const infos = seatInfoFor({
      playerCount: 4,
      dealer: 0,
      seats: [seat(), seat({ riichi: true }), seat(), seat()],
      names,
      pov: 3,
      aid: (s) => {
        asked.push(s);
        return s === 1 ? waits : null;
      },
    });
    expect(infos.map((info) => [info.seat, info.name, info.riichi, info.aid])).toEqual([
      [3, "D", false, null],
      [0, "A", false, null],
      [1, "B", true, waits],
      [2, "C", false, null],
    ]);
    expect(asked.sort()).toEqual([0, 1, 2, 3]);
  });

  it("marks exactly one dealer, the seat whose wind is East", () => {
    for (const dealer of [0, 1, 2, 3] as Seat[]) {
      const infos = seatInfoFor({ playerCount: 4, dealer, seats, names, pov: 0, aid: () => null });
      expect(infos.filter((info) => info.dealer).map((info) => info.seat)).toEqual([dealer]);
      expect(infos.find((info) => info.seat === dealer)?.wind).toBe(0);
      expect(infos.map((info) => info.wind).sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it("leaves out the empty seat of a three-player game and gives East, South and West", () => {
    for (const pov of [0, 1, 2] as Seat[]) {
      const asked: Seat[] = [];
      const infos = seatInfoFor({
        playerCount: 3,
        dealer: 1,
        seats,
        names,
        pov,
        aid: (s) => {
          asked.push(s);
          return s === pov ? { kind: "shanten", value: 2 } : null;
        },
      });
      expect(infos.map((info) => info.seat).sort()).toEqual([0, 1, 2]);
      expect(infos.map((info) => info.wind).sort()).toEqual([0, 1, 2]);
      expect(infos[0]).toMatchObject({ seat: pov, side: "bottom" });
      const sides = infos.map((info) => info.side);
      expect(sides).not.toContain(emptySide(3, pov) as Side);
      expect(infos.find((info) => info.seat === pov)?.aid).toEqual({ kind: "shanten", value: 2 });
      // The empty chair is never asked for an aid.
      expect(asked.sort()).toEqual([0, 1, 2]);
    }
  });

  it("stands in for a name or a seat the viewer does not have", () => {
    const infos = seatInfoFor({
      playerCount: 4,
      dealer: 0,
      seats: seats.slice(0, 2),
      names: ["A"],
      pov: 0,
      aid: () => null,
    });
    expect(infos.map((info) => [info.name, info.score, info.riichi])).toEqual([
      ["A", 1, false],
      ["", 2, false],
      ["", 0, false],
      ["", 0, false],
    ]);
  });
});
