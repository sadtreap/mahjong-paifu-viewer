import { describe, expect, it } from "vitest";
import type { Seat } from "../../core/model";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState, SeatView } from "../../replay/types";
import { round } from "../__fixtures__/game";
import { revealedSeats } from "../reveal";
import type { ViewerState } from "../viewer/types";
import { PRESETS } from "./geometry";
import { flightOffset, motionFor, ownHandLine, pondSlotCenter } from "./motion";

type LastMove = ViewerState["lastMove"];
const states = buildTimeline(round);
const at = (i: number) => states[i] as BoardState;

function seat(view: Partial<SeatView> = {}): SeatView {
  return {
    hand: Array(13).fill("1m"),
    drawn: null,
    melds: [],
    kita: [],
    discards: [{ tile: "9s", tsumogiri: false, riichi: false, called: false }],
    score: 25000,
    riichi: false,
    ...view,
  };
}

describe("pondSlotCenter", () => {
  it("centres slots in rows of six 0.9-unit tiles from (7.1, 13.3)", () => {
    expect(pondSlotCenter(0).x).toBeCloseTo(7.55);
    expect(pondSlotCenter(0).y).toBeCloseTo(13.9);
    expect(pondSlotCenter(5).x).toBeCloseTo(12.05);
    expect(pondSlotCenter(6).x).toBeCloseTo(7.55);
    expect(pondSlotCenter(6).y).toBeCloseTo(15.1);
    expect(pondSlotCenter(23).x).toBeCloseTo(12.05);
    expect(pondSlotCenter(23).y).toBeCloseTo(17.5);
  });

  it("widens the row after a sideways riichi tile", () => {
    const discards = [{ riichi: false }, { riichi: true }, { riichi: false }];
    expect(pondSlotCenter(1, discards).x).toBeCloseTo(7.1 + 0.9 + 0.6);
    expect(pondSlotCenter(2, discards).x).toBeCloseTo(7.1 + 0.9 + 1.2 + 0.45);
  });
});

describe("ownHandLine", () => {
  it("puts the own hand's centre line just beyond the near edge", () => {
    const line = ownHandLine(PRESETS.landscape, 14.4);
    expect(line.y).toBeCloseTo(20.98, 2);
    expect(line.tw).toBeCloseTo(1.3);
    expect(ownHandLine(PRESETS.portrait, 14.4).y).toBeGreaterThan(20);
    expect(ownHandLine(PRESETS.flat, 14.4).y).toBeGreaterThan(20);
  });
});

describe("flightOffset", () => {
  it("flies an opponent's discard from the end of its hand row", () => {
    const view = seat();
    const { fx, fy, fs } = flightOffset(
      { seat: 1, index: 0, source: "opponent", riichi: false },
      view,
      PRESETS.landscape,
      14,
    );
    expect(fx).toBeCloseTo(0.4 + 13.9 - 7.55);
    expect(fy).toBeCloseTo(18.88 - 13.9);
    expect(fs).toBeCloseTo(1 / 0.9);
  });

  it("flies the point of view's discard up from its own hand", () => {
    const view = seat({ hand: Array(13).fill("1m") });
    const drawn = flightOffset(
      { seat: 0, index: 0, source: "drawn", riichi: false },
      view,
      PRESETS.landscape,
      14.4,
    );
    const hand = flightOffset(
      { seat: 0, index: 0, source: "hand", riichi: false },
      view,
      PRESETS.landscape,
      14.4,
    );
    expect(drawn.fy).toBeCloseTo(20.98 - 13.9, 1);
    expect(drawn.fs).toBeCloseTo(1.3 / 0.9);
    // The drawn tile is right of the centre line, a tile from mid-hand left of it.
    expect(7.55 + drawn.fx).toBeGreaterThan(10);
    expect(7.55 + hand.fx).toBeLessThan(10);
  });

  it("starts smaller for a scaled-down opponent row", () => {
    // 13 tiles, kita and four melds do not fit the 18-unit row.
    const view = seat({
      melds: Array(4).fill({ type: "pon", tiles: ["5p", "5p"], from: 2, calledTile: "5p" }),
      kita: ["4z"],
    });
    const { fs } = flightOffset(
      { seat: 1, index: 0, source: "opponent", riichi: false },
      view,
      PRESETS.landscape,
      14,
    );
    expect(fs).toBeLessThan(1 / 0.9);
  });
});

describe("motionFor", () => {
  const step: LastMove = { kind: "step", dir: 1 };
  const all = new Set<Seat>([0, 1, 2, 3]);
  const options = { motion: true, revealedBefore: all, revealedNow: all, pov: 0 as Seat };

  it("flies a single forward step's discard", () => {
    expect(motionFor(round, at(1), at(2), step, 1, options)).toEqual({
      flight: { seat: 0, index: 0, source: "drawn", riichi: false },
      reveal: [],
    });
    expect(motionFor(round, at(3), at(4), step, 1, options).flight).toEqual({
      seat: 1,
      index: 0,
      source: "opponent",
      riichi: true,
    });
    expect(motionFor(round, at(5), at(6), step, 2, { ...options, pov: 2 }).flight?.source).toBe(
      "hand",
    );
    expect(motionFor(round, at(0), at(1), step, 1, options).flight).toBeNull();
  });

  it("does nothing for other moves, 4× autoplay or with motion off", () => {
    const none = { flight: null, reveal: [] };
    for (const move of [
      { kind: "step", dir: -1 },
      { kind: "jump", dir: 1 },
      { kind: "history", dir: 1 },
      { kind: "repeat", dir: 1 },
      { kind: "scrub", dir: 1 },
      { kind: "pov", dir: 0 },
    ] as LastMove[]) {
      expect(motionFor(round, at(1), at(2), move, 1, options)).toEqual(none);
    }
    expect(motionFor(round, at(1), at(2), { kind: "autoplay", dir: 1 }, 4, options)).toEqual(none);
    expect(motionFor(round, at(1), at(2), step, 1, { ...options, motion: false })).toEqual(none);
  });

  it("reveals exactly the seats that turn face up at the result", () => {
    const last = states.length - 1;
    const before = revealedSeats(0, false, at(last - 1).results);
    const now = revealedSeats(0, false, at(last).results);
    const motion = motionFor(round, at(last - 1), at(last), step, 1, {
      motion: true,
      revealedBefore: before,
      revealedNow: now,
      pov: 0,
    });
    expect(motion.reveal).toEqual([1]);
    expect(motion.flight).toBeNull();
    // Nothing turns over when every hand is shown already.
    expect(motionFor(round, at(last - 1), at(last), step, 1, options).reveal).toEqual([]);
  });
});
