import { describe, expect, it } from "vitest";
import type { Quad, Round, Seat } from "../../core/model";
import type { Tile } from "../../core/tile";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState, DiscardView, SeatView } from "../../replay/types";
import { tiles } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { round as fixtureRound } from "../__fixtures__/game";
import { drawWaits, nextDiscard, plateAid, riichiLines } from "./aids";

function view(partial: Partial<SeatView> = {}): SeatView {
  return {
    hand: [],
    drawn: null,
    melds: [],
    kita: [],
    discards: [],
    score: 25000,
    riichi: false,
    ...partial,
  };
}

const pond = (spec: string): DiscardView[] =>
  tiles(spec).map((tile) => ({ tile, tsumogiri: false, riichi: false, called: false }));

/** A board with these seat views (others empty). */
function board(seats: Partial<Record<Seat, Partial<SeatView>>>): BoardState {
  return {
    seats: ([0, 1, 2, 3] as const).map((seat) => view(seats[seat])) as Quad<SeatView>,
    doraIndicators: [],
    riichiSticks: 0,
    honba: 0,
    wallRemaining: 50,
    eventIndex: 0,
    lastEvent: null,
    activeSeat: null,
    results: [],
  };
}

const TENPAI = tiles("123m456p789s11z23s"); // waits 1s 4s
const opts = { pov: 0 as Seat, revealed: false, playerCount: 4 as const };

describe("plateAid", () => {
  it("gives the POV choosing a discard its shanten", () => {
    expect(plateAid(board({ 0: { hand: TENPAI, drawn: "5z" } }), 0, opts)).toEqual({
      kind: "shanten",
      value: 0,
    });
    expect(plateAid(board({ 0: { hand: TENPAI, drawn: "4s" } }), 0, opts)).toEqual({
      kind: "shanten",
      value: -1,
    });
    expect(
      plateAid(board({ 0: { hand: tiles("123m46p78s11z2358s"), drawn: "5p" } }), 0, opts),
    ).toEqual({ kind: "shanten", value: 1 });
  });

  it("gives a tenpai POV its waits, the tiles left from its view and furiten", () => {
    expect(plateAid(board({ 0: { hand: TENPAI } }), 0, opts)).toEqual({
      kind: "waits",
      tiles: ["1s", "4s"],
      left: 8,
      furiten: false,
    });
    const seen = board({ 0: { hand: TENPAI }, 2: { discards: pond("1s4s") } });
    expect(plateAid(seen, 0, opts)).toMatchObject({ left: 6, furiten: false });
    const furiten = board({ 0: { hand: TENPAI, discards: pond("4s") } });
    expect(plateAid(furiten, 0, opts)).toMatchObject({ left: 7, furiten: true });
  });

  it("gives a POV that is not tenpai its shanten", () => {
    expect(plateAid(board({ 0: { hand: tiles("123m456p78s11z235s") } }), 0, opts)).toEqual({
      kind: "shanten",
      value: 1,
    });
  });

  it("gives hidden opponents nothing, revealed tenpai opponents their waits", () => {
    const state = board({ 0: { hand: tiles("1s1s") }, 1: { hand: TENPAI } });
    expect(plateAid(state, 1, opts)).toBeNull();
    // Left counts from seat 1's view: seat 0's two 1s are in a hand seat 1 cannot see.
    expect(plateAid(state, 1, { ...opts, revealed: true })).toEqual({
      kind: "waits",
      tiles: ["1s", "4s"],
      left: 8,
      furiten: false,
    });
  });

  it("gives revealed opponents that are not tenpai nothing", () => {
    const state = board({ 1: { hand: tiles("123m456p78s11z235s") } });
    expect(plateAid(state, 1, { ...opts, revealed: true })).toBeNull();
  });

  it("keeps an opponent's waits while it holds its drawn tile", () => {
    const state = board({ 1: { hand: TENPAI, drawn: "9m" } });
    expect(plateAid(state, 1, { ...opts, revealed: true })).toMatchObject({
      kind: "waits",
      tiles: ["1s", "4s"],
    });
  });

  it("shows an opponent's tenpai right after a call, nothing otherwise", () => {
    const melds = [{ type: "pon" as const, tiles: ["5z", "5z"] as Tile[], from: 0 as Seat }];
    // 11 tiles after the pon: discarding 9m leaves a tenpai hand.
    const tenpai = board({ 1: { hand: tiles("123m456p11z23s9m"), melds } });
    expect(plateAid(tenpai, 1, { ...opts, revealed: true })).toEqual({
      kind: "shanten",
      value: 0,
    });
    const far = board({ 1: { hand: tiles("147m258p11z23s9m"), melds } });
    expect(plateAid(far, 1, { ...opts, revealed: true })).toBeNull();
  });

  it("gives nothing for a hand with an unknown tile", () => {
    const state = board({ 0: { hand: [...TENPAI.slice(1), "?"] } });
    expect(plateAid(state, 0, opts)).toBeNull();
  });

  it("counts a tenpai shape without a live wait as not tenpai", () => {
    // Every 1m is in the hand: noten, as on Tenhou.
    expect(plateAid(board({ 0: { hand: tiles("1111m456p789s123s") } }), 0, opts)).toEqual({
      kind: "shanten",
      value: 1,
    });
    // Drawing 5z: discarding a 1m leaves a live 5z tanki.
    expect(
      plateAid(board({ 0: { hand: tiles("1111m456p789s123s"), drawn: "5z" } }), 0, opts),
    ).toEqual({ kind: "shanten", value: 0 });
  });

  it("works for three players", () => {
    const state = board({ 0: { hand: tiles("123p456p789s11z99m") }, 1: { discards: pond("9m") } });
    expect(plateAid(state, 0, { ...opts, playerCount: 3 })).toEqual({
      kind: "waits",
      tiles: ["9m", "1z"],
      left: 3,
      furiten: false,
    });
  });
});

