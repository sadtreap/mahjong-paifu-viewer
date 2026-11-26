import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameLog, Round, RoundEvent, RyukyokuEvent, Seat, WinEvent } from "../../core/model";
import type { Tile } from "../../core/tile";
import { checkGame } from "../../replay/check";
import { corpusFiles, SANMA_TENHOU_JSON_CORPUS } from "../../test/corpus";
import { closeJson, cutPoints, garbled, parseOutcome } from "../../test/fuzz";
import { LogParseError } from "../errors";
import { parseLogText } from "../index";
import { parseTenhouJson } from "./parse";

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__", "convlog");
const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}

function loadFixture(name: string): GameLog {
  return parseTenhouJson(readFixture(name));
}

function roundOf(name: string, index = 0): Round {
  const round = loadFixture(name).rounds[index];
  if (!round) {
    throw new Error(`${name} has no round ${index}`);
  }
  return round;
}

function winsOf(round: Round): WinEvent[] {
  return round.events.filter((event): event is WinEvent => event.type === "win");
}

function ryukyokuOf(round: Round): RyukyokuEvent | undefined {
  return round.events.find((event): event is RyukyokuEvent => event.type === "ryukyoku");
}

/** The events from `before` events before the first match to `after` events after it. */
function around(
  round: Round,
  match: (event: RoundEvent) => boolean,
  before: number,
  after: number,
): RoundEvent[] {
  const index = round.events.findIndex(match);
  expect(index).toBeGreaterThanOrEqual(0);
  return round.events.slice(index - before, index + after + 1);
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof LogParseError ? error.code : `other: ${String(error)}`;
  }
  return undefined;
}

describe("parseTenhouJson on the convlog fixtures", () => {
  it("finds every fixture", () => {
    expect(FIXTURES).toHaveLength(20);
  });

  it.each(FIXTURES)("parses %s", (name) => {
    const game = loadFixture(name);
    expect(game.format).toBe("tenhou-json");
    expect(game.playerCount).toBe(4);
    expect(game.players.map((player) => player.name)).toEqual(["A", "B", "C", "D"]);
    expect(game.id).toBeUndefined();
    expect(game.rounds.length).toBeGreaterThan(0);
    for (const round of game.rounds) {
      expect(round.hands.map((hand) => hand.length)).toEqual([13, 13, 13, 13]);
      expect(round.doraIndicators).toHaveLength(1);
      // Results come last: one ryukyoku, or one win per winner.
      const firstResult = round.events.findIndex(
        (event) => event.type === "win" || event.type === "ryukyoku",
      );
      const results = round.events.slice(firstResult);
      expect(firstResult).toBeGreaterThan(0);
      expect(
        results.every((event) => event.type === "win") ||
          (results.length === 1 && results[0]?.type === "ryukyoku"),
      ).toBe(true);
    }
  });

  it("is what parseLogText detects and dispatches to", () => {
    expect(parseLogText(readFixture("ranked_game.json"))).toEqual(loadFixture("ranked_game.json"));
  });
});

describe("game metadata", () => {
  it("reads players, rules and final scores", () => {
    const game = loadFixture("ranked_game.json");
    expect(game.players[2]).toEqual({ name: "C", rank: "九段", danIndex: 18, rating: 2104.6 });
    expect(game.rules).toEqual({
      redFives: true,
      length: "south",
      room: "special",
      openTanyao: true,
      fast: false,
      description: "特南喰赤",
    });
    // "sc" interleaves final points and results.
    expect(game.finalScores).toEqual([21100, 55000, -4900, 28800]);
    expect(loadFixture("chankan.json").rules).toEqual({
      redFives: true,
      length: "east",
      room: "upper",
      openTanyao: true,
      fast: true,
      description: "上東喰赤速",
    });
    // A Mahjong Soul room name (from tensoul) is kept as text; only the length is understood.
    expect(loadFixture("confusing_nakis_7.json").rules).toEqual({
      redFives: true,
      length: "south",
      description: "Gold Room South",
    });
  });

  it("reads dan labels as a dan index and keeps other rank text as it is", () => {
    expect(loadFixture("suukantsu_1.json").players.map((player) => player.danIndex)).toEqual([
      10, 10, 4, 0,
    ]);
    const game = parseTenhouJson(
      syntheticLog(
        synthetic(
          [
            [[12], [60]],
            [[22], [60]],
            [[32], [60]],
            [[23], [60]],
          ],
          ["流局", [0, 0, 0, 0]],
        ),
        { dan: ["雀豪★1", "天鳳位", "", 7], rule: { disp: "四鳳東喰赤速", aka: 1 } },
      ),
    );
    expect(game.players.map(({ rank, danIndex }) => ({ rank, danIndex }))).toEqual([
      { rank: "雀豪★1", danIndex: undefined },
      { rank: "天鳳位", danIndex: 20 },
      { rank: undefined, danIndex: undefined },
      { rank: undefined, danIndex: undefined },
    ]);
    expect(game.players[0]).not.toHaveProperty("danIndex");
    expect(game.rules).toEqual({
      redFives: true,
      length: "east",
      room: "phoenix",
      openTanyao: true,
      fast: true,
      description: "四鳳東喰赤速",
    });
  });

  it("reads the round header", () => {
    const game = loadFixture("ranked_game.json");
    const round = game.rounds[2];
    expect(round).toMatchObject({
      wind: 0,
      number: 2,
      dealer: 1,
      honba: 1,
      riichiSticks: 0,
      scores: [21100, 36700, 13400, 28800],
      doraIndicators: ["6p"],
    });
    expect(roundOf("confusing_nakis_3.json")).toMatchObject({ wind: 1, number: 4, dealer: 3 });
  });

  it("keeps red fives as 0m / 0p / 0s", () => {
    const round = roundOf("chankan.json");
    expect(round.hands[2]).toEqual([
      "3m",
      "5m",
      "0m",
      "7m",
      "6p",
      "2s",
      "5s",
      "0s",
      "8s",
      "1z",
      "1z",
      "3z",
      "5z",
    ]);
  });
});

