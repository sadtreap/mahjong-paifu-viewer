/**
 * mjlog parser tests. Tenhou's game records carry no license, so none is committed: whole games
 * come from the test-only encoder (src/test/mjlog-serialize.ts), which writes the tenhou.net/6
 * fixtures and hand-built games as mjlog, and real games are read only from a local
 * MJLOG_CORPUS_DIR or SANMA_MJLOG_CORPUS_DIR (see the end of this file).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CallEvent,
  GameLog,
  PlayerCount,
  Round,
  RoundEvent,
  Seat,
  WinEvent,
} from "../../core/model";
import { LIVE_WALL_SIZE } from "../../core/players";
import {
  doraFromIndicator,
  isSameKind,
  type KnownTile,
  sortTiles,
  type Tile,
} from "../../core/tile";
import { checkGame } from "../../replay/check";
import { corpusFiles, MJLOG_CORPUS, SANMA_MJLOG_CORPUS } from "../../test/corpus";
import { cutPoints, garbled, parseOutcome } from "../../test/fuzz";
import { stripMjlogUnsupported, toMjlogXml } from "../../test/mjlog-serialize";
import { makeSanmaGame, sampleSanmaRound, tiles } from "../../test/round-builder";
import { LogParseError } from "../errors";
import { parseLogText } from "../index";
import { parseTenhouJson } from "../tenhou-json/parse";
import { decodeMeld, tileFromId } from "./meld";
import { parseMjlog } from "./parse";
import { type MjlogTag, readTags } from "./tags";

const TENHOU_DIR = join(import.meta.dirname, "..", "tenhou-json", "__fixtures__", "convlog");

/** A tenhou.net/6 fixture written as mjlog by the test encoder. */
function encodedFixture(name: string): string {
  return toMjlogXml(parseTenhouJson(readFileSync(join(TENHOU_DIR, `${name}.json`), "utf-8")));
}

/** Every tenhou.net/6 fixture the encoder can write (see roundtrip.test.ts for the one it cannot). */
const ENCODED_FIXTURES = readdirSync(TENHOU_DIR)
  .filter((name) => name.endsWith(".json") && name !== "confusing_nakis_2.json")
  .map((name) => name.replace(/\.json$/, ""))
  .sort();

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof LogParseError ? error.code : `other: ${String(error)}`;
  }
  return undefined;
}

/** Starting hands for synthetic logs; seat 0 holds the three red fives (16, 52, 88) and 17 (5m). */
const HANDS = [
  "16,52,88,17,0,4,8,12,20,24,28,32,36",
  "1,5,9,13,21,25,29,33,37,40,44,48,56",
  "2,6,10,14,22,26,30,34,38,41,45,49,57",
  "3,7,11,15,23,27,31,35,39,42,46,50,58",
];
const GO = '<GO type="169" lobby="0"/>';
const UN =
  '<UN n0="%41" n1="%E3%81%82" n2="%E2%93%A3%54%65%73%74" n3="%E3" dan="0,9,10,20" rate="1500.00,1612.5,1987.40,1800" sx="M,F,M,C"/>';

function init(seed = "0,0,0,1,2,124", ten = "250,250,250,250", oya = 0): string {
  const hands = HANDS.map((hand, seat) => `hai${seat}="${hand}"`).join(" ");
  return `<INIT seed="${seed}" ten="${ten}" oya="${oya}" ${hands}/>`;
}

function mjlog(...tags: string[]): string {
  return `<mjloggm ver="2.3"><SHUFFLE seed="mt19937ar-sha512-n288-base64,abc" ref=""/>${tags.join("")}</mjloggm>`;
}

/** Events of the only round of a synthetic log. */
function eventsOf(...tags: string[]): RoundEvent[] {
  const game = parseMjlog(mjlog(GO, UN, '<TAIKYOKU oya="0"/>', init(), ...tags));
  return game.rounds[0]?.events ?? [];
}

/*
 * Three-player logs as Tenhou writes them: no 2m-8m (ids 4-31), seat 3 empty. Seat 0 holds the red
 * 0p (52), three 9m (32-34) and a North (120); seat 1 a North (121) and two 5z (124, 125).
 */
const SANMA_HANDS = [
  "0,32,33,34,36,40,44,52,60,64,68,108,120",
  "1,69,72,76,80,88,96,100,104,121,124,125,128",
  "2,41,45,48,53,56,77,81,84,89,92,109,132",
];
/** 0xB9: phoenix room, south, three players (0x10), human players. */
const SANMA_GO = '<GO type="185" lobby="0"/>';
const SANMA_UN =
  '<UN n0="%41" n1="%42" n2="%43" n3="" dan="16,13,0,0" rate="2000.50,1800.00,1500.00,1500.00" sx="M,F,M,C"/>';

function sanmaInit(seed = "0,0,0,1,2,112", ten = "350,350,350,0", oya = 0): string {
  const hands = SANMA_HANDS.map((hand, seat) => `hai${seat}="${hand}"`).join(" ");
  return `<INIT seed="${seed}" ten="${ten}" oya="${oya}" ${hands} hai3=""/>`;
}

/** Events of the only round of a synthetic three-player log. */
function sanmaEventsOf(...tags: string[]): RoundEvent[] {
  const game = parseMjlog(mjlog(SANMA_GO, SANMA_UN, '<TAIKYOKU oya="0"/>', sanmaInit(), ...tags));
  return game.rounds[0]?.events ?? [];
}

describe("readTags", () => {
  it("reads names and attributes, skipping declarations, comments and text", () => {
    const tags = readTags(
      `<?xml version="1.0"?>\n<!-- a > comment --><mjloggm ver='2.3'>\n<T12/><UN n0="a&amp;b&#x41;&#66;" /></mjloggm>`,
    );
    expect(tags?.map((tag) => [tag.closing ? `/${tag.name}` : tag.name, [...tag.attrs]])).toEqual([
      ["mjloggm", [["ver", "2.3"]]],
      ["T12", []],
      ["UN", [["n0", "a&bAB"]]],
      ["/mjloggm", []],
    ]);
  });

  it("ignores > inside quoted values and leaves unknown entities alone", () => {
    const tags = readTags('<UN n0="a>b" n1="&constructor;&#x110000;"/>');
    expect(tags?.[0]?.attrs.get("n0")).toBe("a>b");
    expect(tags?.[0]?.attrs.get("n1")).toBe("&constructor;&#x110000;");
  });

  it("returns null for an unterminated tag", () => {
    expect(readTags('<mjloggm ver="2.3"><T12')).toBeNull();
  });

  it("reads attributes next to stray text and words without a value", () => {
    const tags = readTags("<GO junk type=\"169\" =x lobby = '0' flag/>");
    expect([...(tags?.[0]?.attrs ?? [])]).toEqual([
      ["type", "169"],
      ["lobby", "0"],
    ]);
  });

  it("scans long tags in linear time", () => {
    // A long word without "=" used to be rescanned from every one of its characters.
    const text = `<mjloggm ver="2.3"><GO ${"a".repeat(100_000)} type="169"/></mjloggm>`;
    const start = performance.now();
    const tags = readTags(text);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(tags?.[1]?.attrs.get("type")).toBe("169");
  });
});

describe("tileFromId", () => {
  it("maps ids to kinds", () => {
    expect([0, 3, 4, 35, 36, 71, 72, 107, 108, 120, 135].map((id) => tileFromId(id, true))).toEqual(
      ["1m", "1m", "2m", "9m", "1p", "9p", "1s", "9s", "1z", "4z", "7z"],
    );
  });

  it("marks ids 16, 52 and 88 as red fives only when red fives are on", () => {
    expect([16, 17, 52, 53, 88, 91].map((id) => tileFromId(id, true))).toEqual([
      "0m",
      "5m",
      "0p",
      "5p",
      "0s",
      "5s",
    ]);
    expect([16, 52, 88].map((id) => tileFromId(id, false))).toEqual(["5m", "5p", "5s"]);
  });
});

