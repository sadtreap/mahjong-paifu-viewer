import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Round, RoundEvent, Seat } from "../core/model";
import type { Tile } from "../core/tile";
import { parseTenhouJson } from "../formats/tenhou-json/parse";
import {
  ankan,
  chi,
  daiminkan,
  discard,
  dora,
  draw,
  kakan,
  kita,
  makeRound,
  makeSanmaRound,
  pon,
  riichiAccepted,
  ryukyoku,
  sampleRound,
  sampleSanmaRound,
  tiles,
  tsumogiri,
  wallDraw,
  wallRound,
  win,
} from "../test/round-builder";
import { checkRound } from "./check";
import { RoundReplay } from "./engine";
import { buildTimeline } from "./timeline";

const unknownHand = (): Tile[] => tiles("?????????????");

/** The tenhou.net/6 fixtures: real games with riichi, double ron, four riichi and kans. */
const TENHOU_DIR = join(
  import.meta.dirname,
  "..",
  "formats",
  "tenhou-json",
  "__fixtures__",
  "convlog",
);
const TENHOU_FIXTURES = readdirSync(TENHOU_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

const at = <T>(list: readonly T[], index: number): T => {
  const item = list[index];
  if (item === undefined) {
    throw new Error(`No entry at index ${index}`);
  }
  return item;
};

describe("buildTimeline", () => {
  it("starts with the sorted deal", () => {
    const round = makeRound({
      hands: [tiles("5m?1z0m9p1m2m3m4m6m7m8m1p"), tiles("1112345678999p"), [], unknownHand()],
      scores: [26000, 24000, 30000, 20000],
      doraIndicators: ["3p"],
      honba: 2,
      riichiSticks: 1,
    });
    const timeline = buildTimeline(round);
    expect(timeline).toHaveLength(1);
    const start = at(timeline, 0);
    expect(start).toMatchObject({
      doraIndicators: ["3p"],
      riichiSticks: 1,
      honba: 2,
      wallRemaining: 70,
      eventIndex: -1,
      lastEvent: null,
      activeSeat: null,
      results: [],
    });
    expect(start.seats[0]).toEqual({
      hand: tiles("123405678m19p1z?"),
      drawn: null,
      melds: [],
      kita: [],
      discards: [],
      score: 26000,
      riichi: false,
    });
    expect(start.seats.map((seat) => seat.score)).toEqual([26000, 24000, 30000, 20000]);
    expect(start.seats[2].hand).toEqual([]);
  });

  it("puts a draw apart and removes it again on tsumogiri", () => {
    const events = [draw(0, "5p"), tsumogiri(0, "5p")];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(3);
    const [deal, drawn, discarded] = [at(timeline, 0), at(timeline, 1), at(timeline, 2)];
    expect(drawn.seats[0].drawn).toBe("5p");
    expect(drawn.seats[0].hand).toEqual(deal.seats[0].hand);
    expect(drawn).toMatchObject({
      wallRemaining: 69,
      eventIndex: 0,
      lastEvent: events[0],
      activeSeat: 0,
    });
    expect(discarded.seats[0].drawn).toBeNull();
    expect(discarded.seats[0].hand).toEqual(deal.seats[0].hand);
    expect(discarded.seats[0].discards).toEqual([
      { tile: "5p", tsumogiri: true, riichi: false, called: false },
    ]);
    expect(discarded.wallRemaining).toBe(69);
  });

  it("removes a hand discard and sorts the drawn tile into the hand", () => {
    const timeline = buildTimeline(makeRound({ events: [draw(0, "0m"), discard(0, "1m")] }));
    expect(at(timeline, 1).seats[0].hand).toEqual(tiles("1112345678999m"));
    const after = at(timeline, 2).seats[0];
    expect(after.hand).toEqual(tiles("1123405678999m"));
    expect(after.drawn).toBeNull();
    expect(after.discards).toEqual([
      { tile: "1m", tsumogiri: false, riichi: false, called: false },
    ]);
  });

  it("applies a chi and marks the called discard", () => {
    const events = [draw(0, "5p"), tsumogiri(0, "5p"), chi(1, 0, "5p", "64p"), discard(1, "1p")];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(5);
    expect(at(timeline, 2).seats[0].discards[0]?.called).toBe(false);
    const afterCall = at(timeline, 3);
    expect(afterCall.activeSeat).toBe(1);
    expect(afterCall.seats[0].discards).toEqual([
      { tile: "5p", tsumogiri: true, riichi: false, called: true },
    ]);
    expect(afterCall.seats[1]).toMatchObject({
      hand: tiles("11123578999p"),
      drawn: null,
      melds: [{ type: "chi", tiles: ["4p", "6p"], from: 0, calledTile: "5p" }],
    });
    const afterDiscard = at(timeline, 4).seats[1];
    expect(afterDiscard.hand).toEqual(tiles("1123578999p"));
    expect(afterDiscard.discards).toEqual([
      { tile: "1p", tsumogiri: false, riichi: false, called: false },
    ]);
  });

  it("upgrades a pon with red fives to a kakan in place", () => {
    const events: RoundEvent[] = [
      draw(0, "5p"),
      tsumogiri(0, "5p"),
      pon(2, 0, "5p", "50p"),
      discard(2, "1z"),
      draw(3, "?"),
      tsumogiri(3, "9m"),
      draw(0, "9p"),
      tsumogiri(0, "9p"),
      draw(1, "?"),
      tsumogiri(1, "8m"),
      draw(2, "5p"), // 10
      kakan(2, "5p"),
      draw(2, "4z"),
      discard(2, "1z"),
      dora("6s"),
    ];
    const hands: Round["hands"] = [
      tiles("1112345678999m"),
      unknownHand(),
      tiles("05p12345678s111z"),
      unknownHand(),
    ];
    const timeline = buildTimeline(makeRound({ hands, events }));
    expect(timeline).toHaveLength(15);
    const pon3 = { type: "pon", tiles: ["0p", "5p"], from: 0, calledTile: "5p" };
    expect(at(timeline, 3).seats[2].melds).toEqual([pon3]);
    expect(at(timeline, 3).seats[2].hand).toEqual(tiles("12345678s111z"));
    expect(at(timeline, 3).seats[0].discards[0]?.called).toBe(true);

    const afterKakan = at(timeline, 12).seats[2];
    expect(afterKakan.melds).toEqual([{ ...pon3, type: "kakan", addedTile: "5p" }]);
    expect(afterKakan.hand).toEqual(tiles("12345678s11z"));
    expect(afterKakan.drawn).toBeNull();
    // Earlier snapshots keep the pon.
    expect(at(timeline, 11).seats[2].melds).toEqual([pon3]);

    expect(at(timeline, 13).seats[2].drawn).toBe("4z");
    expect(at(timeline, 13).wallRemaining).toBe(64);
    expect(at(timeline, 14)).toMatchObject({
      doraIndicators: ["1z", "6s"],
      eventIndex: 14,
      lastEvent: events[13],
      activeSeat: 2,
    });
  });

  it("takes a kakan tile from the hand and merges the drawn tile", () => {
    const hands: Round["hands"] = [
      tiles("1112345678999m"),
      unknownHand(),
      tiles("055p2345678s111z"),
      unknownHand(),
    ];
    const events = [
      draw(0, "5p"),
      tsumogiri(0, "5p"),
      pon(2, 0, "5p", "05p"),
      discard(2, "1z"),
      draw(2, "9s"),
      kakan(2, "5p"),
    ];
    const last = at(buildTimeline(makeRound({ hands, events })), 6).seats[2];
    expect(last.hand).toEqual(tiles("23456789s11z"));
    expect(last.drawn).toBeNull();
    expect(last.melds).toEqual([
      { type: "kakan", tiles: ["0p", "5p"], from: 0, calledTile: "5p", addedTile: "5p" },
    ]);
  });

  it("applies a daiminkan, its rinshan draw and the folded kan dora", () => {
    const events = [
      draw(0, "1p"),
      tsumogiri(0, "1p"),
      daiminkan(1, 0, "1p", "111p"),
      draw(1, "7z"),
      dora("3m"),
      discard(1, "2p"),
    ];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(6);
    expect(at(timeline, 3).seats[1]).toMatchObject({
      hand: tiles("2345678999p"),
      drawn: null,
      melds: [{ type: "daiminkan", tiles: ["1p", "1p", "1p"], from: 0, calledTile: "1p" }],
    });
    expect(at(timeline, 3).seats[0].discards[0]?.called).toBe(true);
    expect(at(timeline, 4)).toMatchObject({
      wallRemaining: 68,
      doraIndicators: ["1z", "3m"],
      eventIndex: 4,
      lastEvent: events[3],
      activeSeat: 1,
    });
    expect(at(timeline, 4).seats[1].drawn).toBe("7z");
    expect(at(timeline, 5).seats[1].hand).toEqual(tiles("345678999p7z"));
  });

  it("applies an ankan from the hand and the drawn red five", () => {
    const hands: Round["hands"] = [
      tiles("1112345678999m"),
      tiles("1112345678999p"),
      tiles("555s123456789p1z"),
      tiles("1122334455667z"),
    ];
    const events = [draw(2, "0s"), ankan(2, "0555s"), dora("2z"), draw(2, "3z"), discard(2, "1z")];
    const timeline = buildTimeline(makeRound({ dealer: 2, number: 3, hands, events }));
    expect(timeline).toHaveLength(5);
    const afterKan = at(timeline, 2);
    expect(afterKan.seats[2]).toMatchObject({
      hand: tiles("123456789p1z"),
      drawn: null,
      melds: [{ type: "ankan", tiles: ["0s", "5s", "5s", "5s"] }],
    });
    expect(afterKan.seats[2].melds[0]).not.toHaveProperty("from");
    expect(afterKan).toMatchObject({
      doraIndicators: ["1z", "2z"],
      eventIndex: 2,
      lastEvent: events[1],
      activeSeat: 2,
    });
    expect(at(timeline, 4).seats[2].hand).toEqual(tiles("123456789p3z"));
    expect(at(timeline, 4).wallRemaining).toBe(68);
  });

  it("folds riichiAccepted into the riichi discard and charges the deposit", () => {
    const events = [
      draw(0, "7z"),
      discard(0, "1m", { riichi: true }),
      riichiAccepted(0),
      draw(1, "6z"),
      tsumogiri(1, "6z"),
    ];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(5);
    expect(at(timeline, 1).seats[0]).toMatchObject({ riichi: false, score: 25000 });
    const riichi = at(timeline, 2);
    expect(riichi).toMatchObject({
      riichiSticks: 1,
      eventIndex: 2,
      lastEvent: events[1],
      activeSeat: 0,
    });
    expect(riichi.seats[0]).toMatchObject({ riichi: true, score: 24000 });
    expect(riichi.seats[0].discards).toEqual([
      { tile: "1m", tsumogiri: false, riichi: true, called: false },
    ]);
    expect(at(timeline, 4).seats[0].riichi).toBe(true);
    expect(at(timeline, 4).riichiSticks).toBe(1);
  });

  it("shows the riichi stick on the discard step when a dora and the acceptance fold into it", () => {
    const events = [
      draw(0, "7z"),
      discard(0, "1m", { riichi: true }),
      dora("2z"),
      riichiAccepted(0),
      draw(1, "6z"),
    ];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(4);
    expect(at(timeline, 2)).toMatchObject({ eventIndex: 3, lastEvent: events[1], riichiSticks: 1 });
    expect(at(timeline, 2).seats[0]).toMatchObject({ riichi: true, score: 24000 });
  });

  it("shows no riichi stick for a declaration that is never accepted", () => {
    const events = [
      draw(0, "7z"),
      discard(0, "1m", { riichi: true }),
      draw(1, "6z"),
      tsumogiri(1, "6z"),
    ];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(5);
    for (const state of timeline.slice(2)) {
      expect(state.riichiSticks).toBe(0);
      expect(state.seats[0]).toMatchObject({ riichi: false, score: 25000 });
      // The declaration tile still lies sideways in the pond.
      expect(state.seats[0].discards[0]).toMatchObject({ tile: "1m", riichi: true });
    }
  });

  it("shows no riichi stick for a riichi declaration that is ronned", () => {
    const events = [
      draw(0, "7z"),
      tsumogiri(0, "7z"),
      draw(1, "6z"),
      tsumogiri(1, "6z"),
      draw(2, "5z"),
      discard(2, "1s", { riichi: true }),
      win(3, 2, [0, 0, -8000, 8000]),
    ];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(8);
    const declaration = at(timeline, 6);
    expect(declaration).toMatchObject({ lastEvent: events[5], riichiSticks: 0 });
    expect(declaration.seats[2]).toMatchObject({ riichi: false, score: 25000 });
    expect(declaration.seats[2].discards[0]).toMatchObject({ tile: "1s", riichi: true });
    const end = at(timeline, 7);
    expect(end.seats[2]).toMatchObject({ riichi: false, score: 17000 });
    expect(end.seats.map((seat) => seat.riichi)).toEqual([false, false, false, false]);
    expect(end.riichiSticks).toBe(0);
  });

  it("shows no riichi stick for a riichi declaration taken by a double ron", () => {
    const first = win(1, 0, [-8000, 8000, 0, 0]);
    const second = win(3, 0, [-3900, 0, 0, 3900]);
    const events = [draw(0, "7z"), discard(0, "1m", { riichi: true }), first, second];
    const timeline = buildTimeline(makeRound({ riichiSticks: 1, events }));
    expect(timeline).toHaveLength(4);
    expect(at(timeline, 2).seats[0]).toMatchObject({ riichi: false, score: 25000 });
    expect(at(timeline, 2).riichiSticks).toBe(1);
    const end = at(timeline, 3);
    expect(end).toMatchObject({ lastEvent: first, results: [first, second], riichiSticks: 0 });
    expect(end.seats.map((seat) => seat.riichi)).toEqual([false, false, false, false]);
    expect(end.seats.map((seat) => seat.score)).toEqual([13100, 33000, 25000, 28900]);
  });

  it("shows no riichi stick for a double riichi ronned on the first discard", () => {
    const ron = win(3, 0, [-12000, 0, 0, 12000]);
    const events = [draw(0, "7z"), discard(0, "1m", { riichi: true }), ron];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(4);
    expect(at(timeline, 2).seats[0]).toMatchObject({ riichi: false, score: 25000 });
    expect(at(timeline, 3).seats[0]).toMatchObject({ riichi: false, score: 13000 });
    expect(at(timeline, 3).riichiSticks).toBe(0);
  });

  it("shows each double riichi stick from its own step up to a four-riichi abortive draw", () => {
    const hands: Round["hands"] = [unknownHand(), unknownHand(), unknownHand(), unknownHand()];
    const events: RoundEvent[] = [];
    for (const seat of [0, 1, 2, 3] as const) {
      events.push(draw(seat, "?"), discard(seat, "9m", { riichi: true }), riichiAccepted(seat));
    }
    events.push(ryukyoku("suuchaRiichi"));
    const timeline = buildTimeline(makeRound({ hands, events }));
    expect(timeline).toHaveLength(10);
    const riichiFlags = (index: number) => at(timeline, index).seats.map((seat) => seat.riichi);
    expect(riichiFlags(1)).toEqual([false, false, false, false]);
    expect(riichiFlags(2)).toEqual([true, false, false, false]);
    expect(riichiFlags(3)).toEqual([true, false, false, false]);
    expect(riichiFlags(4)).toEqual([true, true, false, false]);
    expect(riichiFlags(6)).toEqual([true, true, true, false]);
    expect(riichiFlags(7)).toEqual([true, true, true, false]);
    expect(riichiFlags(8)).toEqual([true, true, true, true]);
    expect(at(timeline, 8).riichiSticks).toBe(4);
    const end = at(timeline, 9);
    expect(end.seats.map((seat) => seat.riichi)).toEqual([true, true, true, true]);
    // An abortive draw leaves the deposits on the table.
    expect(end.riichiSticks).toBe(4);
    expect(end.seats.map((seat) => seat.score)).toEqual([24000, 24000, 24000, 24000]);
  });

  it("shows no riichi stick for a riichi declaration aborted by a triple ron", () => {
    const events = [draw(0, "7z"), discard(0, "1m", { riichi: true }), ryukyoku("sanchaHou")];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline.at(-1)?.seats[0]).toMatchObject({ riichi: false, score: 25000 });
    expect(timeline.at(-1)?.riichiSticks).toBe(0);
  });

  it("keeps the stick of an accepted riichi when a later riichi discard is ronned", () => {
    // Seat 3 declares riichi at event 7 (accepted at 8); seat 2's riichi discard at 14 is ronned.
    const declared = wallDraw(6);
    const round = wallRound({
      draws: 6,
      riichiAt: [3],
      results: [
        draw(2, declared),
        discard(2, declared, { tsumogiri: true, riichi: true }),
        win(3, 2, [0, 0, -8000, 9000]),
      ],
    });
    expect(round.events[7]).toMatchObject({ type: "discard", seat: 3, riichi: true });
    expect(round.events[8]).toEqual(riichiAccepted(3));
    expect(round.events[14]).toMatchObject({ type: "discard", seat: 2, riichi: true });
    expect(round.events[15]).toMatchObject({ type: "win", seat: 3, from: 2 });
    const timeline = buildTimeline(round);
    const declaration = timeline.find((state) => state.eventIndex === 14);
    const end = timeline.at(-1);
    expect(declaration?.seats.map((seat) => seat.riichi)).toEqual([false, false, false, true]);
    expect(declaration?.riichiSticks).toBe(1);
    expect(end?.seats.map((seat) => seat.riichi)).toEqual([false, false, false, true]);
    expect(end?.seats[2].discards.at(-1)).toMatchObject({ tile: declared, riichi: true });
  });

  it.each(TENHOU_FIXTURES)("shows a riichi stick exactly for accepted riichi in %s", (name) => {
    const game = parseTenhouJson(readFileSync(join(TENHOU_DIR, name), "utf-8"));
    for (const round of game.rounds) {
      for (const state of buildTimeline(round)) {
        const accepted = new Set(
          round.events
            .slice(0, state.eventIndex + 1)
            .flatMap((event) => (event.type === "riichiAccepted" ? [event.seat] : [])),
        );
        expect(state.seats.map((seat) => seat.riichi)).toEqual(
          [0, 1, 2, 3].map((seat) => accepted.has(seat as Seat)),
        );
      }
    }
  });

  it("shows multiple ron as one step and collects the deposits", () => {
    const first = win(1, 0, [-8000, 9000, 0, 0]);
    const second = win(3, 0, [-3900, 0, 0, 3900]);
    const events = [draw(0, "7z"), tsumogiri(0, "7z"), first, second];
    const timeline = buildTimeline(makeRound({ riichiSticks: 1, events }));
    expect(timeline).toHaveLength(4);
    expect(at(timeline, 2)).toMatchObject({ riichiSticks: 1, results: [] });
    const end = at(timeline, 3);
    expect(end).toMatchObject({
      riichiSticks: 0,
      eventIndex: 3,
      lastEvent: first,
      activeSeat: 1,
      results: [first, second],
    });
    expect(end.seats.map((seat) => seat.score)).toEqual([13100, 34000, 25000, 28900]);
  });

  it("keeps a leading dora event as its own step", () => {
    const events = [dora("2z"), draw(0, "7z")];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(3);
    expect(at(timeline, 0).doraIndicators).toEqual(["1z"]);
    expect(at(timeline, 1)).toMatchObject({
      doraIndicators: ["1z", "2z"],
      lastEvent: events[0],
      activeSeat: null,
      eventIndex: 0,
    });
  });

  it("replays the sample round step by step", () => {
    const round = sampleRound();
    const timeline = buildTimeline(round);
    expect(timeline.map((state) => state.eventIndex)).toEqual([
      -1, 0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 22, 23, 24, 25, 26, 27,
    ]);
    expect(at(timeline, 5).seats[3].melds[0]?.type).toBe("pon");
    expect(at(timeline, 15).seats[3].melds[0]).toEqual({
      type: "kakan",
      tiles: ["9s", "9s"],
      from: 1,
      calledTile: "9s",
      addedTile: "9s",
    });
    const beforeWin = at(timeline, 23);
    expect(beforeWin.seats.map((seat) => seat.score)).toEqual([24000, 25000, 25000, 25000]);
    expect(beforeWin.riichiSticks).toBe(1);
    expect(beforeWin.seats[0].hand).toEqual(tiles("99m123789p66z"));
    const end = at(timeline, 24);
    expect(end).toMatchObject({
      wallRemaining: 61,
      doraIndicators: ["2z", "3p", "8s", "1m"],
      riichiSticks: 0,
      activeSeat: 0,
      lastEvent: round.events[27],
      results: [round.events[27]],
    });
    expect(end.seats.map((seat) => seat.score)).toEqual([37000, 13000, 25000, 25000]);
    expect(end.seats.map((seat) => seat.melds.map((meld) => meld.type))).toEqual([
      ["ankan"],
      ["chi"],
      ["daiminkan"],
      ["kakan"],
    ]);
    expect(end.seats[0].discards.map((discard) => discard.riichi)).toEqual([false, true, false]);
  });

  it("applies draw results and keeps the deposits on the table", () => {
    const result = ryukyoku("exhaustive", [-1000, 3000, -1000, -1000], { tenpai: [1] });
    const timeline = buildTimeline(wallRound({ draws: 70, riichiAt: [5], results: [result] }));
    expect(timeline).toHaveLength(142);
    const end = at(timeline, 141);
    expect(end).toMatchObject({
      wallRemaining: 0,
      riichiSticks: 1,
      activeSeat: null,
      results: [result],
    });
    expect(end.seats.map((seat) => seat.score)).toEqual([24000, 27000, 24000, 24000]);
    expect(at(timeline, 140).seats[1].score).toBe(24000);
  });

  it("never counts the wall below zero", () => {
    const events = Array.from({ length: 75 }, (_, n) => {
      const seat = (n % 4) as Seat;
      return [draw(seat, "?"), tsumogiri(seat, "1m")];
    }).flat();
    const timeline = buildTimeline(makeRound({ hands: [[], [], [], []], events }));
    expect(at(timeline, 139).wallRemaining).toBe(0);
    expect(at(timeline, 140).wallRemaining).toBe(0);
    expect(timeline.at(-1)?.wallRemaining).toBe(0);
  });

  it('removes "?" when a hand recorded from another seat lacks the tile', () => {
    const hands: Round["hands"] = [
      tiles("123456789m111p?"),
      unknownHand(),
      unknownHand(),
      unknownHand(),
    ];
    const events = [
      draw(0, "5z"),
      discard(0, "7z"),
      pon(2, 0, "7z", "77z"),
      discard(2, "3s"),
      draw(3, "?"),
      tsumogiri(3, "4p"),
      draw(0, "6z"),
      discard(0, "1m"),
    ];
    const timeline = buildTimeline(makeRound({ hands, events }));
    expect(at(timeline, 2).seats[0].hand).toEqual(tiles("123456789m111p5z"));
    expect(at(timeline, 3).seats[2].hand).toEqual(tiles("???????????"));
    expect(at(timeline, 3).seats[2].melds).toEqual([
      { type: "pon", tiles: ["7z", "7z"], from: 0, calledTile: "7z" },
    ]);
    expect(at(timeline, 4).seats[2].hand).toHaveLength(10);
    expect(at(timeline, 6).seats[3]).toMatchObject({
      hand: unknownHand(),
      drawn: null,
      discards: [{ tile: "4p", tsumogiri: true, riichi: false, called: false }],
    });
    expect(at(timeline, 8).seats[0].hand).toEqual(tiles("23456789m111p56z"));
  });

  it("does its best with inconsistent events", () => {
    const events: RoundEvent[] = [
      draw(0, "9p"),
      discard(0, "7z"), // not in the hand
      discard(1, "3s", { tsumogiri: true }), // nothing drawn
      kakan(3, "1z"), // no pon
    ];
    const timeline = buildTimeline(makeRound({ events }));
    expect(timeline).toHaveLength(5);
    expect(at(timeline, 2).seats[0].hand).toEqual(tiles("1112345678999m9p"));
    expect(at(timeline, 2).seats[0].discards[0]?.tile).toBe("7z");
    expect(at(timeline, 3).seats[1].hand).toEqual(tiles("1112345678999p"));
    expect(at(timeline, 4).seats[3].hand).toEqual(tiles("122334455667z"));
    expect(at(timeline, 4).seats[3].melds).toEqual([]);
  });

  it("never throws on malformed input", () => {
    const broken = {
      ...makeRound(),
      hands: [tiles("3m1m2m"), null, "junk", undefined],
      scores: [25000, "x"],
      doraIndicators: ["1z", "bad"],
      dealer: 9,
      events: [
        null,
        { type: "draw", seat: 7, tile: "1m" },
        { type: "teleport", seat: 0 },
        { type: "draw", seat: 0, tile: "5x" },
        { type: "discard", seat: 0, tile: 42 },
        { type: "chi", seat: 2, from: 1, tile: "3s" },
        { type: "ankan", seat: 0 },
        { type: "riichiAccepted", seat: 2 },
        { type: "dora", indicator: "x" },
        { type: "win", seat: 0, from: 8 },
        { type: "ryukyoku" },
      ],
    } as unknown as Round;
    const timeline = buildTimeline(broken);
    expect(timeline).toHaveLength(10);
    expect(at(timeline, 0).seats.map((seat) => seat.hand)).toEqual([tiles("123m"), [], [], []]);
    expect(at(timeline, 0).seats.map((seat) => seat.score)).toEqual([25000, 0, 0, 0]);
    expect(at(timeline, 0).doraIndicators).toEqual(["1z"]);
    expect(at(timeline, 4).seats[0].drawn).toBe("?");
    expect(at(timeline, 6).seats[2].melds).toEqual([
      { type: "chi", tiles: [], from: 1, calledTile: "3s" },
    ]);
    expect(timeline.at(-1)?.results).toHaveLength(2);

    for (const value of [null, undefined, {}, { events: "nope" }, { events: [{}, 1, "x"] }]) {
      expect(() => buildTimeline(value as unknown as Round)).not.toThrow();
    }
    expect(buildTimeline(null as unknown as Round)).toHaveLength(1);
  });
});