describe("calls", () => {
  it("reads the seat a pon comes from from the letter position", () => {
    const pons = roundOf("complex_nakis_0.json").events.filter((event) => event.type === "pon");
    expect(pons).toEqual([
      { type: "pon", seat: 1, from: 3, tile: "7z", consumed: ["7z", "7z"] }, // "47p4747" toimen
      { type: "pon", seat: 1, from: 3, tile: "2s", consumed: ["2s", "2s"] }, // "32p3232" toimen
      { type: "pon", seat: 3, from: 2, tile: "2z", consumed: ["2z", "2z"] }, // "p424242" kamicha
      { type: "pon", seat: 2, from: 3, tile: "6m", consumed: ["6m", "6m"] }, // "1616p16" shimocha
      { type: "pon", seat: 1, from: 2, tile: "1z", consumed: ["1z", "1z"] }, // "4141p41" shimocha
    ]);
  });

  it("keeps red fives in chi and pon tiles", () => {
    const chi = roundOf("ranked_game.json", 1).events.filter((event) => event.type === "chi");
    expect(chi[1]).toEqual({ type: "chi", seat: 1, from: 0, tile: "6s", consumed: ["4s", "0s"] });
    const pon = roundOf("confusing_nakis_5.json").events.find(
      (event) => event.type === "pon" && event.seat === 1,
    );
    expect(pon).toEqual({ type: "pon", seat: 1, from: 2, tile: "5p", consumed: ["5p", "0p"] });
  });

  it("assigns a pon to the right one of two identical discards", () => {
    // Seat 1 throws 7m twice, the second time right after its own pon of 2z; seat 0's pon of 7m
    // belongs to the second one.
    const round = roundOf("confusing_nakis_0.json");
    const events = around(round, (event) => event.type === "pon" && event.seat === 0, 6, 1);
    expect(events).toEqual([
      { type: "draw", seat: 1, tile: "7m" },
      { type: "discard", seat: 1, tile: "7m", tsumogiri: true, riichi: false },
      { type: "draw", seat: 2, tile: "2z" },
      { type: "discard", seat: 2, tile: "2z", tsumogiri: true, riichi: false },
      { type: "pon", seat: 1, from: 2, tile: "2z", consumed: ["2z", "2z"] },
      { type: "discard", seat: 1, tile: "7m", tsumogiri: false, riichi: false },
      { type: "pon", seat: 0, from: 1, tile: "7m", consumed: ["7m", "7m"] },
      { type: "discard", seat: 0, tile: "2z", tsumogiri: false, riichi: false },
    ]);
  });

  it("chains calls where one call's discard is called again", () => {
    const round = roundOf("confusing_nakis_4.json");
    const events = around(round, (event) => event.type === "pon" && event.seat === 1, 3, 1);
    expect(events).toEqual([
      { type: "discard", seat: 2, tile: "8m", tsumogiri: false, riichi: false },
      { type: "pon", seat: 0, from: 2, tile: "8m", consumed: ["8m", "8m"] },
      { type: "discard", seat: 0, tile: "6m", tsumogiri: false, riichi: false },
      { type: "pon", seat: 1, from: 0, tile: "6m", consumed: ["6m", "6m"] },
      { type: "discard", seat: 1, tile: "5m", tsumogiri: false, riichi: false },
    ]);
  });

  it("parses every round of the complex and confusing call fixtures", () => {
    for (const name of FIXTURES.filter((fixture) => /nakis/.test(fixture))) {
      const calls = loadFixture(name).rounds.flatMap((round) =>
        round.events.filter((event) => ["chi", "pon", "daiminkan"].includes(event.type)),
      );
      expect(calls.length, name).toBeGreaterThan(0);
    }
  });
});

describe("kans and kan dora", () => {
  it("gives an open kan a replacement draw and reveals its dora before the next discard", () => {
    const round = roundOf("confusing_nakis_4.json");
    const events = around(round, (event) => event.type === "daiminkan", 1, 3);
    expect(events).toEqual([
      { type: "discard", seat: 2, tile: "5p", tsumogiri: false, riichi: false },
      { type: "daiminkan", seat: 1, from: 2, tile: "5p", consumed: ["5p", "5p", "0p"] },
      { type: "draw", seat: 1, tile: "3m" },
      { type: "dora", indicator: "4z" },
      { type: "discard", seat: 1, tile: "3m", tsumogiri: true, riichi: false },
    ]);
  });

  it("reveals a closed kan's dora before the replacement draw", () => {
    const round = roundOf("rinshan.json");
    expect(round.doraIndicators).toEqual(["2s"]);
    expect(round.events.slice(-4)).toMatchObject([
      { type: "ankan", seat: 3, tiles: ["6m", "6m", "6m", "6m"] },
      { type: "dora", indicator: "1m" },
      { type: "draw", seat: 3, tile: "6p" },
      { type: "win", seat: 3, from: 3, tile: "6p" },
    ]);
  });

  it("reads an added kan from the discard list", () => {
    const round = roundOf("complex_nakis_1.json");
    expect(round.events.find((event) => event.type === "pon" && event.seat === 3)).toEqual({
      type: "pon",
      seat: 3,
      from: 2,
      tile: "7z",
      consumed: ["7z", "7z"],
    });
    const events = around(round, (event) => event.type === "kakan", 1, 3);
    expect(events).toEqual([
      { type: "draw", seat: 3, tile: "7z" },
      { type: "kakan", seat: 3, tile: "7z" },
      { type: "draw", seat: 3, tile: "7p" },
      { type: "dora", indicator: "1m" },
      { type: "discard", seat: 3, tile: "2p", tsumogiri: false, riichi: false },
    ]);
  });

  it("adds a red five to a pon", () => {
    const round = roundOf("confusing_nakis_0.json");
    expect(round.events.find((event) => event.type === "kakan")).toEqual({
      type: "kakan",
      seat: 2,
      tile: "0m",
    });
  });

  it("orders four kans and their dora like Tenhou (suukantsu)", () => {
    const round = roundOf("suukantsu_0.json");
    const start = round.events.findIndex((event) => event.type === "daiminkan");
    expect(round.events.slice(start, start + 13)).toEqual([
      { type: "daiminkan", seat: 2, from: 1, tile: "9s", consumed: ["9s", "9s", "9s"] },
      { type: "draw", seat: 2, tile: "1s" },
      { type: "kakan", seat: 2, tile: "1s" },
      // The open kan's dora waits until the added kan can no longer be robbed.
      { type: "dora", indicator: "2z" },
      { type: "draw", seat: 2, tile: "2m" },
      { type: "dora", indicator: "7m" },
      { type: "ankan", seat: 2, tiles: ["2m", "2m", "2m", "2m"] },
      { type: "dora", indicator: "2z" },
      { type: "draw", seat: 2, tile: "7s" },
      { type: "kakan", seat: 2, tile: "7s" },
      { type: "draw", seat: 2, tile: "6z" },
      { type: "dora", indicator: "3m" },
      { type: "discard", seat: 2, tile: "6z", tsumogiri: true, riichi: false },
    ]);
    const [win] = winsOf(round);
    expect(win).toMatchObject({
      seat: 2,
      from: 1,
      tile: "2s",
      hand: ["2s", "2s"],
      limit: "yakuman",
      points: 32000,
      han: 13,
      yaku: [{ key: "suukantsu", han: 13, yakuman: true }],
    });
  });

  it("reveals no dora for kans robbed by chankan", () => {
    const round = roundOf("double_kakan_then_chankan.json");
    expect(round.events.some((event) => event.type === "dora")).toBe(false);
    expect(round.events.slice(-4)).toMatchObject([
      { type: "kakan", seat: 0, tile: "6p" },
      { type: "draw", seat: 0, tile: "6m" },
      { type: "kakan", seat: 0, tile: "2m" },
      { type: "win", seat: 3, from: 0, tile: "2m", yaku: [{ key: "chankan" }, { key: "pinfu" }] },
    ]);
  });

  it("counts one dora event per revealed kan indicator", () => {
    for (const name of FIXTURES) {
      const raw = JSON.parse(readFixture(name)) as { log: Array<[unknown, unknown, unknown[]]> };
      loadFixture(name).rounds.forEach((round, index) => {
        const indicators = raw.log[index]?.[2].length;
        const doraEvents = round.events.filter((event) => event.type === "dora").length;
        expect(doraEvents + 1, `${name} round ${index}`).toBe(indicators);
      });
    }
  });
});

