import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GameLog, Round, RoundEvent, RyukyokuEvent, WinEvent } from "../../core/model";
import type { Tile } from "../../core/tile";
import { closeJson, cutPoints, garbled, parseOutcome } from "../../test/fuzz";
import { toMjaiJsonl } from "../../test/mjai-serialize";
import { LogParseError } from "../errors";
import { parseLogText } from "../index";
import { parseTenhouJson } from "../tenhou-json/parse";
import { parseMjai } from "./parse";

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__/", import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}

/** Space-separated mjai tiles, converted to mpsz the way the parser does. */
function mpsz(spec: string): Tile[] {
  const honors = "ESWNPFC";
  return spec.split(" ").map((tile) => {
    if (honors.includes(tile)) return `${honors.indexOf(tile) + 1}z` as Tile;
    if (tile.endsWith("r")) return `0${tile[1]}` as Tile;
    return tile as Tile;
  });
}

const HIDDEN_13 = mpsz("? ? ? ? ? ? ? ? ? ? ? ? ?");

function events(...lines: object[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

const START_GAME = { type: "start_game", names: ["A", "B", "C", "D"] };
const TEHAIS = [
  ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "E", "E", "S", "S"],
  ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "W", "W", "N", "N"],
  ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "P", "P", "F", "F"],
  ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "C", "C", "1s", "1s"],
];
const startKyoku = (extra: object = {}) => ({
  type: "start_kyoku",
  bakaze: "E",
  dora_marker: "1p",
  kyoku: 1,
  honba: 0,
  kyotaku: 0,
  oya: 0,
  scores: [25000, 25000, 25000, 25000],
  tehais: TEHAIS,
  ...extra,
});

function expectError(text: string, code: LogParseError["code"]): void {
  try {
    parseMjai(text);
  } catch (error) {
    expect(error).toBeInstanceOf(LogParseError);
    expect((error as LogParseError).code).toBe(code);
    return;
  }
  expect.unreachable(`expected LogParseError(${code})`);
}

function lastEvent(game: GameLog, round = 0) {
  return game.rounds[round]?.events.at(-1);
}

describe("parseMjai: convlog flavor", () => {
  const game = parseMjai(fixture("convlog-flavor.jsonl"));

  it("reads the game header", () => {
    expect(game.format).toBe("mjai");
    expect(game.players).toEqual([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]);
    expect(game.rules).toEqual({ redFives: false, length: "east" });
    expect(game.id).toBeUndefined();
    expect(game.finalScores).toBeUndefined();
  });

  it("reads a round with a daiminkan, its dora, a riichi and a ron", () => {
    expect(game.rounds[0]).toStrictEqual<Round>({
      wind: 0,
      number: 1,
      dealer: 0,
      honba: 0,
      riichiSticks: 0,
      scores: [25000, 25000, 25000, 25000],
      doraIndicators: ["3m"],
      hands: [
        mpsz("1m 2m 3m 4p 5p 6p 7s 8s 9s E E S S"),
        mpsz("W W W 1m 1m 2p 3p 4p 6s 7s 8s 9m 9m"),
        mpsz("2m 3m 4m 5m 6m 7m 2p 2p 3s 4s 5s N N"),
        mpsz("1p 1p 9p 9p 1s 1s 9s P P F F C C"),
      ],
      events: [
        { type: "draw", seat: 0, tile: "3z" },
        { type: "discard", seat: 0, tile: "3z", tsumogiri: true, riichi: false },
        { type: "daiminkan", seat: 1, from: 0, tile: "3z", consumed: ["3z", "3z", "3z"] },
        { type: "draw", seat: 1, tile: "5m" },
        { type: "dora", indicator: "7p" },
        { type: "discard", seat: 1, tile: "6s", tsumogiri: false, riichi: false },
        { type: "draw", seat: 2, tile: "1m" },
        { type: "discard", seat: 2, tile: "1m", tsumogiri: true, riichi: true },
        { type: "riichiAccepted", seat: 2 },
        { type: "draw", seat: 3, tile: "4z" },
        { type: "discard", seat: 3, tile: "4z", tsumogiri: true, riichi: false },
        {
          type: "win",
          seat: 2,
          from: 3,
          deltas: [0, 0, 3600, -2600],
          tile: "4z",
          uraIndicators: ["2s"],
        },
      ],
    });
  });

  it("infers kyuushu kyuuhai when the round ends on a draw", () => {
    const round = game.rounds[1];
    expect(round?.scores).toEqual([25000, 25000, 27600, 22400]);
    expect(round?.events).toEqual([
      { type: "draw", seat: 1, tile: "4z" },
      { type: "ryukyoku", reason: "kyuushuKyuuhai", deltas: [0, 0, 0, 0] },
    ]);
  });
});