describe("decodeMeld", () => {
  it("decodes a chi of the lowest tile", () => {
    // 3m(id 9) called with 4m(12) and 0m(16): run 3m-4m-5m is base 2, called index 0, so bits
    // 10-15 = 2*3+0 = 6; copies 1,0,0 in bits 3-4/5-6/7-8; chi flag 0x4; from the left (3).
    // 6<<10 | 1<<3 | 0x4 | 3 = 6159
    expect(decodeMeld(6159)).toEqual({ type: "chi", from: 3, called: 9, consumed: [12, 16] });
  });

  it("decodes a chi of the middle tile", () => {
    // 4p(50) called with 3p(44) and 0p(52): run 3p-4p-5p is base 7+2 = 9, index 1 -> 28;
    // copies 0,2,0. 28<<10 | 2<<5 | 0x4 | 3 = 28743
    expect(decodeMeld(28743)).toEqual({ type: "chi", from: 3, called: 50, consumed: [44, 52] });
  });

  it("decodes a chi of the highest suit run", () => {
    // 7s(98) called with 8s(103) and 9s(104): run 7s-8s-9s is base 14+6 = 20, index 0 -> 60;
    // copies 2,3,0. 60<<10 | 3<<5 | 2<<3 | 0x4 | 3 = 61559
    expect(decodeMeld(61559)).toEqual({ type: "chi", from: 3, called: 98, consumed: [103, 104] });
  });

  it("decodes a pon", () => {
    // Pon of 5p from across (2): copy 3 (id 55) unused, called index 0 of [52,53,54] -> 0p.
    // (13*3+0)<<9 | 3<<5 | 0x8 | 2 = 20074
    expect(decodeMeld(20074)).toEqual({ type: "pon", from: 2, called: 52, consumed: [53, 54] });
    // Pon of chun from the right (1): copy 0 unused, called index 1 of [133,134,135].
    // (33*3+1)<<9 | 0<<5 | 0x8 | 1 = 51209
    expect(decodeMeld(51209)).toEqual({ type: "pon", from: 1, called: 134, consumed: [133, 135] });
  });

  it("decodes a kakan, including a red five as the added tile", () => {
    // Same layout as the pon above with the kakan flag 0x10: the unused copy 55 is added.
    expect(decodeMeld(20082)).toEqual({
      type: "kakan",
      from: 2,
      called: 52,
      consumed: [53, 54],
      added: 55,
    });
    // Pon of [53,54,55] from the right (1), called index 2 (55), copy 0 (the red 0p) added.
    // (13*3+2)<<9 | 0<<5 | 0x10 | 1 = 21009
    expect(decodeMeld(21009)).toEqual({
      type: "kakan",
      from: 1,
      called: 55,
      consumed: [53, 54],
      added: 52,
    });
  });

  it("decodes a daiminkan", () => {
    // East copy 2 (id 110) called from the right (1): 110<<8 | 1 = 28161
    expect(decodeMeld(28161)).toEqual({
      type: "daiminkan",
      from: 1,
      called: 110,
      consumed: [108, 109, 111],
    });
    // Red 5s (id 88) from across: 88<<8 | 2 = 22530
    expect(decodeMeld(22530)).toEqual({
      type: "daiminkan",
      from: 2,
      called: 88,
      consumed: [89, 90, 91],
    });
  });

  it("decodes an ankan", () => {
    // 9s (ids 104-107): 104<<8 = 26624; relative seat 0 means concealed.
    expect(decodeMeld(26624)).toEqual({ type: "ankan", tiles: [104, 105, 106, 107] });
    // East (108<<8 = 27648) and 5p with the red 0p (52<<8 = 13312). Any copy names the kan.
    expect(decodeMeld(27648)).toEqual({ type: "ankan", tiles: [108, 109, 110, 111] });
    expect(decodeMeld(13312)).toEqual({ type: "ankan", tiles: [52, 53, 54, 55] });
    expect(decodeMeld(13312 | (3 << 8))).toEqual({ type: "ankan", tiles: [52, 53, 54, 55] });
  });

  it("decodes a three-player kita with the id of its North", () => {
    // (id << 8) | 0x20 for the four Norths, ids 120-123.
    expect([30752, 31008, 31264, 31520].map(decodeMeld)).toEqual([
      { type: "nukidora", tile: 120 },
      { type: "nukidora", tile: 121 },
      { type: "nukidora", tile: 122 },
      { type: "nukidora", tile: 123 },
    ]);
    // Pon and kakan are tested first: their bits 5-6 (the copy left out) can have bit 5 set.
    expect(decodeMeld(49769)).toEqual({ type: "pon", from: 1, called: 129, consumed: [128, 130] });
    expect(decodeMeld(0x20)).toBeNull(); // no tile: id 0 is a 1m
    expect(decodeMeld((108 << 8) | 0x20)).toBeNull(); // an East
    expect(decodeMeld(30752 | 1)).toBeNull(); // with a discarder
    // Every real kita has a low byte of exactly 0x20, so bits 6 and 7 must be clear too.
    expect([0x7860, 0x78a0, 0x78e0].map(decodeMeld)).toEqual([null, null, null]);
  });

  it("rejects malformed values", () => {
    expect(decodeMeld(6159 - 3)).toBeNull(); // chi without a discarder
    expect(decodeMeld(20074 - 2)).toBeNull(); // pon without a discarder
    expect(decodeMeld((63 << 10) | 0x4 | 3)).toBeNull(); // chi run index out of range
    expect(decodeMeld(136 << 8)).toBeNull(); // kan of tile id 136
    expect(decodeMeld(-1)).toBeNull();
    expect(decodeMeld(0x10000)).toBeNull();
    expect(decodeMeld(1.5)).toBeNull();
  });
});