describe("draws, discards and riichi", () => {
  it("fills in the drawn tile for tsumogiri", () => {
    const round = roundOf("chankan.json");
    const seatZero = round.events.filter(
      (event) => (event.type === "draw" || event.type === "discard") && event.seat === 0,
    );
    expect(seatZero.slice(0, 6)).toEqual([
      { type: "draw", seat: 0, tile: "2z" },
      { type: "discard", seat: 0, tile: "4z", tsumogiri: false, riichi: false },
      { type: "draw", seat: 0, tile: "1m" },
      { type: "discard", seat: 0, tile: "1p", tsumogiri: false, riichi: false },
      { type: "draw", seat: 0, tile: "7z" },
      { type: "discard", seat: 0, tile: "7z", tsumogiri: true, riichi: false },
    ]);
  });

  it("accepts every riichi that is not won on, right after the declaring discard", () => {
    for (const name of FIXTURES) {
      for (const round of loadFixture(name).rounds) {
        round.events.forEach((event, index) => {
          if (event.type !== "discard" || !event.riichi) {
            return;
          }
          const next = round.events[index + 1];
          if (next?.type === "win") {
            return;
          }
          expect(next, `${name} event ${index}`).toEqual({
            type: "riichiAccepted",
            seat: event.seat,
          });
        });
      }
    }
  });

  it("does not accept a riichi discard that is won on", () => {
    const round = roundOf("double_ron.json");
    const riichiSeats = round.events.flatMap((event) =>
      event.type === "discard" && event.riichi ? [event.seat] : [],
    );
    expect(riichiSeats).toEqual([0, 3]);
    const accepted = round.events.filter((event) => event.type === "riichiAccepted");
    expect(accepted).toEqual([{ type: "riichiAccepted", seat: 0 }]);
    expect(round.events.slice(-3)).toMatchObject([
      { type: "discard", seat: 3, tile: "7m", tsumogiri: false, riichi: true },
      { type: "win", seat: 0, from: 3 },
      { type: "win", seat: 2, from: 3 },
    ]);
  });

  it("accepts the fourth riichi before the four-riichi draw", () => {
    const round = roundOf("four_reach.json");
    expect(round.events.filter((event) => event.type === "riichiAccepted")).toHaveLength(4);
    expect(round.events).toContainEqual({
      type: "discard",
      seat: 2,
      tile: "6m",
      tsumogiri: true,
      riichi: true,
    });
    expect(round.events.slice(-3)).toEqual([
      { type: "discard", seat: 0, tile: "2p", tsumogiri: false, riichi: true },
      { type: "riichiAccepted", seat: 0 },
      { type: "ryukyoku", reason: "suuchaRiichi", deltas: [0, 0, 0, 0] },
    ]);
  });
});

describe("results", () => {
  it("reads a chankan ron", () => {
    const [win, ...rest] = winsOf(roundOf("chankan.json"));
    expect(rest).toEqual([]);
    expect(win).toEqual({
      type: "win",
      seat: 2,
      from: 3,
      deltas: [0, 0, 8000, -8000],
      tile: "6s",
      hand: ["0m", "5m", "5m", "6m", "7m", "4s", "0s", "6s", "1z", "1z", "1z"],
      han: 5,
      limit: "mangan",
      points: 8000,
      yaku: [
        { key: "chankan", han: 1 },
        { key: "roundWindEast", han: 1 },
        { key: "dora", han: 1 },
        { key: "akaDora", han: 2 },
      ],
    });
  });

  it("reads a double ron as two win events", () => {
    const wins = winsOf(roundOf("double_ron.json"));
    expect(wins).toEqual([
      {
        type: "win",
        seat: 0,
        from: 3,
        // 12000 plus seat 0's own riichi stick.
        deltas: [13000, 0, 0, -12000],
        tile: "7m",
        hand: ["4m", "0m", "6m", "7m", "7m", "7m", "9m", "9m", "3p", "4p", "0p", "7s", "8s", "9s"],
        uraIndicators: ["2z"],
        han: 6,
        limit: "haneman",
        points: 12000,
        yaku: [
          { key: "riichi", han: 1 },
          { key: "dora", han: 3 },
          { key: "akaDora", han: 2 },
        ],
      },
      {
        type: "win",
        seat: 2,
        from: 3,
        deltas: [0, 0, 2000, -2000],
        tile: "7m",
        hand: ["5m", "6m", "7m", "2p", "2p", "7p", "8p", "9p", "6z", "6z", "6z"],
        han: 2,
        fu: 30,
        points: 2000,
        yaku: [
          { key: "hatsu", han: 1 },
          { key: "dora", han: 1 },
        ],
      },
    ]);
  });

  it("gives ura dora only to winners in riichi", () => {
    const [yakuman, baiman] = winsOf(roundOf("suukantsu_1.json", 1));
    expect(yakuman).toMatchObject({ seat: 3, from: 2, limit: "yakuman", points: 32000 });
    expect(yakuman?.uraIndicators).toBeUndefined();
    expect(baiman).toMatchObject({
      seat: 0,
      from: 2,
      deltas: [16000, 0, -16000, 0],
      limit: "baiman",
      points: 16000,
      han: 8,
      uraIndicators: ["7p", "4z", "3s", "2m", "7z"],
    });
    expect(baiman?.yaku?.at(-1)).toEqual({ key: "uraDora", han: 4 });
  });

  it("reads tsumo points, including dealer tsumo", () => {
    const [dealerTsumo] = winsOf(roundOf("ranked_game.json", 1));
    expect(dealerTsumo).toMatchObject({
      seat: 1,
      from: 1,
      tile: "6p",
      deltas: [-3900, 11700, -3900, -3900],
      fu: 30,
      han: 4,
      points: 11700,
    });
    const [tsumo] = winsOf(roundOf("complex_nakis_0.json"));
    // 30 fu 3 han, 1000-2000 plus three honba.
    expect(tsumo).toMatchObject({ seat: 3, from: 3, fu: 30, han: 3, points: 4000 });
    expect(tsumo?.deltas).toEqual([-1300, -1300, -2300, 4900]);
    const [mangan] = winsOf(roundOf("rinshan.json"));
    expect(mangan).toMatchObject({
      limit: "mangan",
      points: 8000,
      han: 5,
      uraIndicators: ["3z", "8s"],
    });
  });

  it("reads English yaku names and drops 0-han yaku", () => {
    const [win] = winsOf(roundOf("confusing_nakis_7.json"));
    expect(win).toMatchObject({ seat: 1, from: 0, fu: 40, han: 2, points: 2600 });
    // The source also lists "Ura Dora(0飜)".
    expect(win?.yaku).toEqual([
      { key: "riichi", han: 1 },
      { key: "dora", han: 1 },
    ]);
    expect(win?.uraIndicators).toEqual(["4s"]);
  });

  it("leaves score details out when the result has no score text", () => {
    const [win] = winsOf(roundOf("confusing_nakis_2.json"));
    expect(win).toEqual({
      type: "win",
      seat: 1,
      from: 0,
      deltas: [-3200, 0, 3200, 0],
      tile: "7m",
      hand: ["7m", "7p", "8p", "9p", "9p"],
    });
  });

  it("infers tenpai seats at an exhaustive draw", () => {
    expect(ryukyokuOf(roundOf("ryukyoku.json"))).toEqual({
      type: "ryukyoku",
      reason: "exhaustive",
      deltas: [1500, 1500, -1500, -1500],
      tenpai: [0, 1],
    });
    expect(ryukyokuOf(roundOf("confusing_nakis_6.json"))?.tenpai).toEqual([0]);
    expect(ryukyokuOf(roundOf("confusing_nakis_0.json"))?.tenpai).toEqual([1, 2, 3]);
  });

  it("reads kyuushu kyuuhai", () => {
    expect(roundOf("kyushukyuhai.json").events).toEqual([
      { type: "draw", seat: 3, tile: "7s" },
      { type: "discard", seat: 3, tile: "2z", tsumogiri: false, riichi: false },
      { type: "draw", seat: 0, tile: "1z" },
      { type: "ryukyoku", reason: "kyuushuKyuuhai", deltas: [0, 0, 0, 0] },
    ]);
  });
});