describe("parseMjai: gimite/mjai flavor", () => {
  const game = parseMjai(fixture("gimite-flavor.jsonl"));

  it("reads the game header and final scores", () => {
    expect(game.players.map((player) => player.name)).toEqual(["A", "B", "C", "D"]);
    // No aka_flag: red fives are inferred from the tiles; the numeric id is a seat, not a log id.
    expect(game.rules).toEqual({ redFives: true });
    expect(game.id).toBeUndefined();
    expect(game.finalScores).toEqual([24000, 36000, 16000, 24000]);
    expect(game.rounds).toHaveLength(3);
  });

  it("reads a ron with yaku, fu, han, points, hand and ura dora", () => {
    const round = game.rounds[0] as Round;
    expect(round.scores).toEqual([25000, 25000, 25000, 25000]);
    expect(round.hands[1]).toEqual(mpsz("2m 3m 4m 6m 7m 8m 3p 4p 5pr 6p 7p 3s 3s"));
    expect(round.events.slice(2, 5)).toEqual([
      { type: "draw", seat: 1, tile: "4z" },
      { type: "discard", seat: 1, tile: "4z", tsumogiri: true, riichi: true },
      { type: "riichiAccepted", seat: 1 },
    ]);
    expect(round.events.at(-1)).toStrictEqual<WinEvent>({
      type: "win",
      seat: 1,
      from: 2,
      deltas: [0, 9000, -8000, 0],
      tile: "8p",
      hand: mpsz("2m 3m 4m 6m 7m 8m 3p 4p 5pr 6p 7p 8p 3s 3s"),
      uraIndicators: ["9m"],
      yaku: [
        { key: "riichi", han: 1 },
        { key: "pinfu", han: 1 },
        { key: "dora", han: 2 },
        { key: "akaDora", han: 1 },
      ],
      fu: 30,
      han: 5,
      limit: "mangan",
      points: 8000,
    });
  });

  it("tracks scores when start_kyoku has none", () => {
    expect(game.rounds[1]?.scores).toEqual([25000, 33000, 17000, 25000]);
    expect(game.rounds[2]?.scores).toEqual([24000, 36000, 16000, 24000]);
  });

  it("infers tsumogiri when the log leaves it out", () => {
    expect(game.rounds[1]?.events.slice(0, 4)).toEqual([
      { type: "draw", seat: 1, tile: "7z" },
      { type: "discard", seat: 1, tile: "7z", tsumogiri: true, riichi: false },
      { type: "draw", seat: 2, tile: "4p" },
      { type: "discard", seat: 2, tile: "9m", tsumogiri: false, riichi: false },
    ]);
  });

  it("reads an exhaustive draw with tenpai and revealed hands", () => {
    expect(lastEvent(game, 1)).toStrictEqual<RyukyokuEvent>({
      type: "ryukyoku",
      reason: "exhaustive",
      deltas: [-1000, 3000, -1000, -1000],
      tenpai: [1],
      hands: [null, mpsz("1m 2m 3m 4p 5p 6p 7s 8s 9s 2s 2s P P"), null, null],
    });
  });

  it("reads kyuushu kyuuhai without tenpai", () => {
    expect(lastEvent(game, 2)).toStrictEqual<RyukyokuEvent>({
      type: "ryukyoku",
      reason: "kyuushuKyuuhai",
      deltas: [0, 0, 0, 0],
      hands: [null, mpsz("1m 9m 1p 9p 1s E S W P F C 2m 3m 4m"), null, null],
    });
  });

  it("infers tenpai at an exhaustive draw from the noten payments when tenpais is missing", () => {
    const drawWith = (extra: object, next: object[] = []) =>
      parseMjai(
        events(
          START_GAME,
          startKyoku(),
          { type: "tsumo", actor: 0, pai: "E" },
          { type: "dahai", actor: 0, pai: "E" },
          { type: "ryukyoku", reason: "fanpai", ...extra },
          { type: "end_kyoku" },
          ...next,
        ),
      ).rounds[0]?.events.at(-1);
    expect(drawWith({ deltas: [1500, -1500, 1500, -1500] })).toMatchObject({ tenpai: [0, 2] });
    expect(drawWith({ scores: [28000, 24000, 24000, 24000] })).toMatchObject({
      deltas: [3000, -1000, -1000, -1000],
      tenpai: [0],
    });
    // Deltas filled in from the next round's scores.
    expect(
      drawWith({}, [startKyoku({ honba: 1, scores: [26000, 26000, 24000, 24000] })]),
    ).toMatchObject({ deltas: [1000, 1000, -1000, -1000], tenpai: [0, 1] });
    // All tenpai or all noten: the payments cannot tell.
    expect(drawWith({ deltas: [0, 0, 0, 0] })).not.toHaveProperty("tenpai");
    // No deltas known at all.
    expect(drawWith({})).not.toHaveProperty("tenpai");
    // Only exhaustive draws have tenpai payments.
    expect(
      drawWith({ reason: "nagashimangan", deltas: [12000, -4000, -4000, -4000] }),
    ).not.toHaveProperty("tenpai");
  });

  it.each([
    ["fanpai", "exhaustive"],
    ["nagashimangan", "nagashiMangan"],
    ["kyushukyuhai", "kyuushuKyuuhai"],
    ["suchareach", "suuchaRiichi"],
    ["suukaikan", "suukaikan"],
    ["sanchaho", "sanchaHou"],
    ["sufonrenta", "suufonRenda"],
    ["kyuushu_kyuuhai", "kyuushuKyuuhai"],
    ["something_else", "unknown"],
    ["constructor", "unknown"],
  ])("maps ryukyoku reason %s to %s", (reason, expected) => {
    const text = events(
      START_GAME,
      startKyoku(),
      { type: "tsumo", actor: 0, pai: "E" },
      { type: "ryukyoku", reason },
    );
    expect(lastEvent(parseMjai(text))).toMatchObject({ type: "ryukyoku", reason: expected });
  });

  it("drops yaku worth 0 han", () => {
    const text = events(
      START_GAME,
      startKyoku(),
      { type: "tsumo", actor: 0, pai: "E" },
      {
        type: "hora",
        actor: 0,
        target: 0,
        pai: "E",
        yakus: [
          ["menzenchin_tsumoho", 1],
          ["uradora", 0],
          ["dora", 0],
        ],
        fu: 40,
        fan: 1,
        deltas: [2100, -700, -700, -700],
      },
    );
    expect((lastEvent(parseMjai(text)) as WinEvent).yaku).toEqual([{ key: "menzenTsumo", han: 1 }]);
  });

  it("maps gimite/mjai's riichi and double riichi names", () => {
    const yakuOf = (yakus: unknown[]) =>
      (
        lastEvent(
          parseMjai(
            events(
              START_GAME,
              startKyoku(),
              { type: "tsumo", actor: 0, pai: "E" },
              { type: "hora", actor: 0, target: 0, pai: "E", yakus, deltas: [0, 0, 0, 0] },
            ),
          ),
        ) as WinEvent
      ).yaku;
    // gimite/mjai's hora.rb writes :reach and :double_reach; the other spellings stay accepted.
    expect(yakuOf([["reach", 1]])).toEqual([{ key: "riichi", han: 1 }]);
    expect(yakuOf([["double_reach", 2]])).toEqual([{ key: "doubleRiichi", han: 2 }]);
    expect(yakuOf([["riichi", 1]])).toEqual([{ key: "riichi", han: 1 }]);
    expect(yakuOf([["double_riichi", 2]])).toEqual([{ key: "doubleRiichi", han: 2 }]);
  });

  it("reads the liable seat (pao) of a hora", () => {
    const horaWith = (extra: object) =>
      lastEvent(
        parseMjai(
          events(
            START_GAME,
            startKyoku(),
            { type: "tsumo", actor: 0, pai: "C" },
            {
              type: "hora",
              actor: 0,
              target: 0,
              pai: "C",
              yakus: [["daisangen", 100]],
              fu: 30,
              fan: 100,
              deltas: [48000, 0, -48000, 0],
              ...extra,
            },
          ),
        ),
      ) as WinEvent;
    expect(horaWith({ pao: 2 }).pao).toBe(2);
    expect(horaWith({})).not.toHaveProperty("pao");
    expect(horaWith({ pao: null })).not.toHaveProperty("pao");
    // The winner cannot be liable for their own hand.
    expect(horaWith({ pao: 0 })).not.toHaveProperty("pao");
    expectError(
      events(
        START_GAME,
        startKyoku(),
        { type: "tsumo", actor: 0, pai: "C" },
        {
          type: "hora",
          actor: 0,
          target: 0,
          pai: "C",
          pao: 7,
        },
      ),
      "invalid",
    );
  });

  it("reads yakuman yaku counted as 100 han", () => {
    const text = events(
      START_GAME,
      startKyoku(),
      { type: "tsumo", actor: 0, pai: "C" },
      {
        type: "hora",
        actor: 0,
        target: 0,
        pai: "C",
        yakus: [
          ["daisangen", 100],
          ["unknown_yaku", 2],
        ],
        fu: 30,
        fan: 100,
        hora_points: 48000,
        deltas: [48000, -16000, -16000, -16000],
      },
    );
    expect(lastEvent(parseMjai(text))).toMatchObject({
      tile: "7z",
      yaku: [
        { key: "daisangen", han: 13, yakuman: true },
        { key: null, raw: "unknown_yaku", han: 2 },
      ],
      han: 13,
      limit: "yakuman",
      points: 48000,
    });
  });
});