describe("parseMjlog: game info", () => {
  it("decodes URL-encoded names, dan labels and ratings", () => {
    const game = parseMjlog(mjlog(GO, UN, init()));
    expect(game.players).toEqual([
      { name: "A", rank: "新人", danIndex: 0, rating: 1500 },
      { name: "あ", rank: "１級", danIndex: 9, rating: 1612.5 },
      { name: "ⓣTest", rank: "初段", danIndex: 10, rating: 1987.4 },
      { name: "%E3", rank: "天鳳位", danIndex: 20, rating: 1800 },
    ]);
  });

  it("leaves out a dan index Tenhou does not have", () => {
    const game = parseMjlog(mjlog(GO, UN.replace('dan="0,9,10,20"', 'dan="21,9,10,20"'), init()));
    expect(game.players[0]).toEqual({ name: "A", rating: 1500 });
  });

  it("ignores reconnect UN tags and BYE", () => {
    const game = parseMjlog(mjlog(GO, UN, init(), '<BYE who="2"/>', '<UN n2="%42"/>'));
    expect(game.players[2]?.name).toBe("ⓣTest");
  });

  it("uses empty names when UN is missing", () => {
    const game = parseMjlog(mjlog(GO, init()));
    expect(game.players).toEqual([{ name: "" }, { name: "" }, { name: "" }, { name: "" }]);
  });

  it("reads the GO type flags", () => {
    const rules = (type: number) => parseMjlog(mjlog(`<GO type="${type}"/>`, init())).rules;
    // 0xA9: phoenix room (0x20|0x80), south (0x08), human players (0x01)
    expect(rules(169)).toEqual({
      redFives: true,
      length: "south",
      room: "phoenix",
      openTanyao: true,
      fast: false,
      description: "鳳南喰赤",
    });
    // 0x29: tokujou room, south
    expect(rules(41)).toEqual({
      redFives: true,
      length: "south",
      room: "special",
      openTanyao: true,
      fast: false,
      description: "特南喰赤",
    });
    // 0x43: general room, east, no red fives (0x02), fast (0x40)
    expect(rules(67)).toEqual({
      redFives: false,
      length: "east",
      room: "general",
      openTanyao: true,
      fast: true,
      description: "般東喰速",
    });
    // 0x85: joukyuu room, east, no open tanyao (0x04)
    expect(rules(133)).toEqual({
      redFives: true,
      length: "east",
      room: "upper",
      openTanyao: false,
      fast: false,
      description: "上東赤",
    });
    // Without GO the length is unknown and red fives are assumed.
    expect(parseMjlog(mjlog(init())).rules).toEqual({ redFives: true });
  });

  it("reads red fives only when the game has them", () => {
    const hand = (go: string) => parseMjlog(mjlog(go, init())).rounds[0]?.hands[0].slice(0, 4);
    expect(hand('<GO type="169"/>')).toEqual(["0m", "0p", "0s", "5m"]);
    expect(hand('<GO type="171"/>')).toEqual(["5m", "5p", "5s", "5m"]);
  });

  it("rejects a seat without a starting hand and a GO and INIT that disagree on the players", () => {
    // A four-player GO with an empty seat 3, and the three-player bit with four hands.
    expect(errorCode(() => parseMjlog(mjlog(GO, sanmaInit())))).toBe("unsupportedPlayers");
    expect(errorCode(() => parseMjlog(mjlog(SANMA_GO, init())))).toBe("unsupportedPlayers");
    const noHand = init().replace(/hai2="[^"]*"/, 'hai2=""');
    expect(errorCode(() => parseMjlog(mjlog(GO, noHand)))).toBe("unsupportedPlayers");
    // Without GO, a seat 3 with no hand but points is not a three-player round either.
    expect(errorCode(() => parseMjlog(mjlog(sanmaInit("0,0,0,1,2,112", "350,350,350,10"))))).toBe(
      "unsupportedPlayers",
    );
  });

  it("reads the round header", () => {
    const game = parseMjlog(mjlog(GO, init("5,2,1,3,4,135", "180,320,250,240", 1)));
    expect(game.rounds).toHaveLength(1);
    const { events, hands, ...round } = game.rounds[0] as Round;
    expect(round).toEqual({
      wind: 1,
      number: 2,
      dealer: 1,
      honba: 2,
      riichiSticks: 1,
      scores: [18000, 32000, 25000, 24000],
      doraIndicators: ["7z"],
    });
    expect(hands?.[1]).toEqual([
      "1m",
      "2m",
      "3m",
      "4m",
      "6m",
      "7m",
      "8m",
      "9m",
      "1p",
      "2p",
      "3p",
      "4p",
      "6p",
    ]);
    expect(events).toEqual([]);
  });

  it("is found by the format loader", () => {
    expect(parseLogText(`\n${mjlog(GO, init())}`).format).toBe("mjlog");
  });

  it("reports malformed logs as invalid", () => {
    const cases = [
      "<mjlog/>",
      '<mjloggm ver="2.3"><GO type="169"/></mjloggm>',
      mjlog(GO, "<T12/>", init()),
      mjlog(GO, init().replace('"16,', '"136,')),
      mjlog(GO, init().replace('"16,', '"')),
      mjlog(GO, init("0,0,0"), "<T12/>"),
      mjlog(GO, init("16,0,0,1,2,124")),
      mjlog(GO, init(), '<N who="1" m="6156"/>'),
      mjlog(GO, init(), '<N who="4" m="26624"/>'),
      mjlog(GO, init(), '<REACH who="0" step="3"/>'),
      mjlog(GO, init(), "<T136/>"),
      mjlog(GO, init(), '<RYUUKYOKU sc="250,0"/>'),
      mjlog(GO, init(), '<RYUUKYOKU sc="250,0,250,0,250,0,250,0"/>', "<T60/>"),
      `${mjlog(GO, init())}<T60`,
    ];
    for (const text of cases) {
      expect(
        errorCode(() => parseMjlog(text)),
        text,
      ).toBe("invalid");
    }
  });
});

describe("parseMjlog: events", () => {
  it("reads draws, discards and tsumogiri", () => {
    expect(eventsOf("<T60/>", "<D60/>", "<U61/>", "<E1/>")).toEqual([
      { type: "draw", seat: 0, tile: "7p" },
      { type: "discard", seat: 0, tile: "7p", tsumogiri: true, riichi: false },
      { type: "draw", seat: 1, tile: "7p" },
      { type: "discard", seat: 1, tile: "1m", tsumogiri: false, riichi: false },
    ]);
  });

  it("marks the riichi discard and the accepted stick", () => {
    const events = eventsOf(
      "<T60/>",
      '<REACH who="0" step="1"/>',
      "<D60/>",
      '<REACH who="0" ten="240,250,250,250" step="2"/>',
      "<U61/>",
      "<E61/>",
    );
    expect(events.slice(1, 4)).toEqual([
      { type: "discard", seat: 0, tile: "7p", tsumogiri: true, riichi: true },
      { type: "riichiAccepted", seat: 0 },
      { type: "draw", seat: 1, tile: "7p" },
    ]);
    expect(events[4]).toMatchObject({ type: "discard", riichi: false });
  });

  it("keeps riichiAccepted right after the declaration even when logged later", () => {
    const events = eventsOf(
      "<T60/>",
      '<REACH who="0" step="1"/>',
      "<D60/>",
      "<U61/>",
      '<REACH who="0" step="2"/>',
    );
    expect(events.map((event) => event.type)).toEqual([
      "draw",
      "discard",
      "riichiAccepted",
      "draw",
    ]);
  });

  it("reads calls with absolute seats and exact copies", () => {
    // Seat 0 discards 0p (52); seat 1 pons it from the left (relative 3) with 53 and 54:
    // (13*3+0)<<9 | 3<<5 | 0x8 | 3 = 20075.
    const events = eventsOf("<T60/>", "<D52/>", '<N who="1" m="20075"/>', "<E5/>");
    expect(events.slice(2)).toEqual([
      { type: "pon", seat: 1, from: 0, tile: "0p", consumed: ["5p", "5p"] },
      { type: "discard", seat: 1, tile: "2m", tsumogiri: false, riichi: false },
    ]);
  });

  it("does not mark the first discard after a call as tsumogiri", () => {
    // Seat 1 draws 61 and keeps it, chis seat 0's 4p (50) with 44 and 52, then discards 61.
    const events = eventsOf(
      "<T60/>",
      "<D60/>",
      "<U61/>",
      "<E1/>",
      "<V62/>",
      "<F62/>",
      "<W63/>",
      "<G63/>",
      "<T50/>",
      "<D50/>",
      '<N who="1" m="28743"/>',
      "<E61/>",
    );
    expect(events.slice(-2)).toEqual([
      { type: "chi", seat: 1, from: 0, tile: "4p", consumed: ["3p", "0p"] },
      { type: "discard", seat: 1, tile: "7p", tsumogiri: false, riichi: false },
    ]);
  });

  it("reads ankan, kakan, daiminkan and kan dora in source order", () => {
    const events = eventsOf(
      '<N who="0" m="26624"/>',
      '<DORA hai="3"/>',
      "<T64/>",
      "<D64/>",
      '<N who="1" m="21009"/>',
      "<U65/>",
      '<DORA hai="88"/>',
      "<E65/>",
      '<N who="3" m="28161"/>',
    );
    expect(events).toEqual([
      { type: "ankan", seat: 0, tiles: ["9s", "9s", "9s", "9s"] },
      { type: "dora", indicator: "1m" },
      { type: "draw", seat: 0, tile: "8p" },
      { type: "discard", seat: 0, tile: "8p", tsumogiri: true, riichi: false },
      { type: "kakan", seat: 1, tile: "0p" },
      { type: "draw", seat: 1, tile: "8p" },
      { type: "dora", indicator: "0s" },
      { type: "discard", seat: 1, tile: "8p", tsumogiri: true, riichi: false },
      { type: "daiminkan", seat: 3, from: 0, tile: "1z", consumed: ["1z", "1z", "1z"] },
    ]);
  });

  it("rejects nukidora in a four-player game", () => {
    expect(errorCode(() => eventsOf('<N who="0" m="32"/>'))).toBe("invalid");
    expect(errorCode(() => eventsOf("<T120/>", '<N who="0" m="30752" />'))).toBe("invalid");
  });
});