/** A minimal four-player log around one round, for synthetic cases. */
function syntheticLog(round: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: ["A", "B", "C", "D"],
    rule: { disp: "般南喰赤", aka: 1 },
    log: [round],
    ...extra,
  });
}

const HANDS = [
  [11, 11, 11, 12, 13, 14, 15, 16, 17, 18, 19, 19, 19],
  [21, 22, 23, 24, 25, 26, 27, 28, 29, 41, 41, 42, 42],
  [31, 32, 33, 34, 35, 36, 37, 38, 39, 43, 43, 44, 44],
  [21, 22, 23, 31, 32, 33, 45, 45, 46, 46, 47, 47, 47],
];

function synthetic(seatLists: unknown[][], result: unknown[]): unknown[] {
  return [
    [0, 0, 0],
    [25000, 25000, 25000, 25000],
    [11],
    [],
    ...HANDS.flatMap((hand, seat) => [hand, ...(seatLists[seat] ?? [[], []])]),
    result,
  ];
}

describe("synthetic logs", () => {
  const exhaustive = (lists: unknown[][]) => synthetic(lists, ["流局", [0, 0, 0, 0]]);

  it("reads all-tenpai and all-noten draws", () => {
    const lists = [
      [[12], [60]],
      [[22], [60]],
      [[32], [60]],
      [[23], [60]],
    ];
    const allTenpai = parseTenhouJson(syntheticLog(synthetic(lists, ["全員聴牌"])));
    expect(ryukyokuOf(allTenpai.rounds[0] as Round)?.tenpai).toEqual([0, 1, 2, 3]);
    const allNoten = parseTenhouJson(syntheticLog(synthetic(lists, ["全員不聴"])));
    expect(ryukyokuOf(allNoten.rounds[0] as Round)?.tenpai).toEqual([]);
  });

  it("reads pao and keeps unknown yaku as raw text", () => {
    const lists = [
      [[12], [60]],
      [[22], [60]],
      [[32], [60]],
      [[23], []],
    ];
    const log = synthetic(lists, [
      "和了",
      [0, 0, -32000, 32000],
      [3, 3, 2, "役満32000点", "大三元(役満)", "謎の役(2飜)"],
    ]);
    const [win] = winsOf(parseTenhouJson(syntheticLog(log)).rounds[0] as Round);
    expect(win).toMatchObject({ seat: 3, from: 3, pao: 2, limit: "yakuman", points: 32000 });
    expect(win?.yaku).toEqual([
      { key: "daisangen", han: 13, yakuman: true },
      { key: null, raw: "謎の役", han: 2 },
    ]);
  });

  it("reads a kokushi ron on a closed kan with its tile and hand", () => {
    // The dealer draws the fourth East and declares a closed kan; seat 1 robs it with kokushi.
    const round = [
      [0, 0, 0],
      [25000, 25000, 25000, 25000],
      [11],
      [],
      [41, 41, 41, 12, 13, 14, 22, 23, 24, 32, 33, 34, 35],
      [41],
      ["414141a41"],
      [11, 19, 21, 29, 31, 39, 42, 43, 44, 45, 46, 47, 47],
      [],
      [],
      [12, 13, 14, 15, 16, 17, 18, 25, 26, 27, 36, 37, 38],
      [],
      [],
      [15, 16, 17, 18, 25, 26, 27, 28, 28, 36, 37, 38, 39],
      [],
      [],
      ["和了", [-32000, 32000, 0, 0], [1, 0, 1, "役満32000点", "国士無双(役満)"]],
    ];
    const game = parseTenhouJson(syntheticLog(round));
    expect(game.rounds[0]?.events).toStrictEqual<RoundEvent[]>([
      { type: "draw", seat: 0, tile: "1z" },
      { type: "ankan", seat: 0, tiles: ["1z", "1z", "1z", "1z"] },
      {
        type: "win",
        seat: 1,
        from: 0,
        deltas: [-32000, 32000, 0, 0],
        limit: "yakuman",
        points: 32000,
        yaku: [{ key: "kokushiMusou", han: 13, yakuman: true }],
        han: 13,
        tile: "1z",
        hand: ["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z", "7z"],
      },
    ]);
  });

  it("keeps a round without a result as an unknown ending", () => {
    const lists = [
      [[12], [60]],
      [[22], [60]],
      [[32], [60]],
      [[23], [60]],
    ];
    const round = synthetic(lists, []).slice(0, -1);
    const game = parseTenhouJson(syntheticLog(round));
    expect(game.rounds[0]?.events.at(-1)).toEqual({
      type: "ryukyoku",
      reason: "unknown",
      deltas: [0, 0, 0, 0],
    });
  });

  it("accepts final scores given in hundreds", () => {
    const lists = [
      [[12], [60]],
      [[22], [60]],
      [[32], [60]],
      [[23], [60]],
    ];
    const game = parseTenhouJson(
      syntheticLog(exhaustive(lists), { sc: [250, 0, 250, 0, 250, 0, 250, 0] }),
    );
    expect(game.finalScores).toEqual([25000, 25000, 25000, 25000]);
  });

  it("keeps a four-player log with an empty fourth name four-player", () => {
    const lists = [
      [[12], [60]],
      [[22], [60]],
      [[32], [60]],
      [[23], [60]],
    ];
    const game = parseTenhouJson(
      syntheticLog(exhaustive(lists), { name: ["A", "B", "C", ""], ratingc: "PF4" }),
    );
    expect(game.playerCount).toBe(4);
    expect(game.rounds[0]?.hands[3]).toHaveLength(13);
  });

  it("rejects a round with more actions than any real game before replaying it", () => {
    // Replaying explores the possible turn orders, so its cost grows with the round's length.
    const hand = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24];
    const seat = (count: number) => [hand, Array(count).fill(39), Array(count).fill(60)];
    const round = (count: number) => [
      [0, 0, 0],
      [25000, 25000, 25000, 25000],
      [31],
      [],
      ...seat(count),
      ...seat(count),
      ...seat(count),
      ...seat(count),
      ["流局", [0, 0, 0, 0]],
    ];
    // 50 draws and 50 discards per seat would fit the event limit but not the draw limit, which
    // parseLogText checks after parsing.
    expect(parseTenhouJson(syntheticLog(round(50))).rounds[0]?.events).toHaveLength(401);
    expect(errorCode(() => parseTenhouJson(syntheticLog(round(51))))).toBe("invalid");
  });

  it("rejects malformed logs", () => {
    const lists = [
      [[12], [60]],
      [[22], [60]],
      [[32], [60]],
      [[23], [60]],
    ];
    expect(errorCode(() => parseTenhouJson("{"))).toBe("invalid");
    expect(errorCode(() => parseTenhouJson('{"name":[]}'))).toBe("invalid");
    expect(errorCode(() => parseTenhouJson('{"log":[]}'))).toBe("invalid");
    // A tile id that does not exist.
    const badTile = exhaustive([
      [[12], [60]],
      [[22], [60]],
      [[32], [60]],
      [[48], [60]],
    ]);
    expect(errorCode(() => parseTenhouJson(syntheticLog(badTile)))).toBe("invalid");
    // A pon string with the letter in an impossible place.
    const badCall = exhaustive([[["1p111"], [60]], ...lists.slice(1)]);
    expect(errorCode(() => parseTenhouJson(syntheticLog(badCall)))).toBe("invalid");
    // Tsumogiri right after a call.
    const tsumogiriAfterCall = exhaustive([...lists.slice(0, 3), [["p121212"], [60]]]);
    expect(errorCode(() => parseTenhouJson(syntheticLog(tsumogiriAfterCall)))).toBe("invalid");
    // Seat 1 calls a tile nobody discarded.
    const impossibleCall = exhaustive([
      lists[0],
      [["p474747"], [41]],
      lists[2],
      lists[3],
    ] as unknown[][]);
    expect(errorCode(() => parseTenhouJson(syntheticLog(impossibleCall)))).toBe("invalid");
    // Seat 3 still has a draw left after the round ends.
    const leftover = exhaustive([...lists.slice(0, 3), [[23, 24], [60]]]);
    expect(errorCode(() => parseTenhouJson(syntheticLog(leftover)))).toBe("invalid");
    // A North set aside (kita) only exists in three-player games.
    const kita = exhaustive([
      [
        [44, 12],
        ["f44", 60],
      ],
      ...lists.slice(1),
    ]);
    expect(errorCode(() => parseTenhouJson(syntheticLog(kita)))).toBe("invalid");
    expect(() => parseTenhouJson(syntheticLog(kita))).toThrow(/kita\) in a four-player game/);
  });
});