describe("parseMjai: hidden tiles", () => {
  const game = parseMjai(fixture("seat-view.jsonl"));
  const round = game.rounds[0] as Round;

  it("keeps unknown tiles", () => {
    expect(round.hands).toEqual([
      mpsz("1m 2m 3m 4p 5p 6p 7s 8s 9s E E S S"),
      HIDDEN_13,
      HIDDEN_13,
      HIDDEN_13,
    ]);
    expect(round.events.slice(2, 6)).toEqual([
      { type: "draw", seat: 1, tile: "?" },
      { type: "discard", seat: 1, tile: "5z", tsumogiri: true, riichi: false },
      { type: "draw", seat: 2, tile: "?" },
      { type: "discard", seat: 2, tile: "3p", tsumogiri: false, riichi: false },
    ]);
    expect(game.rules).toEqual({ redFives: false });
  });

  it("leaves out a winning tile that was not seen", () => {
    expect(round.events.at(-1)).toStrictEqual<WinEvent>({
      type: "win",
      seat: 1,
      from: 1,
      deltas: [-1300, 2700, -700, -700],
    });
  });
});

describe("parseMjai: input forms", () => {
  const jsonl = fixture("convlog-flavor.jsonl");
  const expected = parseMjai(jsonl);

  it("reads a JSON array of events", () => {
    const array = `[\n${jsonl.trim().split("\n").join(",\n")}\n]`;
    expect(parseMjai(array)).toStrictEqual(expected);
  });

  it("ignores a BOM, CRLF line ends and blank lines", () => {
    expect(parseMjai(`﻿\n${jsonl.replace(/\n/g, "\r\n\r\n")}`)).toStrictEqual(expected);
  });

  it("ignores unknown event types and fields", () => {
    const lines = jsonl.trim().split("\n");
    const withExtras = [
      lines[0],
      '{"type":"none"}',
      ...lines.slice(1, 4),
      '{"type":"error","message":"timeout"}',
      ...lines.slice(4).map((line) => line.replace(/}$/, ',"meta":{"q_values":[1,2]}}')),
      '{"type":"some_future_event","actor":0}',
    ].join("\n");
    expect(parseMjai(withExtras)).toStrictEqual(expected);
  });

  it("reads only the first game of a file", () => {
    const second = jsonl.replace('"names":["A","B","C","D"]', '"names":["E","F","G","H"]');
    const game = parseMjai(`${jsonl}${second}`);
    expect(game).toStrictEqual(expected);
  });

  it("is picked by the format detection", () => {
    expect(parseLogText(jsonl)).toStrictEqual(expected);
    expect(parseLogText(fixture("gimite-flavor.jsonl")).format).toBe("mjai");
  });
});