describe("nextDiscard", () => {
  const states = buildTimeline(fixtureRound);

  it("marks the tsumogiri drawn tile, a tedashi tile and the discard after a call", () => {
    expect(nextDiscard(states, 1, 0)).toEqual({ tile: "5z", drawn: true });
    expect(nextDiscard(states, 3, 1)).toEqual({ tile: "9m", drawn: false });
    // Seat 2 has just called pon: its next step is the discard.
    expect(nextDiscard(states, 5, 2)).toEqual({ tile: "1z", drawn: false });
  });

  it("is null when the next step is not the POV's discard", () => {
    expect(nextDiscard(states, 2, 0)).toBeNull();
    expect(nextDiscard(states, 3, 0)).toBeNull();
    expect(nextDiscard(states, states.length - 3, 0)).toEqual({ tile: "1p", drawn: true });
    expect(nextDiscard(states, states.length - 2, 0)).toBeNull();
    expect(nextDiscard(states, states.length - 1, 1)).toBeNull();
    expect(nextDiscard(states, 99, 0)).toBeNull();
  });
});

describe("riichiLines", () => {
  const sanma = sanmaCrossFormatGame();
  const lines = (index: number) => {
    const round = sanma.rounds[index] as Round;
    return riichiLines(round, buildTimeline(round, 3), 3);
  };

  it("lists a riichi that did not win, without tiles left", () => {
    expect(lines(0)).toEqual([
      expect.objectContaining({ seat: 1, turn: 2, winner: false, left: null }),
    ]);
    expect(lines(0)[0]?.waits.length).toBeGreaterThan(0);
  });

  it("gives the winner's waits and the tiles left at the declaration", () => {
    // East 2: seat 0 declares on a North tanki and wins on the North seat 2 sets aside.
    expect(lines(2)).toEqual([{ seat: 0, turn: 2, waits: ["4z"], left: 3, winner: true }]);
  });

  it("is empty without a riichi", () => {
    expect(lines(1)).toEqual([]);
  });
});

describe("drawWaits", () => {
  it("gives the waits of each tenpai seat at an exhaustive draw", () => {
    const sanma = sanmaCrossFormatGame();
    for (const index of [3, 4]) {
      const states = buildTimeline(sanma.rounds[index] as Round, 3);
      const last = states[states.length - 1] as BoardState;
      const result = last.results[0];
      const found = drawWaits(last.results, last.seats, 3);
      expect(Object.keys(found).map(Number)).toEqual(
        result?.type === "ryukyoku" ? result.tenpai : [],
      );
      for (const tilesOfSeat of Object.values(found)) {
        expect(tilesOfSeat.length).toBeGreaterThan(0);
      }
    }
  });

  it("ignores wins", () => {
    const states = buildTimeline(fixtureRound);
    const last = states[states.length - 1] as BoardState;
    expect(drawWaits(last.results, last.seats, 4)).toEqual({});
  });
});