/** Starting hands of seats 0-2 in the three-player examples (no 2m-8m, as in sanma). */
const SANMA_HANDS: [number[], number[], number[]] = [
  [19, 19, 21, 22, 23, 27, 28, 29, 32, 46, 46, 47, 41],
  [11, 11, 24, 25, 26, 34, 35, 36, 39, 39, 43, 43, 45],
  [21, 24, 26, 31, 34, 36, 39, 41, 42, 45, 45, 47, 19],
];

interface SanmaRoundOptions {
  kyoku?: number;
  hands?: number[][];
  dora?: number[];
}

/** A three-player round in Tenhou's layout: 17 entries, seat 3's lists empty. */
function sanmaRound(
  seatLists: unknown[][],
  result: unknown[],
  { kyoku = 0, hands = SANMA_HANDS, dora = [41] }: SanmaRoundOptions = {},
): unknown[] {
  return [
    [kyoku, 0, 0],
    [35000, 35000, 35000, 0],
    dora,
    [],
    ...hands.flatMap((hand, seat) => [hand, ...(seatLists[seat] ?? [[], []])]),
    [],
    [],
    [],
    result,
  ];
}

/** tensoul-py's layout of the same round: seat 3's lists left out, 14 entries. */
function shortLayout(round: unknown[]): unknown[] {
  return [...round.slice(0, 13), ...round.slice(16)];
}

/** A three-player log as Tenhou exports it: four seats, seat 3 empty. */
function sanmaLog(rounds: unknown[][], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: ["A", "B", "C", ""],
    dan: ["初段", "初段", "初段", "新人"],
    rate: [1500, 1500, 1500, 1500],
    sx: ["M", "F", "M", "C"],
    sc: [37000, 32, 34000, -6, 34000, -26, 0, 0],
    rule: { disp: "三般南喰赤", aka53: 1, aka52: 1, aka51: 1 },
    ratingc: "PF3",
    ver: 2.3,
    log: rounds,
    ...extra,
  });
}

/**
 * A hand-made round: the dealer pons 發 from seat 2 (across the empty seat 3), sets aside the North
 * it draws, discards the replacement and wins by tsumo.
 */
const MINIMAL_LISTS = [
  [
    [33, "46p4646", 44, 11, 31],
    [47, 41, "f44", 60],
  ],
  [
    [42, 37, 38],
    [60, 60, 60],
  ],
  [
    [46, 22, 23],
    [60, 60, 60],
  ],
];
const MINIMAL_RESULT = [
  "和了",
  [2000, -1000, -1000, 0],
  [0, 0, 0, "30符2飜1000点∀", "役牌 發(1飜)", "ドラ(1飜)"],
];

/** Each seat draws once and discards the tile drawn. */
const QUIET = [
  [[33], [60]],
  [[37], [60]],
  [[22], [60]],
];

function draw(seat: Seat, tile: Tile): RoundEvent {
  return { type: "draw", seat, tile };
}

function discard(seat: Seat, tile: Tile, tsumogiri = true, riichi = false): RoundEvent {
  return { type: "discard", seat, tile, tsumogiri, riichi };
}

function kita(seat: Seat): RoundEvent {
  return { type: "kita", seat, tile: "4z" };
}

function onlyRound(text: string): Round {
  const [round, ...rest] = parseTenhouJson(text).rounds;
  expect(rest).toEqual([]);
  if (!round) {
    throw new Error("No round");
  }
  return round;
}