describe("parseMjlog: three-player games", () => {
  it("reads GO bit 0x10, UN and INIT with seat 3 as the empty chair", () => {
    const game = parseMjlog(mjlog(SANMA_GO, SANMA_UN, '<TAIKYOKU oya="0"/>', sanmaInit()));
    expect(game.playerCount).toBe(3);
    // UN's fourth dan 0 and rate 1500.00 belong to nobody.
    expect(game.players).toStrictEqual([
      { name: "A", rank: "七段", danIndex: 16, rating: 2000.5 },
      { name: "B", rank: "四段", danIndex: 13, rating: 1800 },
      { name: "C", rank: "新人", danIndex: 0, rating: 1500 },
      { name: "" },
    ]);
    // The player count is not a rule: only the description shows it.
    expect(game.rules).toStrictEqual({
      redFives: true,
      length: "south",
      room: "phoenix",
      openTanyao: true,
      fast: false,
      description: "三鳳南喰赤",
    });
    const { events, hands, ...round } = game.rounds[0] as Round;
    expect(round).toEqual({
      wind: 0,
      number: 1,
      dealer: 0,
      honba: 0,
      riichiSticks: 0,
      scores: [35000, 35000, 35000, 0],
      doraIndicators: ["2z"],
    });
    expect(hands).toEqual([
      tiles("1m999m1230p789p1z4z"),
      tiles("1m9p1230s789s4z556z"),
      tiles("1m23456p23456s1z7z"),
      [],
    ]);
    expect(events).toEqual([]);
  });

  it("reads the other GO bits of a three-player game", () => {
    // 0x53: general room, east, no red fives (0x02), three players (0x10), fast (0x40).
    expect(parseMjlog(mjlog('<GO type="83"/>', sanmaInit())).rules).toStrictEqual({
      redFives: false,
      length: "east",
      room: "general",
      openTanyao: true,
      fast: true,
      description: "三般東喰速",
    });
  });

  it("reads a three-player round without GO from the empty seat 3 of INIT", () => {
    const game = parseMjlog(mjlog(sanmaInit()));
    expect(game.playerCount).toBe(3);
    expect(game.rules).toStrictEqual({ redFives: true });
    expect(game.players).toStrictEqual([{ name: "" }, { name: "" }, { name: "" }, { name: "" }]);
  });

  it("numbers rounds wind * 4 + dealer, without a fourth dealer", () => {
    const header = (seed: string, oya: number) => {
      const round = parseMjlog(mjlog(SANMA_GO, sanmaInit(seed, undefined, oya))).rounds[0];
      return [round?.wind, round?.number, round?.dealer];
    };
    expect(header("2,0,0,1,2,112", 2)).toEqual([0, 3, 2]); // East 3
    expect(header("4,0,0,1,2,112", 0)).toEqual([1, 1, 0]); // South 1
    expect(header("6,0,0,1,2,112", 2)).toEqual([1, 3, 2]); // South 3
    expect(header("8,0,0,1,2,112", 0)).toEqual([2, 1, 0]); // West 1
    for (const seed of ["3,0,0,1,2,112", "7,0,0,1,2,112"]) {
      expect(errorCode(() => parseMjlog(mjlog(SANMA_GO, sanmaInit(seed))))).toBe("invalid");
    }
  });

  it("reads a kita of the drawn North or one from the hand, each before a replacement draw", () => {
    const events = sanmaEventsOf(
      "<T122/>",
      '<N who="0" m="31264" />',
      "<T73/>",
      '<N who="0" m="30752" />',
      "<T74/>",
      "<D74/>",
      "<U123/>",
      '<N who="1" m="31520" />',
      "<U75/>",
      "<E1/>",
    );
    expect(events).toEqual([
      { type: "draw", seat: 0, tile: "4z" },
      { type: "kita", seat: 0, tile: "4z" },
      { type: "draw", seat: 0, tile: "1s" },
      { type: "kita", seat: 0, tile: "4z" },
      { type: "draw", seat: 0, tile: "1s" },
      { type: "discard", seat: 0, tile: "1s", tsumogiri: true, riichi: false },
      { type: "draw", seat: 1, tile: "4z" },
      { type: "kita", seat: 1, tile: "4z" },
      { type: "draw", seat: 1, tile: "1s" },
      { type: "discard", seat: 1, tile: "1m", tsumogiri: false, riichi: false },
    ]);
  });

  it("rejects a kita code of another tile", () => {
    // (110 << 8) | 0x20: an East.
    expect(errorCode(() => sanmaEventsOf("<T110/>", '<N who="0" m="28192" />'))).toBe("invalid");
  });

  it("reads the discarder of a call relative to the caller mod 4, never the empty seat 3", () => {
    // Pon of 6z (ids 128-130, copy 3 left out, called index 1): (32*3+1)<<9 | 3<<5 | 0x8 = 49768,
    // plus the relative seat. The empty seat 3 sits between seat 2 and seat 0.
    const call = (who: Seat, relative: number) =>
      sanmaEventsOf(`<N who="${who}" m="${49768 + relative}" />`)[0];
    const from = (who: Seat, relative: number) => (call(who, relative) as CallEvent).from;
    expect([from(0, 1), from(0, 2), from(1, 1), from(1, 3), from(2, 2), from(2, 3)]).toEqual([
      1, 2, 2, 0, 0, 1,
    ]);
    for (const [who, relative] of [
      [0, 3],
      [1, 2],
      [2, 1],
    ] as const) {
      expect(errorCode(() => call(who, relative))).toBe("invalid");
    }
  });

  it("keeps kan dora where Tenhou writes them: ankan, DORA, draw and kakan, draw, DORA", () => {
    // Seat 1 pons seat 2's 5z (126): (31*3+2)<<9 | 3<<5 | 0x8 | 1 = 48745; the kakan of 127 is
    // the same with 0x10 instead of 0x8.
    const events = sanmaEventsOf(
      "<T35/>",
      '<N who="0" m="8192" />',
      '<DORA hai="113" />',
      "<T73/>",
      "<D73/>",
      "<U129/>",
      "<E129/>",
      "<V126/>",
      "<F126/>",
      '<N who="1" m="48745" />',
      "<E1/>",
      "<V130/>",
      "<F130/>",
      "<T131/>",
      "<D131/>",
      "<U127/>",
      '<N who="1" m="48753" />',
      "<U74/>",
      '<DORA hai="114" />',
      "<E74/>",
    );
    expect(events.map((event) => event.type)).toEqual([
      "draw",
      "ankan",
      "dora",
      "draw",
      "discard",
      "draw",
      "discard",
      "draw",
      "discard",
      "pon",
      "discard",
      "draw",
      "discard",
      "draw",
      "discard",
      "draw",
      "kakan",
      "draw",
      "dora",
      "discard",
    ]);
    expect(events[1]).toEqual({ type: "ankan", seat: 0, tiles: ["9m", "9m", "9m", "9m"] });
    expect(events[9]).toEqual({
      type: "pon",
      seat: 1,
      from: 2,
      tile: "5z",
      consumed: ["5z", "5z"],
    });
    expect(events[16]).toEqual({ type: "kakan", seat: 1, tile: "5z" });
  });

  it("reads a ron on a kita North", () => {
    const events = sanmaEventsOf(
      "<T122/>",
      '<N who="0" m="31264" />',
      '<AGARI ba="0,0" hai="1,69,72,76,80,88,96,100,104,121,122,124,125,128" machi="122" ten="40,2600,0" yaku="52,1" doraHai="112" who="1" fromWho="0" sc="350,-26,350,26,350,0,0,0" />',
    );
    expect(events.slice(1)).toEqual([
      { type: "kita", seat: 0, tile: "4z" },
      expect.objectContaining({
        type: "win",
        seat: 1,
        from: 0,
        tile: "4z",
        deltas: [-2600, 2600, 0, 0],
      }),
    ]);
  });

  it("reads a win after a kita: AGARI m lists the kita, hai leaves it out, ドラ counts it", () => {
    // Dealer tsumo on the replacement draw: tsumo, rinshan, dora 1 (the kita; the indicator 2z
    // points to 3z) and the red 0p. Tsumo loss: each of the two others pays 3900.
    const events = sanmaEventsOf(
      "<T122/>",
      '<N who="0" m="31264" />',
      "<T61/>",
      '<AGARI ba="0,0" hai="0,32,33,34,36,40,44,52,60,61,64,68,108,120" m="31264" machi="61" ten="30,7800,0" yaku="0,1,4,1,52,1,54,1" doraHai="112" who="0" fromWho="0" sc="350,78,350,-39,350,-39,0,0" />',
    );
    expect(events.at(-1)).toEqual({
      type: "win",
      seat: 0,
      from: 0,
      deltas: [7800, -3900, -3900, 0],
      tile: "7p",
      hand: tiles("1m999m1230p7789p1z4z"),
      han: 4,
      fu: 30,
      points: 7800,
      yaku: [
        { key: "menzenTsumo", han: 1 },
        { key: "rinshanKaihou", han: 1 },
        { key: "dora", han: 1 },
        { key: "akaDora", han: 1 },
      ],
    });
  });

  it("reads sc and owari with the empty seat 3 and an exhaustive draw's tenpai hands", () => {
    const game = parseMjlog(
      mjlog(
        SANMA_GO,
        sanmaInit(),
        `<RYUUKYOKU ba="0,0" sc="350,20,350,-10,350,-10,0,0" hai0="${SANMA_HANDS[0]}" owari="370,32.0,340,-6.0,340,-26.0,0,0.0" />`,
      ),
    );
    expect(game.rounds[0]?.events).toEqual([
      {
        type: "ryukyoku",
        reason: "exhaustive",
        deltas: [2000, -1000, -1000, 0],
        tenpai: [0],
        hands: [tiles("1m999m1230p789p1z4z"), null, null, null],
      },
    ]);
    expect(game.finalScores).toEqual([37000, 34000, 34000, 0]);
  });

  it("reads kyuushu kyuuhai with the declarer's hand", () => {
    const events = sanmaEventsOf(
      "<T110/>",
      `<RYUUKYOKU type="yao9" ba="0,0" sc="350,0,350,0,350,0,0,0" hai0="${SANMA_HANDS[0]},110" />`,
    );
    expect(events.at(-1)).toEqual({
      type: "ryukyoku",
      reason: "kyuushuKyuuhai",
      deltas: [0, 0, 0, 0],
      hands: [tiles("1m999m1230p789p1z4z1z"), null, null, null],
    });
  });

  it("rejects anything the empty seat 3 has, does or scores", () => {
    const agari = (attributes: string) =>
      `<AGARI ba="0,0" hai="${SANMA_HANDS[1]},129" machi="129" ten="30,1000,0" yaku="52,1" doraHai="112" ${attributes} sc="350,-10,350,10,350,0,0,0" />`;
    const cases = [
      mjlog(SANMA_GO, sanmaInit(undefined, "350,350,350,10")),
      mjlog(SANMA_GO, sanmaInit(undefined, undefined, 3)),
      mjlog(SANMA_GO, sanmaInit(), "<W40/>"),
      mjlog(SANMA_GO, sanmaInit(), "<G40/>"),
      mjlog(SANMA_GO, sanmaInit(), '<N who="3" m="49769" />'),
      mjlog(SANMA_GO, sanmaInit(), '<REACH who="3" step="1"/>'),
      mjlog(SANMA_GO, sanmaInit(), "<T129/>", "<D129/>", agari('who="3" fromWho="0"')),
      mjlog(SANMA_GO, sanmaInit(), "<T129/>", "<D129/>", agari('who="1" fromWho="3"')),
      mjlog(SANMA_GO, sanmaInit(), "<T129/>", "<D129/>", agari('who="1" fromWho="0" paoWho="3"')),
      mjlog(SANMA_GO, sanmaInit(), '<RYUUKYOKU ba="0,0" sc="350,0,350,0,350,0,0,10" />'),
      mjlog(
        SANMA_GO,
        sanmaInit(),
        `<RYUUKYOKU ba="0,0" sc="350,0,350,0,350,0,0,0" hai3="${SANMA_HANDS[2]}" />`,
      ),
      mjlog(
        SANMA_GO,
        sanmaInit(),
        '<RYUUKYOKU ba="0,0" sc="350,0,350,0,350,0,0,0" owari="350,15.0,350,5.0,349,-20.1,1,0.1" />',
      ),
    ];
    for (const text of cases) {
      expect(
        errorCode(() => parseMjlog(text)),
        text,
      ).toBe("invalid");
    }
    const dealtSeat3 = sanmaInit().replace('hai3=""', `hai3="${SANMA_HANDS[2]}"`);
    expect(errorCode(() => parseMjlog(mjlog(SANMA_GO, dealtSeat3)))).toBe("unsupportedPlayers");
  });
});

