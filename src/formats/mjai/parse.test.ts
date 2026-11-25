import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GameLog, Round, RyukyokuEvent, WinEvent } from "../../core/model";
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
  it("rejects three-player logs", () => {
    expectError(events({ type: "start_game", names: ["A", "B", "C"] }), "unsupportedPlayers");
    expectError(
      events(START_GAME, startKyoku({ tehais: TEHAIS.slice(0, 3) })),
      "unsupportedPlayers",
    );
    expectError(
      events(START_GAME, startKyoku({ scores: [35000, 35000, 35000] })),
      "unsupportedPlayers",
    );
    expectError(
      events(
        START_GAME,
        startKyoku(),
        { type: "tsumo", actor: 0, pai: "N" },
        { type: "nukidora", actor: 0, pai: "N" },
      ),
      "unsupportedPlayers",
    );
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