describe("three-player logs", () => {
  it("reads Tenhou's layout, with seat 3 as the empty chair", () => {
    const game = parseTenhouJson(sanmaLog([sanmaRound(MINIMAL_LISTS, MINIMAL_RESULT)]));
    expect(game.playerCount).toBe(3);
    // Tenhou writes rank 新人 and rating 1500 for the empty seat; the model has only an empty name.
    expect(game.players).toStrictEqual([
      { name: "A", rank: "初段", danIndex: 10, rating: 1500 },
      { name: "B", rank: "初段", danIndex: 10, rating: 1500 },
      { name: "C", rank: "初段", danIndex: 10, rating: 1500 },
      { name: "" },
    ]);
    // The rule text's 三 makes playerCount, not a rule.
    expect(game.rules).toStrictEqual({
      redFives: true,
      length: "south",
      room: "general",
      openTanyao: true,
      fast: false,
      description: "三般南喰赤",
    });
    expect(game.finalScores).toEqual([37000, 34000, 34000, 0]);
    expect(game.rounds).toStrictEqual<Round[]>([
      {
        wind: 0,
        number: 1,
        dealer: 0,
        honba: 0,
        riichiSticks: 0,
        scores: [35000, 35000, 35000, 0],
        doraIndicators: ["1z"],
        hands: [
          ["9m", "9m", "1p", "2p", "3p", "7p", "8p", "9p", "2s", "6z", "6z", "7z", "1z"],
          ["1m", "1m", "4p", "5p", "6p", "4s", "5s", "6s", "9s", "9s", "3z", "3z", "5z"],
          ["1p", "4p", "6p", "1s", "4s", "6s", "9s", "1z", "2z", "5z", "5z", "7z", "9m"],
          [],
        ],
        events: [
          draw(0, "3s"),
          discard(0, "7z", false),
          draw(1, "2z"),
          discard(1, "2z"),
          draw(2, "6z"),
          discard(2, "6z"),
          // "46p4646" marks the toimen: seats 0 and 2 sit across the empty seat 3.
          { type: "pon", seat: 0, from: 2, tile: "6z", consumed: ["6z", "6z"] },
          discard(0, "1z", false),
          draw(1, "7s"),
          discard(1, "7s"),
          draw(2, "2p"),
          discard(2, "2p"),
          // "f44": the North just drawn is set aside and the next take is the replacement draw.
          draw(0, "4z"),
          kita(0),
          draw(0, "1m"),
          discard(0, "1m"),
          draw(1, "8s"),
          discard(1, "8s"),
          draw(2, "3p"),
          discard(2, "3p"),
          draw(0, "1s"),
          {
            type: "win",
            seat: 0,
            from: 0,
            deltas: [2000, -1000, -1000, 0],
            fu: 30,
            han: 2,
            // Tenhou's tsumo loss: each of the two others pays the four-player 1000.
            points: 2000,
            yaku: [
              { key: "hatsu", han: 1 },
              { key: "dora", han: 1 },
            ],
            tile: "1s",
            hand: ["9m", "9m", "1p", "2p", "3p", "7p", "8p", "9p", "1s", "2s", "3s"],
          },
        ],
      },
    ]);
  });

  it("reads tensoul-py's short layout as the same game", () => {
    const official = parseTenhouJson(sanmaLog([sanmaRound(MINIMAL_LISTS, MINIMAL_RESULT)]));
    // 14-entry rounds, and three names, ranks and ratings and six final values.
    const tensoulPy = JSON.stringify({
      name: ["A", "B", "C"],
      dan: ["初段", "初段", "初段"],
      rate: [1500, 1500, 1500],
      sx: ["M", "F", "M"],
      sc: [37000, 32, 34000, -6, 34000, -26],
      rule: { disp: "三般南喰赤", aka53: 1, aka52: 1, aka51: 1 },
      ratingc: "PF3",
      ver: "2.3",
      log: [shortLayout(sanmaRound(MINIMAL_LISTS, MINIMAL_RESULT))],
    });
    expect(parseTenhouJson(tensoulPy)).toStrictEqual(official);
    // Three scores and three-entry deltas are padded, and the layout alone says three players.
    const bare = shortLayout(sanmaRound(MINIMAL_LISTS, MINIMAL_RESULT));
    bare[1] = [35000, 35000, 35000];
    bare[13] = ["和了", [2000, -1000, -1000], MINIMAL_RESULT[2]];
    const game = parseTenhouJson(JSON.stringify({ log: [bare] }));
    expect(game.playerCount).toBe(3);
    expect(game.players).toStrictEqual([{ name: "" }, { name: "" }, { name: "" }, { name: "" }]);
    expect(game.rounds).toStrictEqual(official.rounds);
    expect(parseLogText(JSON.stringify({ log: [bare] }))).toStrictEqual(game);
  });

  it("keeps an unfinished three-player round in either layout", () => {
    const round = sanmaRound(QUIET, []).slice(0, -1);
    const official = onlyRound(sanmaLog([round]));
    expect(official.events.at(-1)).toEqual({
      type: "ryukyoku",
      reason: "unknown",
      deltas: [0, 0, 0, 0],
    });
    expect(round).toHaveLength(16);
    expect(onlyRound(JSON.stringify({ log: [shortLayout(round)] }))).toStrictEqual(official);
  });

  it("reads a log converted from Mahjong Soul by tensoul", () => {
    const result = [
      "和了",
      [2000, -1000, -1000, 0],
      [0, 0, 0, "30符2飜1000点∀", "役牌 發(1飜)", "抜きドラ(1飜)"],
    ];
    const game = parseTenhouJson(
      sanmaLog([sanmaRound(MINIMAL_LISTS, result)], {
        name: ["A", "B", "C", ""],
        dan: ["", "", "", ""],
        rate: [0, 0, 0, 0],
        sx: ["C", "C", "C", ""],
        rule: { disp: "三玉の間南喰赤", aka53: 1, aka52: 1, aka51: 0 },
      }),
    );
    expect(game.players).toStrictEqual([
      { name: "A", rating: 0 },
      { name: "B", rating: 0 },
      { name: "C", rating: 0 },
      { name: "" },
    ]);
    expect(game.rules).toStrictEqual({
      redFives: true,
      length: "south",
      description: "三玉の間南喰赤",
    });
    // Tenhou counts the North tiles inside ドラ; Mahjong Soul lists them apart.
    expect(game.rounds[0]?.events.at(-1)).toMatchObject({
      yaku: [
        { key: "hatsu", han: 1 },
        { key: "nukidora", han: 1 },
      ],
    });
  });

  it("passes the turn from seat 2 to seat 0 and numbers rounds like Tenhou", () => {
    // Kyoku 6 is South 3, dealt by seat 2.
    const south3 = onlyRound(sanmaLog([sanmaRound(QUIET, ["流局", [0, 0, 0, 0]], { kyoku: 6 })]));
    expect(south3).toMatchObject({ wind: 1, number: 3, dealer: 2 });
    expect(south3.events.slice(0, 6)).toEqual([
      draw(2, "2p"),
      discard(2, "2p"),
      draw(0, "3s"),
      discard(0, "3s"),
      draw(1, "7s"),
      discard(1, "7s"),
    ]);
    // Kyoku 9 is West 2 (a West round extension), dealt by seat 1.
    const west2 = onlyRound(sanmaLog([sanmaRound(QUIET, ["流局", [0, 0, 0, 0]], { kyoku: 9 })]));
    expect(west2).toMatchObject({ wind: 2, number: 2, dealer: 1 });
    expect(west2.events[0]).toEqual(draw(1, "7s"));
    // Kyoku 3 and 7 would be dealt by the empty seat.
    for (const kyoku of [3, 7]) {
      const log = sanmaLog([sanmaRound(QUIET, ["流局", [0, 0, 0, 0]], { kyoku })]);
      expect(() => parseTenhouJson(log), `kyoku ${kyoku}`).toThrow(
        /dealer would be the empty seat/,
      );
    }
  });

  it("passes the turn to seat 0 after seat 2 calls seat 0's discard across the empty seat", () => {
    const hands = [
      SANMA_HANDS[0],
      SANMA_HANDS[1],
      [21, 24, 26, 31, 34, 36, 39, 47, 42, 45, 45, 47, 19],
    ];
    const lists: unknown[][] = [
      [
        [33, 37],
        [47, 60],
      ],
      [[], []],
      [["47p4747"], [42]],
    ];
    const round = onlyRound(sanmaLog([sanmaRound(lists, ["流局", [0, 0, 0, 0]], { hands })]));
    expect(round.events.slice(0, -1)).toEqual([
      draw(0, "3s"),
      discard(0, "7z", false),
      { type: "pon", seat: 2, from: 0, tile: "7z", consumed: ["7z", "7z"] },
      discard(2, "2z", false),
      draw(0, "7s"),
      discard(0, "7s"),
    ]);
  });

  it("sets Norths aside from the hand, several in a row and in riichi", () => {
    const hands = [
      [19, 19, 21, 22, 23, 27, 28, 29, 32, 46, 46, 44, 41],
      SANMA_HANDS[1],
      SANMA_HANDS[2],
    ];
    const lists = [
      [
        [42, 24, 33, 44, 44, 11],
        ["f44", 60, "r41", "f44", "f44", 60],
      ],
      [
        [37, 38, 35],
        [60, 60, 60],
      ],
      [
        [22, 23, 25],
        [60, 60, 60],
      ],
    ];
    const round = onlyRound(
      sanmaLog([sanmaRound(lists, ["流局", [2000, -1000, -1000, 0]], { hands })]),
    );
    expect(round.events).toStrictEqual<RoundEvent[]>([
      // The take at the kita's index (2z) is the tile drawn; the North comes from the hand.
      draw(0, "2z"),
      kita(0),
      draw(0, "4p"),
      // 60 discards the replacement draw.
      discard(0, "4p"),
      draw(1, "7s"),
      discard(1, "7s"),
      draw(2, "2p"),
      discard(2, "2p"),
      draw(0, "3s"),
      discard(0, "1z", false, true),
      { type: "riichiAccepted", seat: 0 },
      draw(1, "8s"),
      discard(1, "8s"),
      draw(2, "3p"),
      discard(2, "3p"),
      draw(0, "4z"),
      kita(0),
      draw(0, "4z"),
      kita(0),
      draw(0, "1m"),
      discard(0, "1m"),
      draw(1, "5s"),
      discard(1, "5s"),
      draw(2, "5p"),
      discard(2, "5p"),
      // 2000 noten payments in all with three players.
      { type: "ryukyoku", reason: "exhaustive", deltas: [2000, -1000, -1000, 0], tenpai: [0] },
    ]);
  });

  it("lets another seat ron the North set aside", () => {
    // Seat 2 waits on a single North; seat 1 draws one and sets it aside.
    const hands = [
      SANMA_HANDS[0],
      SANMA_HANDS[1],
      [21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 44],
    ];
    const lists = [
      [[33], [47]],
      [[44], ["f44"]],
      [[], []],
    ];
    const result = ["和了", [0, -2600, 2600, 0], [2, 1, 2, "40符2飜2600点", "一気通貫(2飜)"]];
    const round = onlyRound(sanmaLog([sanmaRound(lists, result, { hands })]));
    expect(round.events).toStrictEqual<RoundEvent[]>([
      draw(0, "3s"),
      discard(0, "7z", false),
      draw(1, "4z"),
      kita(1),
      {
        type: "win",
        seat: 2,
        from: 1,
        deltas: [0, -2600, 2600, 0],
        fu: 40,
        han: 2,
        points: 2600,
        yaku: [{ key: "ittsu", han: 2 }],
        tile: "4z",
        hand: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1s", "2s", "3s", "4z", "4z"],
      },
    ]);
  });

  it("wins on the replacement draw of a kita", () => {
    const lists = [[[44, 31], ["f44"]]];
    const result = [
      "和了",
      [2000, -1000, -1000, 0],
      [0, 0, 0, "30符2飜1000点∀", "嶺上開花(1飜)", "役牌 發(1飜)"],
    ];
    const round = onlyRound(sanmaLog([sanmaRound(lists, result)]));
    expect(round.events).toMatchObject([
      draw(0, "4z"),
      kita(0),
      draw(0, "1s"),
      {
        type: "win",
        seat: 0,
        from: 0,
        tile: "1s",
        yaku: [{ key: "rinshanKaihou" }, { key: "hatsu" }],
      },
    ]);
  });

  it("reveals an open kan's dora after a kita, before the replacement draw", () => {
    const hands = [
      SANMA_HANDS[0],
      [11, 11, 24, 25, 26, 34, 35, 36, 39, 39, 43, 43, 39],
      [21, 24, 26, 31, 34, 36, 38, 41, 42, 45, 45, 47, 19],
    ];
    const lists = [
      [[39], [60]],
      [
        ["m39393939", 44, 25],
        [0, "f44", 60],
      ],
      [[22], [60]],
    ];
    const round = onlyRound(sanmaLog([sanmaRound(lists, ["全員不聴"], { hands, dora: [41, 43] })]));
    expect(round.events).toStrictEqual<RoundEvent[]>([
      draw(0, "9s"),
      discard(0, "9s"),
      { type: "daiminkan", seat: 1, from: 0, tile: "9s", consumed: ["9s", "9s", "9s"] },
      draw(1, "4z"),
      kita(1),
      { type: "dora", indicator: "3z" },
      draw(1, "5p"),
      discard(1, "5p"),
      draw(2, "2p"),
      discard(2, "2p"),
      { type: "ryukyoku", reason: "exhaustive", deltas: [0, 0, 0, 0], tenpai: [] },
    ]);
  });

  it("reads three-player draws", () => {
    const tenpai = (result: unknown[]) =>
      onlyRound(sanmaLog([sanmaRound(QUIET, result)])).events.at(-1);
    expect(tenpai(["全員聴牌"])).toEqual({
      type: "ryukyoku",
      reason: "exhaustive",
      deltas: [0, 0, 0, 0],
      tenpai: [0, 1, 2],
    });
    expect(tenpai(["流局", [1000, 1000, -2000]])).toEqual({
      type: "ryukyoku",
      reason: "exhaustive",
      deltas: [1000, 1000, -2000, 0],
      tenpai: [0, 1],
    });
    expect(tenpai(["流局"])).toEqual({
      type: "ryukyoku",
      reason: "exhaustive",
      deltas: [0, 0, 0, 0],
    });
  });

  it("reads three-player final scores", () => {
    const round = sanmaRound(QUIET, ["流局", [0, 0, 0, 0]]);
    const finalScores = (sc: unknown) => parseTenhouJson(sanmaLog([round], { sc })).finalScores;
    expect(finalScores([370, 32, 340, -6, 340, -26, 0, 0])).toEqual([37000, 34000, 34000, 0]);
    expect(finalScores([37000, 32, 34000, -6, 34000, -26])).toEqual([37000, 34000, 34000, 0]);
    // Points for the empty seat are not a final score of this game.
    expect(finalScores([37000, 32, 34000, -6, 33000, -26, 1000, 0])).toBeUndefined();
  });

  it("rejects three-player rounds that do not fit the empty seat 3", () => {
    const quiet = () => sanmaRound(QUIET, ["流局", [0, 0, 0, 0]]);
    const parse = (round: unknown[]) => () => parseTenhouJson(sanmaLog([round]));
    expect(parse(quiet())).not.toThrow();
    // Seat 3 with points: with an empty hand the round looks four-player, unlike the log; in the
    // short layout the scores are wrong.
    const points = quiet();
    points[1] = [35000, 35000, 34000, 1000];
    expect(parse(points)).toThrow(/says 3 players, but its rounds are laid out for 4/);
    expect(parse(shortLayout(points))).toThrow(/round 1 has invalid scores/);
    // Seat 3 with takes or discards.
    for (const field of [14, 15]) {
      const tiles = quiet();
      tiles[field] = [33];
      expect(parse(tiles), `field ${field}`).toThrow(/empty seat 3 of round 1 has tiles/);
    }
    // A playing seat without 13 tiles.
    const short = quiet();
    short[7] = SANMA_HANDS[1].slice(1);
    expect(parse(short)).toThrow(/Seat 1 of round 1 does not start with 13 tiles/);
    // A pon from the empty seat: seat 0's kamicha is seat 3.
    const fromEmpty = sanmaRound([[["p464646"], [41]], ...QUIET.slice(1)], ["流局", [0, 0, 0, 0]]);
    expect(parse(fromEmpty)).toThrow(/calls "p464646" from the empty seat 3/);
    // Seat 3 winning, dealing in or receiving points.
    const win = (deltas: number[], who: number, from: number) =>
      sanmaRound(QUIET, ["和了", deltas, [who, from, who, "30符1飜1000点"]]);
    expect(parse(win([0, -1000, 1000, 0], 2, 1))).not.toThrow();
    expect(parse(win([0, 0, 0, 0], 3, 2))).toThrow(/Invalid winner or dealer-in seat/);
    expect(parse(win([0, 0, 0, 0], 2, 3))).toThrow(/Invalid winner or dealer-in seat/);
    expect(parse(win([0, -1000, 1000, 100], 2, 1))).toThrow(/Invalid win entry/);
    // Every error is a LogParseError.
    expect(errorCode(parse(short))).toBe("invalid");
  });

  it("rejects logs whose rounds or declarations disagree on the number of players", () => {
    const sanma = sanmaRound(QUIET, ["流局", [0, 0, 0, 0]]);
    const yonma = synthetic(
      [
        [[12], [60]],
        [[22], [60]],
        [[32], [60]],
        [[23], [60]],
      ],
      ["流局", [0, 0, 0, 0]],
    );
    expect(() => parseTenhouJson(sanmaLog([sanma, yonma]))).toThrow(
      /Some rounds are laid out for three players and others for four/,
    );
    for (const extra of [
      { ratingc: "PF3" },
      { rule: { disp: "三般南喰赤" } },
      { name: ["A", "B", "C"] },
    ]) {
      expect(() => parseTenhouJson(syntheticLog(yonma, extra)), JSON.stringify(extra)).toThrow(
        /says 3 players, but its rounds are laid out for 4/,
      );
    }
    for (const extra of [{ ratingc: "PF4" }, { rule: { disp: "四般南喰赤" } }]) {
      expect(() => parseTenhouJson(sanmaLog([sanma], extra)), JSON.stringify(extra)).toThrow(
        /says 4 players, but its rounds are laid out for 3/,
      );
    }
    // As in the other parsers, a log that disagrees about its players has an unsupported count.
    expect(errorCode(() => parseTenhouJson(sanmaLog([sanma], { ratingc: "PF4" })))).toBe(
      "unsupportedPlayers",
    );
    expect(errorCode(() => parseTenhouJson(sanmaLog([sanma, yonma])))).toBe("unsupportedPlayers");
  });

  it("answers every garbled three-player log with a game or a LogParseError", () => {
    const text = sanmaLog([sanmaRound(MINIMAL_LISTS, MINIMAL_RESULT)]);
    const outcomes = new Set<string>();
    for (const input of garbled(text, '0123456789-.,[]{}"crpkamf', 300)) {
      outcomes.add(parseOutcome(parseTenhouJson, input));
    }
    for (const at of cutPoints(text.length, 100)) {
      outcomes.add(parseOutcome(parseTenhouJson, closeJson(text.slice(0, at))));
    }
    expect(outcomes).toContain("game");
    expect(outcomes).toContain("invalid");
  });
});