describe("parseMjlog: results", () => {
  const AGARI =
    '<AGARI ba="1,1" hai="0,4,8,12,16,20,24,28,32,36,40,44,48,52" machi="52" ten="40,8000,1" yaku="1,1,2,1,52,2,53,0" doraHai="124" doraHaiUra="60" who="1" fromWho="0" sc="250,-83,240,93,250,0,260,-10"/>';

  it("reads a ron with yaku, limit, ura and deltas from sc, dropping 0-han yaku", () => {
    const events = eventsOf("<T60/>", "<D52/>", AGARI);
    expect(events[2]).toEqual({
      type: "win",
      seat: 1,
      from: 0,
      deltas: [-8300, 9300, 0, -1000],
      tile: "0p",
      hand: ["1m", "2m", "3m", "4m", "0m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "0p"],
      uraIndicators: ["7p"],
      han: 4,
      fu: 40,
      limit: "mangan",
      points: 8000,
      yaku: [
        { key: "riichi", han: 1 },
        { key: "ippatsu", han: 1 },
        { key: "dora", han: 2 },
      ],
    });
  });

  it("maps every limit value", () => {
    const limit = (value: number) =>
      (eventsOf(AGARI.replace('ten="40,8000,1"', `ten="30,1000,${value}"`))[0] as WinEvent).limit;
    expect([0, 1, 2, 3, 4, 5].map(limit)).toEqual([
      undefined,
      "mangan",
      "haneman",
      "baiman",
      "sanbaiman",
      "yakuman",
    ]);
    expect(errorCode(() => limit(6))).toBe("invalid");
  });

  it("rejects negative yaku han", () => {
    expect(errorCode(() => eventsOf(AGARI.replace('yaku="1,1,', 'yaku="1,-1,')))).toBe("invalid");
  });

  it("reads yakuman, pao and unknown yaku ids", () => {
    const win = eventsOf(
      '<AGARI ba="0,0" hai="124,125,126,128,129,130,132,133,134,108,109,110,112,113" machi="113" ten="40,64000,5" yakuman="39,42" doraHai="1" who="1" fromWho="3" paoWho="2" sc="250,0,250,640,250,-320,250,-320"/>',
    )[0] as WinEvent;
    expect(win.yaku).toEqual([
      { key: "daisangen", han: 13, yakuman: true },
      { key: "tsuuiisou", han: 13, yakuman: true },
    ]);
    expect(win).toMatchObject({ han: 26, limit: "yakuman", points: 64000, pao: 2 });
    expect(win.uraIndicators).toBeUndefined();

    const odd = eventsOf(
      AGARI.replace('yaku="1,1,2,1,52,2,53,0"', 'yaku="60,1"').replace(' doraHaiUra="60"', ""),
    )[0] as WinEvent;
    expect(odd.yaku).toEqual([{ key: null, raw: "Tenhou yaku #60", han: 1 }]);
    expect(odd.uraIndicators).toBeUndefined();
    expect(odd.pao).toBeUndefined();
  });

  it("reads consecutive AGARI as multiple ron", () => {
    const second = AGARI.replace('who="1"', 'who="2"');
    const events = eventsOf("<T60/>", "<D52/>", AGARI, second);
    expect(events.map((event) => event.type)).toEqual(["draw", "discard", "win", "win"]);
    expect(errorCode(() => eventsOf(AGARI, '<RYUUKYOKU sc="250,0,250,0,250,0,250,0"/>'))).toBe(
      "invalid",
    );
  });

  it("reads an exhaustive draw with the tenpai hands", () => {
    const events = eventsOf(
      '<RYUUKYOKU ba="0,0" sc="250,-15,250,15,250,-15,250,15" hai1="1,5,9,13,21,25,29,33,37,40,44,48,56" hai3="3,7,11,15,23,27,31,35,39,42,46,50,58"/>',
    );
    expect(events).toEqual([
      {
        type: "ryukyoku",
        reason: "exhaustive",
        deltas: [-1500, 1500, -1500, 1500],
        tenpai: [1, 3],
        hands: [
          null,
          ["1m", "2m", "3m", "4m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "6p"],
          null,
          ["1m", "2m", "3m", "4m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "6p"],
        ],
      },
    ]);
  });

  it("maps abortive draw types", () => {
    const reason = (type: string) =>
      eventsOf(`<RYUUKYOKU type="${type}" sc="250,0,250,0,250,0,250,0"/>`)[0];
    expect(reason("yao9")).toEqual({
      type: "ryukyoku",
      reason: "kyuushuKyuuhai",
      deltas: [0, 0, 0, 0],
      hands: [null, null, null, null],
    });
    expect(
      ["reach4", "ron3", "kan4", "kaze4", "nm", "other"].map(
        (type) => (reason(type) as { reason: string }).reason,
      ),
    ).toEqual([
      "suuchaRiichi",
      "sanchaHou",
      "suukaikan",
      "suufonRenda",
      "nagashiMangan",
      "unknown",
    ]);
    expect(reason("constructor")).toMatchObject({ reason: "unknown" });
    expect(reason("nm")).toMatchObject({ tenpai: [] });
  });

  it("reads the final scores from owari", () => {
    const game = parseMjlog(
      mjlog(
        GO,
        init(),
        '<RYUUKYOKU sc="250,0,250,0,250,0,250,0" owari="300,40.0,250,10.0,250,-10.0,200,-40.0"/>',
      ),
    );
    expect(game.finalScores).toEqual([30000, 25000, 25000, 20000]);
    expect(parseMjlog(mjlog(GO, init())).finalScores).toBeUndefined();
  });
});

describe("parseMjlog: special cases of whole games", () => {
  it("reads a riichi declaration ronned on its tile, which places no stick", () => {
    const events = eventsOf(
      "<T60/>",
      "<D60/>",
      "<U61/>",
      '<REACH who="1" step="1"/>',
      "<E61/>",
      '<AGARI ba="0,0" hai="2,6,10,14,22,26,30,34,38,41,45,49,57,61" machi="61" ten="30,2000,0" yaku="8,1,52,1" doraHai="124" who="2" fromWho="1" sc="250,0,250,-20,250,20,250,0"/>',
    );
    expect(events.slice(-2)).toEqual([
      { type: "discard", seat: 1, tile: "7p", tsumogiri: true, riichi: true },
      expect.objectContaining({ type: "win", seat: 2, from: 1, tile: "7p" }),
    ]);
    expect(events.some((event) => event.type === "riichiAccepted")).toBe(false);
  });

  it("reads kakan followed by a chankan ron", () => {
    // Seat 3 pons seat 0's 2z (id 114), later adds 115; seat 1 robs it.
    const events = eventsOf(
      "<T114/>",
      "<D114/>",
      '<N who="3" m="44137" />',
      "<G132/>",
      "<T64/>",
      "<D64/>",
      "<W115/>",
      '<N who="3" m="44145" />',
      '<AGARI ba="0,0" hai="1,5,9,13,21,25,29,33,37,40,44,48,56,115" machi="115" ten="30,1000,0" yaku="3,1" doraHai="124" who="1" fromWho="3" sc="250,0,250,10,250,0,250,-10" />',
    );
    expect(events.slice(-2)).toEqual([
      { type: "kakan", seat: 3, tile: "2z" },
      expect.objectContaining({ type: "win", seat: 1, from: 3, tile: "2z" }),
    ]);
    expect((events.at(-1) as WinEvent).yaku).toEqual([{ key: "chankan", han: 1 }]);
  });

  it("reads the game a tenhou.net/6 fixture becomes, header included", () => {
    const game = parseMjlog(encodedFixture("ranked_game"));
    expect(game.format).toBe("mjlog");
    expect(game.id).toBeUndefined();
    expect(game.players.map((player) => [player.rank, player.danIndex])).toEqual([
      ["四段", 13],
      ["四段", 13],
      ["九段", 18],
      ["四段", 13],
    ]);
    expect(game.rules).toEqual({
      redFives: true,
      length: "south",
      room: "special",
      openTanyao: true,
      fast: false,
      description: "特南喰赤",
    });
    expect(game.rounds).toHaveLength(3);
    expect(game.finalScores).toEqual([21100, 55000, -4900, 28800]);
  });
});

describe("parseMjlog on truncated and garbled logs", () => {
  // parseOutcome fails the test on anything thrown that is not a LogParseError.
  const SOURCES: Record<string, () => string> = {
    ranked_game: () => encodedFixture("ranked_game"),
    double_ron: () => encodedFixture("double_ron"),
    four_reach: () => encodedFixture("four_reach"),
    suukantsu_1: () => encodedFixture("suukantsu_1"),
    // Three players: kita, a pon across the empty chair, ankan, a ron on a kita.
    sanma: () => toMjlogXml(makeSanmaGame([sampleSanmaRound()])),
  };

  it.each(Object.keys(SOURCES))(
    "answers every truncation of %s as mjlog with a game or a LogParseError",
    (name) => {
      const text = (SOURCES[name] as () => string)();
      const outcomes = new Set<string>();
      for (const at of cutPoints(text.length, 200)) {
        const cut = text.slice(0, at);
        outcomes.add(parseOutcome(parseMjlog, cut));
        // Cut back to the last complete tag, the truncated log reaches the round parser.
        outcomes.add(parseOutcome(parseMjlog, cut.slice(0, cut.lastIndexOf(">") + 1)));
      }
      expect(outcomes).toContain("game");
      expect(outcomes).toContain("invalid");
    },
  );

  it.each(Object.keys(SOURCES))(
    "answers every garbled %s as mjlog with a game or a LogParseError",
    (name) => {
      const outcomes = new Set<string>();
      const text = (SOURCES[name] as () => string)();
      for (const input of garbled(text, '0123456789-,."<>/= TUDENxyz', 300)) {
        outcomes.add(parseOutcome(parseMjlog, input));
      }
      expect(outcomes).toContain("game");
      expect(outcomes).toContain("invalid");
    },
  );
});

/** Attributes of every tag with the given name, read with a plain regex independent of readTags. */
function rawTags(text: string, name: string): Map<string, string>[] {
  const pattern = new RegExp(`<${name}\\s([^>]*)>`, "g");
  return [...text.matchAll(pattern)].map(
    (match) =>
      new Map(
        [...(match[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1] ?? "", a[2] ?? ""]),
      ),
  );
}

function numbers(value: string | undefined): number[] {
  return value ? value.split(",").map(Number) : [];
}

/** How many tiles of a list are dora, counting a tile once per indicator that points to it. */
function doraCount(
  tiles: readonly Tile[],
  indicators: readonly KnownTile[],
  game: GameLog,
): number {
  return indicators.reduce((sum, indicator) => {
    const dora = doraFromIndicator(indicator, game.playerCount);
    return sum + tiles.filter((tile) => isSameKind(tile, dora)).length;
  }, 0);
}

/**
 * Replays the parsed game with a minimal hand tracker and compares it with Tenhou's own data in
 * the raw XML: score snapshots in sc, revealed hands, dora indicators and ドラ han (which includes
 * three-player kita), the length of exhausted walls and the next round's scores.
 * Returns a list of problems (empty when everything matches).
 */
function verifyAgainstSource(text: string, game: GameLog): string[] {
  const problems: string[] = [];
  const chunks = text.split("<INIT ").slice(1);
  if (chunks.length !== game.rounds.length) {
    return [`${chunks.length} INIT tags but ${game.rounds.length} rounds`];
  }
  game.rounds.forEach((round, roundIndex) => {
    const chunk = chunks[roundIndex] as string;
    const report = (eventIndex: number, message: string) =>
      problems.push(`round ${roundIndex} event ${eventIndex}: ${message}`);
    const count = (type: RoundEvent["type"][]) =>
      round.events.filter((event) => type.includes(event.type)).length;
    const counts: Array<[string, number, number]> = [
      ["draws", count(["draw"]), (chunk.match(/<[TUVW]\d+\/>/g) ?? []).length],
      ["discards", count(["discard"]), (chunk.match(/<[DEFG]\d+\/>/g) ?? []).length],
      [
        "melds and kita",
        count(["chi", "pon", "daiminkan", "ankan", "kakan", "kita"]),
        rawTags(chunk, "N").length,
      ],
      ["dora", count(["dora"]), rawTags(chunk, "DORA").length],
      [
        "riichi declarations",
        round.events.filter((event) => event.type === "discard" && event.riichi).length,
        (chunk.match(/<REACH [^>]*step="1"/g) ?? []).length,
      ],
      [
        "riichi sticks",
        count(["riichiAccepted"]),
        (chunk.match(/<REACH [^>]*step="2"/g) ?? []).length,
      ],
      ["wins", count(["win"]), rawTags(chunk, "AGARI").length],
      ["draws at end", count(["ryukyoku"]), rawTags(chunk, "RYUUKYOKU").length],
    ];
    for (const [label, parsed, raw] of counts) {
      if (parsed !== raw) {
        report(-1, `${parsed} ${label} parsed, ${raw} in the source`);
      }
    }
    // Replacement draws after kans and kita come out of the live wall too.
    const end = round.events.at(-1);
    const exhausted =
      end?.type === "ryukyoku" && (end.reason === "exhaustive" || end.reason === "nagashiMangan");
    if (exhausted && count(["draw"]) !== LIVE_WALL_SIZE[game.playerCount]) {
      report(-1, `the wall ran out after ${count(["draw"])} draws`);
    }

    const results = [...rawTags(chunk, "AGARI"), ...rawTags(chunk, "RYUUKYOKU")];
    const hands = round.hands.map((hand) => [...hand]);
    const pons: Tile[][] = [[], [], [], []];
    const meldCount = [0, 0, 0, 0];
    /** Tiles of each seat's melds, and the North tiles each seat set aside. */
    const meldTiles: Tile[][] = [[], [], [], []];
    const kita: Tile[][] = [[], [], [], []];
    const indicators = [...round.doraIndicators];
    const scores = [...round.scores];
    let sticks = round.riichiSticks;
    let resultIndex = 0;
    let won = false;
    const take = (seat: Seat, tile: Tile, index: number) => {
      const hand = hands[seat] as Tile[];
      const at = hand.indexOf(tile);
      if (at < 0) {
        report(index, `seat ${seat} does not hold ${tile}`);
      } else {
        hand.splice(at, 1);
      }
    };
    const checkScores = (raw: Map<string, string>, index: number) => {
      const sc = numbers(raw.get("sc"));
      const before = [0, 1, 2, 3].map((seat) => (sc[seat * 2] ?? Number.NaN) * 100);
      if (before.join() !== scores.join()) {
        report(index, `sc before ${before} but replay has ${scores}`);
      }
    };

    round.events.forEach((event, index) => {
      switch (event.type) {
        case "draw":
          hands[event.seat]?.push(event.tile);
          break;
        case "discard":
          take(event.seat, event.tile, index);
          if ((hands[event.seat]?.length ?? 0) + 3 * (meldCount[event.seat] ?? 0) !== 13) {
            report(index, `seat ${event.seat} has a wrong tile count after discarding`);
          }
          if (event.riichi) {
            const next = round.events[index + 1];
            const accepted = next?.type === "riichiAccepted" && next.seat === event.seat;
            if (!accepted && next?.type !== "win") {
              report(index, "riichi discard is followed by neither riichiAccepted nor a ron");
            }
          }
          break;
        case "chi":
        case "pon":
        case "daiminkan": {
          const previous = round.events
            .slice(0, index)
            .findLast((e) => e.type !== "riichiAccepted");
          if (
            previous?.type !== "discard" ||
            previous.seat !== event.from ||
            previous.tile !== event.tile
          ) {
            report(index, `${event.type} of ${event.tile} does not match the last discard`);
          }
          for (const tile of event.consumed) {
            take(event.seat, tile, index);
          }
          if (event.type === "pon") {
            pons[event.seat]?.push(event.tile);
          }
          meldTiles[event.seat]?.push(event.tile, ...event.consumed);
          meldCount[event.seat] = (meldCount[event.seat] ?? 0) + 1;
          break;
        }
        case "ankan":
          for (const tile of event.tiles) {
            take(event.seat, tile, index);
          }
          meldTiles[event.seat]?.push(...event.tiles);
          meldCount[event.seat] = (meldCount[event.seat] ?? 0) + 1;
          break;
        case "kakan":
          take(event.seat, event.tile, index);
          if (!pons[event.seat]?.some((tile) => isSameKind(tile, event.tile))) {
            report(index, `kakan of ${event.tile} without a pon`);
          }
          meldTiles[event.seat]?.push(event.tile);
          break;
        case "kita": {
          // Set aside right after the seat's own draw; the seat then draws again (or is ronned).
          // The dora of a kakan just before can be revealed in between.
          const previous = round.events[index - 1];
          if (previous?.type !== "draw" || previous.seat !== event.seat) {
            report(index, "kita does not follow the seat's draw");
          }
          const next = round.events.slice(index + 1).find((e) => e.type !== "dora");
          const replaced = next?.type === "draw" && next.seat === event.seat;
          if (!replaced && next?.type !== "win") {
            report(index, "kita is followed by neither a replacement draw nor a ron");
          }
          take(event.seat, event.tile, index);
          kita[event.seat]?.push(event.tile);
          break;
        }
        case "riichiAccepted": {
          const previous = round.events[index - 1];
          if (previous?.type !== "discard" || !previous.riichi || previous.seat !== event.seat) {
            report(index, "riichiAccepted does not follow the seat's riichi discard");
          }
          scores[event.seat] = (scores[event.seat] as number) - 1000;
          sticks += 1;
          break;
        }
        case "dora":
          indicators.push(event.indicator);
          break;
        case "win": {
          const raw = results[resultIndex++];
          if (!raw) {
            break;
          }
          checkScores(raw, index);
          const expected = [...(hands[event.seat] as Tile[])];
          if (event.from !== event.seat && event.tile) {
            expected.push(event.tile);
            const previous = round.events.slice(0, index).findLast((e) => e.type !== "win");
            const dealtIn =
              (previous?.type === "discard" ||
                previous?.type === "kakan" ||
                previous?.type === "kita") &&
              previous.seat === event.from &&
              isSameKind(previous.tile, event.tile);
            if (!dealtIn) {
              report(index, `ron on ${event.tile} does not follow a discard, kakan or kita of it`);
            }
          }
          if (sortTiles(expected).join() !== sortTiles(event.hand ?? []).join()) {
            report(index, `AGARI hai ${event.hand} but replay has ${expected}`);
          }
          if (numbers(raw.get("doraHai")).length !== indicators.length) {
            report(
              index,
              `AGARI doraHai ${raw.get("doraHai")} but ${indicators.length} indicators revealed`,
            );
          }
          // Tenhou counts each kita North as one dora, plus once per indicator pointing to North.
          if (event.limit !== "yakuman") {
            const seatKita = kita[event.seat] ?? [];
            const dora =
              doraCount(
                [...(event.hand ?? []), ...(meldTiles[event.seat] ?? [])],
                indicators,
                game,
              ) +
              seatKita.length +
              doraCount(seatKita, indicators, game);
            const listed = event.yaku?.find((entry) => entry.key === "dora")?.han ?? 0;
            if (listed !== dora) {
              report(index, `ドラ ${listed} but the hand and kita have ${dora} dora`);
            }
          }
          event.deltas.forEach((delta, seat) => {
            scores[seat] = (scores[seat] as number) + delta;
          });
          won = true;
          break;
        }
        case "ryukyoku": {
          const raw = results[resultIndex++];
          if (raw) {
            checkScores(raw, index);
          }
          event.hands?.forEach((shown, seat) => {
            if (shown && sortTiles(shown).join() !== sortTiles(hands[seat] ?? []).join()) {
              report(index, `RYUUKYOKU hai${seat} ${shown} but replay has ${hands[seat]}`);
            }
          });
          event.deltas.forEach((delta, seat) => {
            scores[seat] = (scores[seat] as number) + delta;
          });
          break;
        }
      }
    });

    const next = game.rounds[roundIndex + 1];
    if (next) {
      if (next.scores.join() !== scores.join()) {
        problems.push(
          `round ${roundIndex + 1} starts with ${next.scores} but replay has ${scores}`,
        );
      }
      const nextSticks = won ? 0 : sticks;
      if (next.riichiSticks !== nextSticks) {
        problems.push(
          `round ${roundIndex + 1} has ${next.riichiSticks} sticks, expected ${nextSticks}`,
        );
      }
    } else if (game.finalScores) {
      // Tenhou gives the deposits left on the table to the top player at the end.
      const leftover = won ? 0 : sticks * 1000;
      const gains = game.finalScores.map((score, seat) => score - (scores[seat] as number));
      const top = scores.indexOf(Math.max(...scores));
      const expected = scores.map((score, seat) => score + (seat === top ? leftover : 0));
      if (game.finalScores.join() !== expected.join()) {
        problems.push(`final scores ${game.finalScores} but replay has ${scores} (gains ${gains})`);
      }
    }
  });
  return problems;
}

/** Tags of an mjlog the model keeps something of: no closing tags, SHUFFLE, BYE or reconnect UN. */
function comparableTags(text: string): MjlogTag[] {
  let listed = false;
  return (readTags(text) ?? []).filter((tag) => {
    if (tag.closing || tag.name === "SHUFFLE" || tag.name === "BYE") {
      return false;
    }
    if (tag.name === "UN") {
      if (listed) {
        return false;
      }
      listed = true;
    }
    return true;
  });
}

/**
 * An attribute as far as the model determines it, or null when the model keeps nothing of it.
 * Tile ids become tiles, as the model does not know which copy a tile is (toMjlogXml hands out
 * the lowest free copy); melds are decoded to tiles; the hands of AGARI and RYUUKYOKU are sorted;
 * UN sx (Tenhou's player sex) and the dice in INIT seed are dropped; owari keeps the points, not
 * the uma toMjlogXml derives from them (Tenhou rounded older games' uma differently).
 */
function modelValue(tagName: string, key: string, value: string, redFives: boolean): string | null {
  const tile = (id: string) => tileFromId(Number(id), redFives);
  const tileList = (list: string) => (list === "" ? [] : list.split(",").map(tile));
  const meld = (m: string) => {
    const decoded = decodeMeld(Number(m));
    if (!decoded) {
      return `invalid ${m}`;
    }
    if (decoded.type === "nukidora") {
      return `kita ${tile(String(decoded.tile))}`;
    }
    if (decoded.type === "ankan") {
      return `ankan ${decoded.tiles.map((id) => tile(String(id)))}`;
    }
    const called = tile(String(decoded.called));
    const consumed = decoded.consumed.map((id) => tile(String(id)));
    const added = decoded.type === "kakan" ? ` added ${tile(String(decoded.added))}` : "";
    return `${decoded.type} from ${decoded.from} ${called} with ${consumed}${added}`;
  };
  if (tagName === "UN" && key === "sx") {
    return null;
  }
  if (tagName === "INIT" && key === "seed") {
    const seed = value.split(",");
    return `${seed.slice(0, 3)} dora ${tile(seed[5] ?? "")}`;
  }
  if (tagName === "INIT" && /^hai\d$/.test(key)) {
    return tileList(value).join();
  }
  if ((tagName === "AGARI" || tagName === "RYUUKYOKU") && (key === "hai" || /^hai\d$/.test(key))) {
    return sortTiles(tileList(value)).join();
  }
  if (["machi", "doraHai", "doraHaiUra"].includes(key) || (tagName === "DORA" && key === "hai")) {
    return tileList(value).join();
  }
  if (key === "m" && (tagName === "N" || tagName === "AGARI")) {
    return value.split(",").map(meld).join(" | ");
  }
  if (key === "owari") {
    return value
      .split(",")
      .filter((_, i) => i % 2 === 0)
      .join();
  }
  return value;
}

/**
 * Compares toMjlogXml's output tag by tag with the source it parsed, as far as the model determines
 * the source (see modelValue); attributes must come in the same order. Returns the differences.
 */
function compareWithSource(source: string, encoded: string, redFives: boolean): string[] {
  const differences: string[] = [];
  const name = (tag: MjlogTag) => {
    const tileTag = /^([TUVWDEFG])(\d+)$/.exec(tag.name);
    return tileTag ? `${tileTag[1]}${tileFromId(Number(tileTag[2]), redFives)}` : tag.name;
  };
  const expected = comparableTags(source);
  const actual = comparableTags(encoded);
  if (expected.length !== actual.length) {
    differences.push(`${expected.length} tags in the source, ${actual.length} written`);
  }
  expected.forEach((tag, index) => {
    const written = actual[index];
    if (!written || name(written) !== name(tag)) {
      differences.push(`tag ${index}: <${name(tag)}> in the source, <${written && name(written)}>`);
      return;
    }
    const keys = (attrs: Map<string, string>) =>
      [...attrs].filter(([key, value]) => modelValue(tag.name, key, value, redFives) !== null);
    const sourceKeys = keys(tag.attrs).map(([key]) => key);
    const writtenKeys = keys(written.attrs).map(([key]) => key);
    if (sourceKeys.join() !== writtenKeys.join()) {
      differences.push(
        `tag ${index} <${tag.name}>: attributes ${sourceKeys}, written ${writtenKeys}`,
      );
      return;
    }
    for (const key of sourceKeys) {
      const want = modelValue(tag.name, key, tag.attrs.get(key) as string, redFives);
      const got = modelValue(tag.name, key, written.attrs.get(key) as string, redFives);
      if (want !== got) {
        differences.push(`tag ${index} <${tag.name}> ${key}: ${want} in the source, ${got}`);
      }
    }
  });
  return differences;
}

// The encoder derives sc, AGARI and RYUUKYOKU hands and doraHai from its own tile tracking; the
// parsed events must replay to the same values.
describe("parseMjlog: encoded games agree with their own sc, hands and dora", () => {
  it.each(ENCODED_FIXTURES)("%s", (name) => {
    const text = encodedFixture(name);
    expect(verifyAgainstSource(text, parseMjlog(text))).toEqual([]);
  });
});

/**
 * Real games kept outside the repository: set MJLOG_CORPUS_DIR (any games) or
 * SANMA_MJLOG_CORPUS_DIR (three-player games) to one or more folders of mjlog XML files.
 */
function describeCorpus(variable: string, playerCount?: PlayerCount): void {
  const files = corpusFiles(variable, ".xml");
  describe.skipIf(files.length === 0)(`parseMjlog: corpus in ${variable}`, () => {
    if (playerCount !== undefined) {
      it.each(files)(`%s is a ${playerCount}-player game`, (_, path) => {
        expect(parseMjlog(readFileSync(path, "utf-8")).playerCount).toBe(playerCount);
      });
    }

    it.each(files)("%s matches Tenhou's own data", (_, path) => {
      const text = readFileSync(path, "utf-8");
      expect(verifyAgainstSource(text, parseMjlog(text))).toEqual([]);
    });

    it.each(files)("%s passes checkGame", (_, path) => {
      expect(checkGame(parseMjlog(readFileSync(path, "utf-8")))).toEqual([]);
    });

    // Everything a parsed mjlog holds is something the encoder writes back unchanged.
    it.each(files)("%s comes back unchanged from toMjlogXml", (_, path) => {
      const game = parseMjlog(readFileSync(path, "utf-8"));
      expect(stripMjlogUnsupported(game)).toStrictEqual(game);
      expect(parseMjlog(toMjlogXml(game))).toStrictEqual(game);
    });

    // And the encoder writes Tenhou's own tags for it.
    it.each(files)("%s is written back tag for tag by toMjlogXml", (_, path) => {
      const text = readFileSync(path, "utf-8");
      const game = parseMjlog(text);
      expect(compareWithSource(text, toMjlogXml(game), game.rules.redFives)).toEqual([]);
    });
  });
}

describeCorpus(MJLOG_CORPUS);
describeCorpus(SANMA_MJLOG_CORPUS, 3);