describe("parseMjai: scores", () => {
  it("computes missing deltas from the result's scores", () => {
    const text = events(
      START_GAME,
      startKyoku(),
      { type: "tsumo", actor: 0, pai: "E" },
      { type: "reach", actor: 0 },
      { type: "dahai", actor: 0, pai: "E", tsumogiri: true },
      { type: "reach_accepted", actor: 0 },
      { type: "tsumo", actor: 1, pai: "N" },
      { type: "dahai", actor: 1, pai: "N", tsumogiri: true },
      { type: "hora", actor: 0, target: 1, scores: [32700, 17300, 25000, 25000] },
    );
    // Seat 0 paid its riichi stick (24000) and collected it back with the hand.
    expect(lastEvent(parseMjai(text))).toMatchObject({ deltas: [8700, -7700, 0, 0], tile: "4z" });
  });

  it("computes missing deltas from the next round's scores", () => {
    const text = events(
      START_GAME,
      startKyoku(),
      { type: "tsumo", actor: 0, pai: "E" },
      { type: "hora", actor: 0, target: 0 },
      { type: "end_kyoku" },
      startKyoku({ honba: 1, scores: [31000, 23000, 23000, 23000] }),
      { type: "tsumo", actor: 0, pai: "E" },
      { type: "hora", actor: 0, target: 0 },
      { type: "end_kyoku" },
    );
    const game = parseMjai(text);
    expect(lastEvent(game, 0)).toMatchObject({ deltas: [6000, -2000, -2000, -2000] });
    // Nothing follows the last round, so its deltas stay unknown.
    expect(lastEvent(game, 1)).toMatchObject({ deltas: [0, 0, 0, 0] });
  });

  it("accepts a riichi whose reach_accepted is missing once play moves on", () => {
    const text = events(
      START_GAME,
      startKyoku(),
      { type: "tsumo", actor: 0, pai: "E" },
      { type: "reach", actor: 0 },
      { type: "dahai", actor: 0, pai: "E", tsumogiri: true },
      { type: "tsumo", actor: 1, pai: "N" },
    );
    expect(parseMjai(text).rounds[0]?.events.slice(1)).toEqual([
      { type: "discard", seat: 0, tile: "1z", tsumogiri: true, riichi: true },
      { type: "riichiAccepted", seat: 0 },
      { type: "draw", seat: 1, tile: "4z" },
    ]);
  });

  it("does not accept a riichi discard that is ronned", () => {
    const text = events(
      START_GAME,
      startKyoku(),
      { type: "tsumo", actor: 0, pai: "E" },
      { type: "reach", actor: 0 },
      { type: "dahai", actor: 0, pai: "E", tsumogiri: true },
      { type: "hora", actor: 1, target: 0, deltas: [-1000, 1000, 0, 0], ura_markers: ["2p"] },
    );
    const round = parseMjai(text).rounds[0] as Round;
    expect(round.events.some((event) => event.type === "riichiAccepted")).toBe(false);
    // Ura indicators count only for a winner who declared riichi.
    expect(round.events.at(-1)).toStrictEqual<WinEvent>({
      type: "win",
      seat: 1,
      from: 0,
      deltas: [-1000, 1000, 0, 0],
      tile: "1z",
    });
  });
});

describe("parseMjai: errors", () => {
  it("rejects player counts other than three and four", () => {
    expectError(events({ type: "start_game", names: ["A", "B"] }), "unsupportedPlayers");
    expectError(
      events({ type: "start_game", names: ["A", "B", "C", "D", "E"] }, startKyoku()),
      "unsupportedPlayers",
    );
    expectError(events({ type: "start_game", num_players: 2 }, startKyoku()), "unsupportedPlayers");
    expectError(events({ type: "start_game", num_players: "3" }, startKyoku()), "invalid");
  });

  it("rejects empty input", () => {
    expectError("", "empty");
    expectError(" \n\n ", "empty");
  });

  it("rejects malformed logs", () => {
    expectError('{"type":"start_game"}\nnot json', "invalid");
    expectError("[1, 2]", "invalid");
    expectError(events(START_GAME), "invalid");
    expectError(events(START_GAME, { type: "tsumo", actor: 0, pai: "E" }), "invalid");
    expectError(events(START_GAME, startKyoku(), { type: "tsumo", actor: 4, pai: "E" }), "invalid");
    expectError(
      events(START_GAME, startKyoku(), { type: "tsumo", actor: 0, pai: "0m" }),
      "invalid",
    );
    expectError(events(START_GAME, startKyoku({ bakaze: "X" })), "invalid");
    expectError(events(START_GAME, startKyoku({ bakaze: "constructor" })), "invalid");
    expectError(
      events(START_GAME, startKyoku({ tehais: [TEHAIS[0], TEHAIS[1], TEHAIS[2], ["1m"]] })),
      "invalid",
    );
    expectError(events(START_GAME, startKyoku({ dora_marker: "?" })), "invalid");
    expectError(
      events(START_GAME, startKyoku(), {
        type: "pon",
        actor: 1,
        target: 1,
        pai: "E",
        consumed: ["E", "E"],
      }),
      "invalid",
    );
    expectError(
      events(
        START_GAME,
        startKyoku(),
        { type: "ryukyoku", deltas: [0, 0, 0, 0] },
        { type: "tsumo", actor: 0, pai: "E" },
      ),
      "invalid",
    );
  });
});

// Three-player (sanma) logs: one invented hand written in the shape of each producer, as read
// from the producers' source (not captured output). Dealer 0 draws 9s, sets aside North, draws 5s
// and discards 9s; seats 1 and 2 discard once; seat 0 wins by tsumo on haku.

const H13 = Array.from({ length: 13 }, () => "?");
const SANMA_TEHAIS = [
  ["1m", "1m", "2p", "3p", "4p", "6p", "7p", "8p", "3s", "4s", "N", "P", "P"],
  ["1m", "9m", "1p", "1p", "5p", "9p", "2s", "6s", "7s", "E", "S", "W", "C"],
  ["9m", "9m", "3p", "5pr", "6p", "1s", "1s", "7s", "8s", "E", "W", "F", "F"],
];
const SANMA_KYOKU = {
  bakaze: "E",
  dora_marker: "8p",
  kyoku: 1,
  honba: 0,
  kyotaku: 0,
  oya: 0,
};

/** The hand's play, with the North event and the hidden draws of `hidden` seats as given. */
function sanmaPlay(north: object, hidden: number[] = []): object[] {
  const pai = (seat: number, tile: string) => (hidden.includes(seat) ? "?" : tile);
  return [
    { type: "tsumo", actor: 0, pai: "9s" },
    north,
    { type: "tsumo", actor: 0, pai: "5s" },
    { type: "dahai", actor: 0, pai: "9s", tsumogiri: false },
    { type: "tsumo", actor: 1, pai: pai(1, "F") },
    { type: "dahai", actor: 1, pai: "C", tsumogiri: false },
    { type: "tsumo", actor: 2, pai: pai(2, "1p") },
    { type: "dahai", actor: 2, pai: "E", tsumogiri: false },
    { type: "tsumo", actor: 0, pai: "P" },
  ];
}

const END = [{ type: "end_kyoku" }, { type: "end_game" }];
const NUKIDORA = { type: "nukidora", actor: 0, pai: "N" };
const KITA = { type: "kita", actor: 0, pai: "N" };