describe("parseTenhouJson on truncated and garbled fixtures", () => {
  // parseOutcome fails the test on anything thrown that is not a LogParseError.
  const SOURCES = ["ranked_game.json", "suukantsu_1.json", "double_ron.json"];

  it.each(SOURCES)("answers every truncation of %s with a game or a LogParseError", (name) => {
    const text = readFixture(name);
    const outcomes = new Set<string>();
    for (const at of cutPoints(text.length, 150)) {
      const cut = text.slice(0, at);
      outcomes.add(parseOutcome(parseTenhouJson, cut));
      // Closed again, the truncated log gets past JSON.parse and into the round parser.
      outcomes.add(parseOutcome(parseTenhouJson, closeJson(cut)));
    }
    expect(outcomes).toContain("game");
    expect(outcomes).toContain("invalid");
  });

  it.each(SOURCES)("answers every garbled %s with a game or a LogParseError", (name) => {
    const outcomes = new Set<string>();
    for (const input of garbled(readFixture(name), '0123456789-.,[]{}"crpkam', 200)) {
      outcomes.add(parseOutcome(parseTenhouJson, input));
    }
    expect(outcomes).toContain("game");
    expect(outcomes).toContain("invalid");
  });
});

// Real three-player games kept outside the repository (src/test/corpus.ts): set
// TENHOU_JSON_SANMA_CORPUS_DIR to folders of Tenhou's own tenhou.net/6 JSON exports
// (tenhou.net/5/mjlog2json.cgi). Never commit them.
const sanmaCorpusFiles = corpusFiles(SANMA_TENHOU_JSON_CORPUS, ".json");

