import { describe, expect, it } from "vitest";
import type { Seat } from "../../core/model";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState, SeatView } from "../../replay/types";
import { round } from "../__fixtures__/game";
import { revealedSeats } from "../reveal";
import type { ViewerState } from "../viewer/types";
import { CAMERAS, cameraFor, OPP_ROW_START, OWN_HAND, POND, pondSlot, project } from "./geometry";
import { flightOffset, motionFor, ownHandLine } from "./motion";

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

describe("ownHandLine", () => {
  it("puts the own hand's centre line just beyond the near edge, in every camera", () => {
    const line = ownHandLine(CAMERAS.wide, 14.4);
    expect(line.y).toBeCloseTo(20.98, 2);
    expect(line.tw).toBeCloseTo(OWN_HAND.tile);
    expect(line.scale).toBeGreaterThan(1);
    for (const camera of [CAMERAS.short, CAMERAS.stack, cameraFor("wide", "flat")]) {
      expect(ownHandLine(camera, 14.4).y).toBeGreaterThan(20);
    }
  });

  it("is the line two thirds of a tile above the frame's bottom", () => {
    for (const camera of [CAMERAS.wide, CAMERAS.stack, cameraFor("stack", "flat")]) {
      const { y, tw } = ownHandLine(camera, 14.4);
      expect((camera.below + project(10, y, camera).up) * 20).toBeCloseTo((2 / 3) * tw);
    }
  });

  it("makes the tiles smaller when the row is longer than the frame", () => {
    expect(ownHandLine(CAMERAS.wide, 16).tw).toBeCloseTo((20 * OWN_HAND.fit) / 16);
  });
});

describe("flightOffset", () => {
  const slot = pondSlot(0);

  it("flies an opponent's discard from the end of its hand row", () => {
    const view = seat();
    const { fx, fy, fs, drop } = flightOffset(
      { seat: 1, index: 0, source: "opponent", riichi: false },
      view,
      CAMERAS.wide,
      14,
    );
    expect(fx).toBeCloseTo(0.4 + 13.9 - slot.x);
    expect(fy).toBeCloseTo(18.88 - slot.y);
    expect(fs).toBeCloseTo(1 / POND.tile);
    // An opponent's hand lies on the plane: a tall dock does not move it.
    expect(drop).toBe(0);
  });

  it("starts where the opponent's row starts", () => {
    const { fx } = flightOffset(
      { seat: 1, index: 0, source: "opponent", riichi: false },
      seat(),
      CAMERAS.wide,
      14,
      { start: OPP_ROW_START.right, hs: 1 },
    );
    expect(fx).toBeCloseTo(OPP_ROW_START.right + 13.9 - slot.x);
  });

  it("flies the point of view's discard up from its own hand", () => {
    const view = seat({ hand: Array(13).fill("1m") });
    const drawn = flightOffset(
      { seat: 0, index: 0, source: "drawn", riichi: false },
      view,
      CAMERAS.wide,
      14.4,
    );
    const hand = flightOffset(
      { seat: 0, index: 0, source: "hand", riichi: false },
      view,
      CAMERAS.wide,
      14.4,
    );
    expect(drawn.fy).toBeCloseTo(20.98 - slot.y, 1);
    // The proxy starts as large as an own tile looks, which stands a little nearer than the edge.
    const { scale } = ownHandLine(CAMERAS.wide, 14.4);
    expect(drawn.fs).toBeCloseTo(OWN_HAND.tile / (POND.tile * scale));
    // The drawn tile is right of the centre line, a tile from mid-hand left of it.
    expect(slot.x + drawn.fx).toBeGreaterThan(10);
    expect(slot.x + hand.fx).toBeLessThan(10);
    // Each pixel a tall dock pushes the hand down moves the start a little more on the plane.
    expect(drawn.drop).toBeCloseTo(1 / (CAMERAS.wide.cos * scale * scale));
    expect(hand.drop).toBe(drawn.drop);
  });

  it("lands on the slot of a long pond's shrunken tiles", () => {
    const discards = Array.from({ length: 24 }, () => ({
      tile: "9s" as const,
      tsumogiri: false,
      riichi: false,
      called: false,
    }));
    const view = seat({ discards });
    const target = pondSlot(23, discards);
    const { fx, fs } = flightOffset(
      { seat: 1, index: 23, source: "opponent", riichi: false },
      view,
      CAMERAS.wide,
      14,
    );
    expect(target.tile).toBeLessThan(POND.tile);
    expect(fx).toBeCloseTo(0.4 + 13.9 - target.x);
    expect(fs).toBeCloseTo(1 / target.tile);
  });

  it("starts smaller for a scaled-down opponent row", () => {
    // 13 tiles, kita and four melds do not fit the row.
    const view = seat({
      melds: Array(4).fill({ type: "pon", tiles: ["5p", "5p"], from: 2, calledTile: "5p" }),
      kita: ["4z"],
    });
    const { fs } = flightOffset(
      { seat: 1, index: 0, source: "opponent", riichi: false },
      view,
      CAMERAS.wide,
      14,
    );
    expect(fs).toBeLessThan(1 / POND.tile);
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