describe("buildTimeline with three players", () => {
  const hiddenHands = (): Round["hands"] => [unknownHand(), unknownHand(), unknownHand(), []];

  it("starts with a 55-tile wall and an empty seat 3", () => {
    const start = at(buildTimeline(makeSanmaRound(), 3), 0);
    expect(start.wallRemaining).toBe(55);
    expect(start.seats[3]).toEqual({
      hand: [],
      drawn: null,
      melds: [],
      kita: [],
      discards: [],
      score: 0,
      riichi: false,
    });
    expect(start.seats.map((seat) => seat.score)).toEqual([35000, 35000, 35000, 0]);
    // Four players stay the default.
    expect(at(buildTimeline(makeSanmaRound()), 0).wallRemaining).toBe(70);
  });

  it("makes each kita a step of its own and the replacement draw the next step", () => {
    const hands: Round["hands"] = [
      tiles("111234567899p4z"),
      tiles("1112345678999s"),
      tiles("1199m112233556z"),
      [],
    ];
    const events = [
      draw(0, "4z"),
      kita(0), // the drawn North
      draw(0, "4z"),
      kita(0), // the replacement is a North too
      draw(0, "7z"),
      kita(0), // the dealt North, from the hand
      draw(0, "2z"),
      tsumogiri(0, "2z"),
    ];
    const timeline = buildTimeline(makeSanmaRound({ hands, events }), 3);
    expect(timeline).toHaveLength(9);
    expect(timeline.map((state) => state.wallRemaining)).toEqual([
      55, 54, 54, 53, 53, 52, 52, 51, 51,
    ]);
    expect(timeline.map((state) => state.lastEvent?.type ?? null)).toEqual([
      null,
      "draw",
      "kita",
      "draw",
      "kita",
      "draw",
      "kita",
      "draw",
      "discard",
    ]);
    const dealt = tiles("111234567899p4z");
    expect(at(timeline, 2)).toMatchObject({ eventIndex: 1, activeSeat: 0 });
    expect(at(timeline, 2).seats[0]).toMatchObject({ hand: dealt, drawn: null, kita: ["4z"] });
    expect(at(timeline, 3).seats[0]).toMatchObject({ hand: dealt, drawn: "4z", kita: ["4z"] });
    expect(at(timeline, 4).seats[0]).toMatchObject({
      hand: dealt,
      drawn: null,
      kita: ["4z", "4z"],
    });
    // A North from the hand: the drawn 7z joins the hand.
    expect(at(timeline, 6).seats[0]).toMatchObject({
      hand: tiles("111234567899p7z"),
      drawn: null,
      kita: ["4z", "4z", "4z"],
    });
    expect(at(timeline, 7).seats[0].drawn).toBe("2z");
    expect(at(timeline, 8).seats[0]).toMatchObject({
      hand: tiles("111234567899p7z"),
      drawn: null,
      kita: ["4z", "4z", "4z"],
      discards: [{ tile: "2z", tsumogiri: true, riichi: false, called: false }],
    });
    // Snapshots own their kita lists.
    expect(at(timeline, 2).seats[0].kita).toEqual(["4z"]);
    expect(at(timeline, 1).seats[0].kita).toEqual([]);
  });

  it("sets aside a North from a hand recorded from another seat", () => {
    const events = [draw(0, "?"), kita(0), draw(0, "?"), tsumogiri(0, "1p")];
    const timeline = buildTimeline(makeSanmaRound({ hands: hiddenHands(), events }), 3);
    expect(at(timeline, 2).seats[0]).toMatchObject({
      hand: unknownHand(),
      drawn: null,
      kita: ["4z"],
    });
    expect(at(timeline, 4).seats[0].hand).toEqual(unknownHand());
  });

  it("folds a kan dora revealed after a kita into the kita step", () => {
    // Tenhou writes KAKAN, the rinshan draw, KITA, DORA, then the replacement draw.
    const events: RoundEvent[] = [
      draw(0, "?"),
      tsumogiri(0, "1z"),
      draw(1, "?"),
      tsumogiri(1, "2z"),
      draw(2, "?"),
      tsumogiri(2, "5z"),
      pon(0, 2, "5z", "55z"),
      discard(0, "3z"),
      draw(1, "?"),
      tsumogiri(1, "6z"),
      draw(2, "?"), // 10
      tsumogiri(2, "7z"),
      draw(0, "5z"),
      kakan(0, "5z"),
      draw(0, "4z"),
      kita(0), // 15
      dora("1p"),
      draw(0, "?"),
      tsumogiri(0, "6p"),
      ryukyoku("unknown"),
    ];
    const round = makeSanmaRound({ hands: hiddenHands(), events });
    expect(checkRound(round, 3)).toEqual([]);
    const timeline = buildTimeline(round, 3);
    expect(timeline).toHaveLength(20);
    const kitaStep = timeline.find((state) => state.lastEvent === events[15]);
    expect(kitaStep).toMatchObject({ eventIndex: 16, activeSeat: 0, doraIndicators: ["1z", "1p"] });
    expect(kitaStep?.seats[0].kita).toEqual(["4z"]);
    expect(kitaStep?.seats[0].melds).toEqual([
      { type: "kakan", tiles: ["5z", "5z"], from: 2, calledTile: "5z", addedTile: "5z" },
    ]);
    expect(timeline[timeline.indexOf(kitaStep as never) + 1]?.lastEvent).toBe(events[17]);
  });

  it("applies a ron on a set-aside North", () => {
    const ron = win(1, 0, [-3900, 3900, 0, 0], { tile: "4z" });
    const events = [draw(0, "4z"), kita(0), ron];
    const timeline = buildTimeline(makeSanmaRound({ hands: hiddenHands(), events }), 3);
    expect(timeline).toHaveLength(4);
    const end = at(timeline, 3);
    expect(end).toMatchObject({ lastEvent: ron, activeSeat: 1, results: [ron], wallRemaining: 54 });
    expect(end.seats.map((seat) => seat.score)).toEqual([31100, 38900, 35000, 0]);
    expect(end.seats[0].kita).toEqual(["4z"]);
  });

  it("replays the three-player sample round step by step", () => {
    const round = sampleSanmaRound();
    const timeline = buildTimeline(round, 3);
    expect(timeline.map((state) => state.eventIndex)).toEqual([
      -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24,
    ]);
    // Seat 1 sets aside its dealt North; the drawn 5z joins the hand.
    expect(at(timeline, 6).seats[1]).toMatchObject({
      hand: tiles("9p789s2223335z55z"),
      drawn: null,
      kita: ["4z"],
    });
    // The pon across the empty chair.
    expect(at(timeline, 11).seats[0].melds).toEqual([
      { type: "pon", tiles: ["6z", "6z"], from: 2, calledTile: "6z" },
    ]);
    expect(at(timeline, 11).seats[2].discards.at(-1)?.called).toBe(true);
    const end = at(timeline, 23);
    expect(end).toMatchObject({
      wallRemaining: 45,
      doraIndicators: ["1m", "8p"],
      riichiSticks: 0,
      activeSeat: 2,
      lastEvent: round.events[24],
      results: [round.events[24]],
    });
    expect(end.seats.map((seat) => seat.score)).toEqual([35000, 28800, 41200, 0]);
    expect(end.seats.map((seat) => seat.kita)).toEqual([["4z"], ["4z", "4z"], [], []]);
    expect(end.seats.map((seat) => seat.riichi)).toEqual([false, true, false, false]);
    expect(end.seats[0].melds.map((meld) => meld.type)).toEqual(["pon", "ankan"]);
    expect(end.seats[1].hand).toEqual(tiles("9m789s222333555z"));
  });

  it("passes the turn from seat 2 back to seat 0 and never counts the wall below zero", () => {
    const events = Array.from({ length: 58 }, (_, n) => {
      const seat = (n % 3) as Seat;
      return [draw(seat, "?"), tsumogiri(seat, "1m")];
    }).flat();
    const round = makeSanmaRound({ hands: [[], [], [], []], events });
    const issues = checkRound(round, 3);
    expect(issues.filter((found) => /out of turn/.test(found.message))).toEqual([]);
    expect(issues.filter((found) => /empty wall/.test(found.message))).toHaveLength(3);
    const timeline = buildTimeline(round, 3);
    expect(at(timeline, 109).wallRemaining).toBe(0);
    expect(at(timeline, 108).wallRemaining).toBe(1);
    expect(timeline.at(-1)?.wallRemaining).toBe(0);
  });

  it("shows the North it took for a kita whose tile is not recorded", () => {
    const hands: Round["hands"] = [tiles("1112345678999p"), unknownHand(), unknownHand(), []];
    const fromDraw = buildTimeline(
      makeSanmaRound({ hands, events: [draw(0, "4z"), kita(0, "?")] }),
      3,
    );
    expect(at(fromDraw, 2).seats[0]).toMatchObject({
      hand: tiles("1112345678999p"),
      drawn: null,
      kita: ["4z"],
    });
    const hidden = buildTimeline(
      makeSanmaRound({ hands, events: [draw(1, "?"), kita(1, "?")] }),
      3,
    );
    expect(at(hidden, 2).seats[1]).toMatchObject({ hand: unknownHand(), drawn: null, kita: ["?"] });
  });

  it("never throws on malformed kita events", () => {
    const events = [
      { type: "kita", seat: 9, tile: "4z" },
      { type: "kita", seat: 0 },
      { type: "kita", seat: 1, tile: 42 },
      { type: "kita", seat: 2, tile: "5p" },
      null,
    ] as unknown as RoundEvent[];
    const timeline = buildTimeline(makeSanmaRound({ events }), 3);
    expect(timeline).toHaveLength(6);
    expect(at(timeline, 1).seats.map((seat) => seat.kita)).toEqual([[], [], [], []]);
    expect(timeline.at(-1)?.seats.map((seat) => seat.kita)).toEqual([["?"], ["?"], ["5p"], []]);
    expect(timeline.at(-1)?.seats.map((seat) => seat.hand.length)).toEqual([13, 13, 13, 0]);
  });

  it("replays four-player rounds the same with an explicit or invalid player count", () => {
    expect(buildTimeline(sampleRound(), 4)).toEqual(buildTimeline(sampleRound()));
    expect(new RoundReplay(sampleRound(), undefined, 9 as unknown as 4).playerCount).toBe(4);
    expect(new RoundReplay(sampleRound(), undefined, 3).playerCount).toBe(3);
    expect(buildTimeline(sampleRound(), 9 as unknown as 4)).toEqual(buildTimeline(sampleRound()));
  });
});