describe.skipIf(sanmaCorpusFiles.length === 0)(
  `parseTenhouJson: three-player corpus in ${SANMA_TENHOU_JSON_CORPUS}`,
  () => {
    it.each(sanmaCorpusFiles)("%s replays every kita and passes checkGame", (_, path) => {
      const text = readFileSync(path, "utf-8");
      const game = parseTenhouJson(text);
      expect(game.playerCount).toBe(3);
      expect(game.players[3]).toStrictEqual({ name: "" });
      const source = JSON.parse(text) as { log: unknown[][] };
      game.rounds.forEach((round, index) => {
        const discards = [6, 9, 12].flatMap((field) => source.log[index]?.[field] as unknown[]);
        const kita = round.events.filter((event) => event.type === "kita");
        expect(kita, `round ${index + 1}`).toHaveLength(
          discards.filter((item) => item === "f44").length,
        );
        expect(round.hands[3]).toEqual([]);
        // Wins get a hand only from the strict replay, which tracks every tile. The first winner
        // gains the hand's points, 200 per honba (100 from each of two players on a tsumo) and
        // every riichi deposit.
        const accepted = round.events.filter((event) => event.type === "riichiAccepted").length;
        round.events
          .filter((event) => event.type === "win")
          .forEach((win, order) => {
            expect(win.hand, `round ${index + 1}`).toBeDefined();
            const deposits = order === 0 ? (round.riichiSticks + accepted) * 1000 : 0;
            expect(win.deltas[win.seat], `round ${index + 1}`).toBe(
              (win.points ?? Number.NaN) + round.honba * 200 + deposits,
            );
          });
      });
      expect(checkGame(game)).toEqual([]);
    });
  },
);