/** mjai-reviewer3p's convlog: four slots, an empty fourth, nukidora. */
const DIALECT_A2 = events(
  { type: "start_game", names: ["A", "B", "C", ""], kyoku_first: 0, aka_flag: true },
  {
    type: "start_kyoku",
    ...SANMA_KYOKU,
    scores: [35000, 35000, 35000, 0],
    tehais: [...SANMA_TEHAIS, H13],
  },
  ...sanmaPlay(NUKIDORA),
  { type: "hora", actor: 0, target: 0, deltas: [4000, -2000, -2000, 0], ura_markers: [] },
  ...END,
);

/** mortal-sanma's tenhou6_to_mjai.py: three slots, nukidora, Python's spaced separators. */
const DIALECT_C = [
  { type: "start_game", names: ["A", "B", "C"] },
  {
    type: "start_kyoku",
    ...SANMA_KYOKU,
    scores: [35000, 35000, 35000],
    // The script sorts by Tenhou tile id, which puts the red five last.
    tehais: [
      SANMA_TEHAIS[0],
      SANMA_TEHAIS[1],
      ["9m", "9m", "3p", "6p", "1s", "1s", "7s", "8s", "E", "W", "F", "F", "5pr"],
    ],
  },
  ...sanmaPlay(NUKIDORA),
  { type: "hora", actor: 0, target: 0, deltas: [4000, -2000, -2000] },
  ...END,
]
  .map((line) => JSON.stringify(line).replace(/([,:])(?=["[{\d-]|true|false)/g, "$1 "))
  .join("\n");

/** Akagi v3's history file, recorded from seat 0: three slots, num_players, kita. */
const DIALECT_D_AKAGI = events(
  { type: "start_game", names: ["A", "B", "C"], id: 0, num_players: 3 },
  {
    type: "start_kyoku",
    ...SANMA_KYOKU,
    scores: [35000, 35000, 35000],
    tehais: [SANMA_TEHAIS[0], H13, H13],
    num_players: 3,
  },
  ...sanmaPlay(KITA, [1, 2]),
  { type: "hora", actor: 0, target: 0, deltas: [4000, -2000, -2000] },
  ...END,
);

/** RiichiEnv's env log: a bare start_game, three slots, kita, keys in alphabetical order. */
const DIALECT_D_RIICHIENV = [
  { type: "start_game" },
  {
    type: "start_kyoku",
    ...SANMA_KYOKU,
    scores: [35000, 35000, 35000],
    tehais: SANMA_TEHAIS,
  },
  ...sanmaPlay(KITA),
  {
    type: "hora",
    actor: 0,
    target: 0,
    deltas: [4000, -2000, -2000],
    tsumo: true,
    ura_markers: [],
  },
  ...END,
]
  .map((line) => JSON.stringify(Object.fromEntries(Object.entries(line).sort())))
  .join("\n");

/** Akagi-NG, recorded from seat 0: four-slot start_kyoku, three-slot results, kita. */
const DIALECT_E = events(
  { type: "start_game", names: ["A", "B", "C"], num_players: 3 },
  {
    type: "start_kyoku",
    ...SANMA_KYOKU,
    scores: [35000, 35000, 35000, 0],
    tehais: [SANMA_TEHAIS[0], H13, H13, H13],
  },
  ...sanmaPlay(KITA, [1, 2]),
  {
    type: "hora",
    actor: 0,
    target: 0,
    pai: "P",
    scores: [39000, 33000, 33000],
    deltas: [4000, -2000, -2000],
  },
  ...END,
);

/** The Akagi v2 / MahjongCopilot bridge stream for libriichi3p: no names, no result. */
const DIALECT_A1 = events(
  { type: "start_game", id: 0 },
  {
    type: "start_kyoku",
    ...SANMA_KYOKU,
    scores: [35000, 35000, 35000, 0],
    tehais: [SANMA_TEHAIS[0], H13, H13, H13],
  },
  ...sanmaPlay(NUKIDORA, [1, 2]),
  ...END,
);

const SANMA_EVENTS: RoundEvent[] = [
  { type: "draw", seat: 0, tile: "9s" },
  { type: "kita", seat: 0, tile: "4z" },
  { type: "draw", seat: 0, tile: "5s" },
  { type: "discard", seat: 0, tile: "9s", tsumogiri: false, riichi: false },
  { type: "draw", seat: 1, tile: "6z" },
  { type: "discard", seat: 1, tile: "7z", tsumogiri: false, riichi: false },
  { type: "draw", seat: 2, tile: "1p" },
  { type: "discard", seat: 2, tile: "1z", tsumogiri: false, riichi: false },
  { type: "draw", seat: 0, tile: "5z" },
  { type: "win", seat: 0, from: 0, deltas: [4000, -2000, -2000, 0], tile: "5z" },
];

const SANMA_ROUND: Round = {
  wind: 0,
  number: 1,
  dealer: 0,
  honba: 0,
  riichiSticks: 0,
  scores: [35000, 35000, 35000, 0],
  doraIndicators: ["8p"],
  hands: [
    mpsz("1m 1m 2p 3p 4p 6p 7p 8p 3s 4s N P P"),
    mpsz("1m 9m 1p 1p 5p 9p 2s 6s 7s E S W C"),
    mpsz("9m 9m 3p 5pr 6p 1s 1s 7s 8s E W F F"),
    [],
  ],
  events: SANMA_EVENTS,
};

/** The same round recorded from seat 0: the other hands and draws are hidden. */
const SANMA_SEAT_VIEW: Round = {
  ...SANMA_ROUND,
  hands: [SANMA_ROUND.hands[0], HIDDEN_13, HIDDEN_13, []],
  events: SANMA_EVENTS.map((event) =>
    event.type === "draw" && event.seat !== 0 ? { ...event, tile: "?" } : event,
  ),
};

const ABC = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "" }];
const NO_NAMES = [{ name: "" }, { name: "" }, { name: "" }, { name: "" }];

describe("parseMjai: three-player dialects", () => {
  it.each<[string, string, object[], GameLog["rules"], Round]>([
    ["A2 (convlog3p)", DIALECT_A2, ABC, { redFives: true, length: "south" }, SANMA_ROUND],
    [
      "C (mortal-sanma)",
      DIALECT_C,
      ABC,
      // No aka_flag: red fives are inferred from the 5pr in seat 2's hand.
      { redFives: true },
      {
        ...SANMA_ROUND,
        hands: [
          SANMA_ROUND.hands[0],
          SANMA_ROUND.hands[1],
          mpsz("9m 9m 3p 6p 1s 1s 7s 8s E W F F 5pr"),
          [],
        ],
      },
    ],
    ["D (RiichiEnv)", DIALECT_D_RIICHIENV, NO_NAMES, { redFives: true }, SANMA_ROUND],
    // Seat views: no red five is seen.
    ["D (Akagi v3)", DIALECT_D_AKAGI, ABC, { redFives: false }, SANMA_SEAT_VIEW],
    ["E (Akagi-NG)", DIALECT_E, ABC, { redFives: false }, SANMA_SEAT_VIEW],
    [
      "A1 (Akagi v2 bridge)",
      DIALECT_A1,
      NO_NAMES,
      { redFives: false },
      // The stream ends the round without a result.
      { ...SANMA_SEAT_VIEW, events: SANMA_SEAT_VIEW.events.slice(0, -1) },
    ],
  ])("reads dialect %s", (_, text, players, rules, round) => {
    expect(parseMjai(text)).toStrictEqual({
      format: "mjai",
      playerCount: 3,
      players,
      rules,
      rounds: [round],
    });
  });

  it("is picked by the format detection", () => {
    expect(parseLogText(DIALECT_A2)).toStrictEqual(parseMjai(DIALECT_A2));
    expect(parseLogText(DIALECT_D_AKAGI).playerCount).toBe(3);
  });
});

/** A three-slot (Akagi v3) log: start_game, then a start_kyoku with `extra` fields. */
function sanma(kyoku: object = {}, ...lines: object[]): string {
  return events(
    { type: "start_game", names: ["A", "B", "C"] },
    {
      type: "start_kyoku",
      ...SANMA_KYOKU,
      scores: [35000, 35000, 35000],
      tehais: SANMA_TEHAIS,
      ...kyoku,
    },
    ...lines,
  );
}

/** Draw-and-discard turns in three-player order from seat 0, `count` draws in all. */
function sanmaTurns(count: number): object[] {
  const lines: object[] = [];
  for (let index = 0; index < count; index += 1) {
    lines.push(
      { type: "tsumo", actor: index % 3, pai: "1s" },
      { type: "dahai", actor: index % 3, pai: "1s", tsumogiri: true },
    );
  }
  return lines;
}

describe("parseMjai: three-player games", () => {
  it("decides the player count", () => {
    const countOf = (text: string) => parseMjai(text).playerCount;
    const kyoku = (extra: object) => ({ type: "start_kyoku", ...SANMA_KYOKU, ...extra });
    const fourSlot = (names: unknown[], ...lines: object[]) =>
      events(
        { type: "start_game", names },
        kyoku({ scores: [35000, 35000, 35000, 0], tehais: [...SANMA_TEHAIS, H13] }),
        ...lines,
      );
    expect(countOf(sanma())).toBe(3);
    // num_players, and three-entry arrays without names.
    expect(
      countOf(
        events(
          { type: "start_game", names: ["A", "B", "C", ""], num_players: 3 },
          kyoku({ scores: [35000, 35000, 35000, 0], tehais: [...SANMA_TEHAIS, []] }),
        ),
      ),
    ).toBe(3);
    expect(countOf(events(kyoku({ scores: [35000, 35000, 35000, 0], tehais: SANMA_TEHAIS })))).toBe(
      3,
    );
    expect(
      countOf(events(kyoku({ scores: [35000, 35000, 35000], tehais: [...SANMA_TEHAIS, H13] }))),
    ).toBe(3);
    // A four-slot log whose seat 3 is an empty chair that never plays, with or without a North.
    expect(countOf(fourSlot(["A", "B", "C", ""], ...sanmaTurns(3)))).toBe(3);
    expect(countOf(fourSlot(["A", "B", "C", ""], ...sanmaPlay(NUKIDORA)))).toBe(3);
    // Seat 3 plays, or has a name: four players, one of them at 0 points.
    expect(countOf(fourSlot(["A", "B", "C", "D"], ...sanmaTurns(3)))).toBe(4);
    expect(
      countOf(
        fourSlot(
          ["A", "B", "C", ""],
          ...sanmaTurns(3),
          { type: "tsumo", actor: 3, pai: "1s" },
          { type: "dahai", actor: 3, pai: "1s", tsumogiri: true },
        ),
      ),
    ).toBe(4);
  });

  it("gives the empty chair its placeholders", () => {
    const game = parseMjai(sanma({}, ...sanmaTurns(3)));
    expect(game.players[3]).toStrictEqual({ name: "" });
    expect(game.rounds[0]?.scores).toEqual([35000, 35000, 35000, 0]);
    expect(game.rounds[0]?.hands[3]).toEqual([]);
    // Without scores in start_kyoku, each player starts with 35000.
    expect(parseMjai(sanma({ scores: undefined })).rounds[0]?.scores).toEqual([
      35000, 35000, 35000, 0,
    ]);
  });

  it("reads a kita without pai, and a ron on the North set aside", () => {
    const round = parseMjai(
      sanma(
        { kyoku: 2, oya: 1 },
        { type: "tsumo", actor: 1, pai: "N" },
        { type: "kita", actor: 1 },
        { type: "hora", actor: 2, target: 1, deltas: [0, -3900, 3900] },
      ),
    ).rounds[0] as Round;
    expect(round.dealer).toBe(1);
    expect(round.events).toStrictEqual<RoundEvent[]>([
      { type: "draw", seat: 1, tile: "4z" },
      { type: "kita", seat: 1, tile: "4z" },
      { type: "win", seat: 2, from: 1, deltas: [0, -3900, 3900, 0], tile: "4z" },
    ]);
  });

  it("keeps a kan dora where the log puts it, before or after the kita", () => {
    const kanThenKita = (doraFirst: boolean) => {
      const dora = { type: "dora", dora_marker: "1p" };
      const kita = { type: "kita", actor: 0, pai: "N" };
      return parseMjai(
        sanma(
          {},
          { type: "tsumo", actor: 0, pai: "P" },
          { type: "kakan", actor: 0, pai: "P", consumed: ["P", "P", "P"] },
          { type: "tsumo", actor: 0, pai: "N" },
          ...(doraFirst ? [dora, kita] : [kita, dora]),
          { type: "tsumo", actor: 0, pai: "1s" },
          { type: "dahai", actor: 0, pai: "1s", tsumogiri: true },
        ),
      ).rounds[0]?.events.map((event) => event.type);
    };
    // Akagi v3 (Mahjong Soul) writes the dora first, RiichiEnv and Tenhou after the kita.
    expect(kanThenKita(true)).toEqual(["draw", "kakan", "draw", "dora", "kita", "draw", "discard"]);
    expect(kanThenKita(false)).toEqual([
      "draw",
      "kakan",
      "draw",
      "kita",
      "dora",
      "draw",
      "discard",
    ]);
  });

  it("infers draw reasons with a 55-tile wall and the three-player noten payments", () => {
    const endOf = (draws: number, ending: object) =>
      lastEvent(parseMjai(sanma({}, ...sanmaTurns(draws), { type: "ryukyoku", ...ending })));
    expect(endOf(55, { deltas: [2000, -1000, -1000] })).toStrictEqual<RyukyokuEvent>({
      type: "ryukyoku",
      reason: "exhaustive",
      deltas: [2000, -1000, -1000, 0],
      tenpai: [0],
    });
    expect(endOf(55, { deltas: [-1000, 2000, -1000, 0] })).toMatchObject({ tenpai: [1] });
    expect(endOf(55, { deltas: [-4000, 6000, -2000] })).toMatchObject({ reason: "nagashiMangan" });
    // An abortive draw on a discard: four players would be sanchahou, three cannot ron three times.
    expect(endOf(4, { deltas: [0, 0, 0] })).toMatchObject({ reason: "unknown" });
    expect(endOf(54, { deltas: [0, 0, 0] })).toMatchObject({ reason: "unknown" });
  });

  it("reads explicit draw reasons, and leaves four-player-only ones unknown", () => {
    const reasonOf = (reason: string) =>
      (
        lastEvent(
          parseMjai(sanma({}, ...sanmaTurns(4), { type: "ryukyoku", reason })),
        ) as RyukyokuEvent
      ).reason;
    expect(reasonOf("exhaustive_draw")).toBe("exhaustive");
    expect(reasonOf("suukansansen")).toBe("suukaikan");
    expect(reasonOf("suucha_riichi")).toBe("unknown");
    expect(reasonOf("sufuurenta")).toBe("unknown");
    expect(reasonOf("sanchaho")).toBe("unknown");
  });

  it("reads Akagi-NG's empty arrays on an abortive draw as no payments", () => {
    const empty = {
      type: "ryukyoku",
      scores: [],
      deltas: [],
      tenpais: [],
      reason: "kyushu_kyuhai",
    };
    const expected: RyukyokuEvent = {
      type: "ryukyoku",
      reason: "kyuushuKyuuhai",
      deltas: [0, 0, 0, 0],
    };
    const drawn = { type: "tsumo", actor: 0, pai: "E" };
    expect(lastEvent(parseMjai(sanma({}, drawn, empty)))).toStrictEqual(expected);
    expect(lastEvent(parseMjai(events(START_GAME, startKyoku(), drawn, empty)))).toStrictEqual(
      expected,
    );
  });

  it("reads per-seat fields set to null (Akagi-NG's reach_accepted) as absent", () => {
    const riichi = (accepted: object, result: object) =>
      sanma(
        {},
        { type: "tsumo", actor: 0, pai: "9s" },
        { type: "reach", actor: 0 },
        { type: "dahai", actor: 0, pai: "9s", tsumogiri: true },
        { type: "reach_accepted", actor: 0, ...accepted },
        { type: "tsumo", actor: 1, pai: "F" },
        { type: "dahai", actor: 1, pai: "F", tsumogiri: true },
        result,
        { type: "end_kyoku" },
        { type: "start_kyoku", ...SANMA_KYOKU, honba: 1, tehais: SANMA_TEHAIS },
      );
    const ron = { type: "hora", actor: 2, target: 1, pai: "F", deltas: [0, -2000, 2000] };
    const withNulls = parseMjai(riichi({ scores: null, deltas: null }, ron));
    expect(withNulls).toStrictEqual(parseMjai(riichi({}, ron)));
    // Seat 0 paid its riichi deposit, which the ron left on the table.
    expect(withNulls.rounds[1]?.scores).toEqual([34000, 33000, 37000, 0]);
    // A null deltas next to the scores after the win: the deltas come from the scores.
    const fromScores = parseMjai(
      riichi(
        { scores: null, deltas: null },
        { ...ron, deltas: null, scores: [34000, 33000, 37000] },
      ),
    );
    expect(fromScores).toStrictEqual(withNulls);
    // Four players too: a start_kyoku without scores carries the running scores on.
    const fourPlayer = events(
      START_GAME,
      startKyoku({ scores: null }),
      { type: "tsumo", actor: 0, pai: "E" },
      { type: "ryukyoku", reason: "kyushu_kyuhai", deltas: null, scores: null },
    );
    expect(parseMjai(fourPlayer).rounds[0]?.scores).toEqual([25000, 25000, 25000, 25000]);
  });

  it("splits a multi-ron's combined deltas that Akagi repeats on every hora", () => {
    // Seat 0 deals in to seats 1 and 2 with one riichi deposit on the table, which goes to seat 1,
    // first in turn order after seat 0.
    const doubleRon = (first: number[], second: number[], extra: object = {}) =>
      parseMjai(
        sanma(
          { kyotaku: 1 },
          { type: "tsumo", actor: 0, pai: "1s" },
          { type: "dahai", actor: 0, pai: "1s", tsumogiri: true },
          { type: "hora", actor: 1, target: 0, deltas: first, ...extra },
          { type: "hora", actor: 2, target: 0, deltas: second, ...extra },
          { type: "end_kyoku" },
          { type: "start_kyoku", ...SANMA_KYOKU, kyoku: 2, oya: 1, tehais: SANMA_TEHAIS },
        ),
      );
    const winsOf = (game: GameLog) => game.rounds[0]?.events.filter((e) => e.type === "win");
    const perWinner = doubleRon([-8000, 9000, 0], [-2000, 0, 2000]);
    expect(winsOf(perWinner)?.map((win) => win.deltas)).toEqual([
      [-8000, 9000, 0, 0],
      [-2000, 0, 2000, 0],
    ]);
    const combined = doubleRon([-10000, 9000, 2000], [-10000, 9000, 2000]);
    expect(combined).toStrictEqual(perWinner);
    // Counted once in the running scores.
    expect(combined.rounds[1]?.scores).toEqual([25000, 44000, 37000, 0]);
    // With the scores after the win (Akagi-NG), these are used.
    const withScores = doubleRon([-10000, 9000, 2000], [-10000, 9000, 2000], {
      scores: [25000, 44000, 37000],
    });
    expect(withScores).toStrictEqual(perWinner);
    // Deltas that do not split into a deposit and two payments are left as they are.
    const odd = doubleRon([-10000, 9000, 1500], [-10000, 9000, 1500]);
    expect(winsOf(odd)?.map((win) => win.deltas)).toEqual([
      [-10000, 9000, 1500, 0],
      [-10000, 9000, 1500, 0],
    ]);
    expect(odd.rounds[1]?.scores).toEqual([25000, 44000, 36500, 0]);
  });

  it("rejects three-player logs that are not consistent", () => {
    const tsumo = (actor: number) => ({ type: "tsumo", actor, pai: "1s" });
    // Seat 3 plays in a three-slot log.
    expectError(sanma({}, tsumo(3)), "invalid");
    expectError(
      sanma({}, tsumo(0), { type: "pon", actor: 1, target: 3, pai: "E", consumed: ["E", "E"] }),
      "invalid",
    );
    expectError(sanma({ oya: 3 }), "invalid");
    expectError(sanma({ kyoku: 4, oya: 0 }), "invalid");
    expectError(sanma({}, tsumo(0), { type: "hora", actor: 0, target: 0, pao: 3 }), "invalid");
    // A fourth slot that is not an empty chair: points for it are invalid, while a name or a dealt
    // hand for it contradicts the player count (as INIT dealing seat 3 a hand does in mjlog).
    expectError(DIALECT_A2.replace("[35000,35000,35000,0]", "[35000,35000,35000,1000]"), "invalid");
    expectError(DIALECT_A2.replace("-2000,-2000,0]", "-2000,-2000,500]"), "invalid");
    expectError(DIALECT_A2.replace('"C",""]', '"C","D"]'), "unsupportedPlayers");
    expectError(
      events(
        { type: "start_game", num_players: 3 },
        startKyoku({ scores: [35000, 35000, 35000, 0] }),
      ),
      "unsupportedPlayers",
    );
    // Arrays of other lengths and starting hands of other sizes.
    expectError(sanma({ scores: [35000, 35000] }), "invalid");
    expectError(sanma({ tehais: [SANMA_TEHAIS[0], SANMA_TEHAIS[1], ["1m"]] }), "invalid");
    expectError(sanma({}, tsumo(0), { type: "ryukyoku", deltas: [0, 0] }), "invalid");
    // Only North is set aside.
    expectError(sanma({}, tsumo(0), { type: "kita", actor: 0, pai: "E" }), "invalid");
    expectError(sanma({}, tsumo(0), { type: "nukidora", actor: 0, pai: "?" }), "invalid");
    // Player counts that disagree, an unsupported player count in every parser.
    expectError(
      events({ type: "start_game", num_players: 4 }, startKyoku(), tsumo(0), KITA),
      "unsupportedPlayers",
    );
    expectError(
      events(
        { type: "start_game", names: ["A", "B", "C"], num_players: 4 },
        startKyoku({ tehais: SANMA_TEHAIS }),
      ),
      "unsupportedPlayers",
    );
    expectError(
      events({ type: "start_game", num_players: 3 }, { ...startKyoku(), num_players: 4 }),
      "unsupportedPlayers",
    );
  });
});

/** A tenhou.net/6 fixture as the convlog-style mjai the test serializer writes for it. */
function tenhouAsMjai(name: string): string {
  const path = new URL(`../tenhou-json/__fixtures__/convlog/${name}`, import.meta.url);
  return toMjaiJsonl(parseTenhouJson(readFileSync(fileURLToPath(path), "utf-8")));
}

describe("parseMjai on truncated and garbled logs", () => {
  // parseOutcome fails the test on anything thrown that is not a LogParseError.
  const SOURCES: Array<[string, () => string]> = [
    ["ranked_game.json as mjai", () => tenhouAsMjai("ranked_game.json")],
    ["suukantsu_1.json as mjai", () => tenhouAsMjai("suukantsu_1.json")],
    ["gimite-flavor.jsonl", () => fixture("gimite-flavor.jsonl")],
    ["the three-player A2 sample", () => DIALECT_A2],
    ["the three-player E sample", () => DIALECT_E],
  ];

  it.each(SOURCES)("answers every truncation of %s with a game or a LogParseError", (_, load) => {
    const text = load();
    const outcomes = new Set<string>();
    for (const at of cutPoints(text.length, 200)) {
      const cut = text.slice(0, at);
      outcomes.add(parseOutcome(parseMjai, cut));
      // Closed again, a line cut in the middle is read as an event.
      outcomes.add(parseOutcome(parseMjai, closeJson(cut)));
    }
    expect(outcomes).toContain("game");
    expect(outcomes).toContain("invalid");
  });

  it.each(SOURCES)("answers every garbled %s with a game or a LogParseError", (_, load) => {
    const outcomes = new Set<string>();
    for (const input of garbled(load(), '0123456789-,[]{}":?ESWNPFCmpsr\n', 300)) {
      outcomes.add(parseOutcome(parseMjai, input));
    }
    expect(outcomes).toContain("game");
    expect(outcomes).toContain("invalid");
  });
});
