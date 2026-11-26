/**
 * The test-only mjlog encoder (src/test/mjlog-serialize.ts) and the mjlog parser checked against
 * each other: parseMjlog(toMjlogXml(game)) must give back stripMjlogUnsupported(game) for hand-built
 * games and for the tenhou.net/6 fixtures, and the encoder must write Tenhou's exact tags.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  GameLog,
  PlayerInfo,
  Quad,
  Round,
  RoundEvent,
  Seat,
  WinEvent,
} from "../../core/model";
import { sortTiles, type Tile } from "../../core/tile";
import { checkGame } from "../../replay/check";
import { stripMjlogUnsupported, tenhouUma, toMjlogXml } from "../../test/mjlog-serialize";
import {
  ankan,
  chi,
  daiminkan,
  discard,
  dora,
  draw,
  kakan,
  kita,
  makeGame,
  makeRound,
  makeSanmaGame,
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
} from "../../test/round-builder";
import { parseTenhouJson } from "../tenhou-json/parse";
import { decodeMeld, tileFromId } from "./meld";
import { parseMjlog } from "./parse";
import { readTags } from "./tags";

function roundTrip(game: GameLog): GameLog {
  return parseMjlog(toMjlogXml(game));
}

/** The `m` of every N tag, in order. */
function meldValues(xml: string): number[] {
  return (readTags(xml) ?? [])
    .filter((tag) => tag.name === "N")
    .map((tag) => Number(tag.attrs.get("m")));
}

function attribute(xml: string, tagName: string, name: string, nth = 0): string | undefined {
  return (readTags(xml) ?? []).filter((tag) => tag.name === tagName)[nth]?.attrs.get(name);
}

/** Points after a round: start scores, riichi deposits and result deltas. */
function endScores(round: Round): Quad<number> {
  const scores = [...round.scores] as Quad<number>;
  for (const event of round.events) {
    if (event.type === "riichiAccepted") {
      scores[event.seat] -= 1000;
    } else if (event.type === "win" || event.type === "ryukyoku") {
      event.deltas.forEach((delta, seat) => {
        scores[seat as Seat] += delta;
      });
    }
  }
  return scores;
}

/*
 * Ids the encoder hands out for makeRound's default deal (seat 0 1112345678999m, seat 1 the same in
 * pin, seat 2 in sou, seat 3 1122334455667z, dora indicator 1z), lowest free copy first and copy 0 of
 * a five kept for the red five:
 *   seat 0: 1m 0,1,2  2m 4  3m 8  4m 12  5m 17  6m 20  7m 24  8m 28  9m 32,33,34
 *   seat 1: 1p 36,37,38  2p 40  3p 44  4p 48  5p 53  6p 56  7p 60  8p 64  9p 68,69,70
 *   seat 2: 1s 72,73,74  2s 76  3s 80  4s 84  5s 89  6s 92  7s 96  8s 100  9s 104,105,106
 *   seat 3: 1z 108,109  2z 112,113  3z 116,117  4z 120,121  5z 124,125  6z 128,129  7z 132
 *   dora indicator 1z: 110
 */
describe("toMjlogXml: meld bits", () => {
  const melds = (events: RoundEvent[], round: Partial<Round> = {}) =>
    meldValues(toMjlogXml(makeGame([makeRound({ ...round, events })])));

  it("encodes a pon from each seat and the kakan that upgrades it", () => {
    // Seat 3 pons the 2z (id 114, its own are 112 and 113): kind 28, called index 2 of
    // [112,113,114], copy 3 left out, pon flag 0x8, then the discarder relative to seat 3.
    // (28*3+2)<<9 | 3<<5 | 0x8 = 44136. The kakan adds 115 (copy 3): 0x10 instead of 0x8 = 44144.
    const ponAndKakan = (from: Seat): RoundEvent[] => [
      draw(from, "2z"),
      tsumogiri(from, "2z"),
      pon(3, from, "2z", "22z"),
      discard(3, "7z"),
      draw(3, "2z"),
      kakan(3, "2z"),
      draw(3, "9m"),
      tsumogiri(3, "9m"),
    ];
    expect(melds(ponAndKakan(0))).toEqual([44137, 44145]); // from the right: relative 1
    expect(melds(ponAndKakan(1))).toEqual([44138, 44146]); // across: relative 2
    expect(melds(ponAndKakan(2))).toEqual([44139, 44147]); // from the left: relative 3
    expect(decodeMeld(44138)).toEqual({ type: "pon", from: 2, called: 114, consumed: [112, 113] });
    expect(decodeMeld(44147)).toEqual({
      type: "kakan",
      from: 3,
      called: 114,
      consumed: [112, 113],
      added: 115,
    });
  });

  it("encodes a daiminkan from each seat", () => {
    // Seat 0 holds 9m 32,33,34 and calls the fourth (35): 35<<8 | relative.
    const kan = (from: Seat): RoundEvent[] => [
      draw(from, "9m"),
      tsumogiri(from, "9m"),
      daiminkan(0, from, "9m", "999m"),
      draw(0, "5z"),
      dora("3z"),
      tsumogiri(0, "5z"),
    ];
    expect(melds(kan(1))).toEqual([8961]);
    expect(melds(kan(2))).toEqual([8962]);
    expect(melds(kan(3))).toEqual([8963]);
    expect(decodeMeld(8962)).toEqual({
      type: "daiminkan",
      from: 2,
      called: 35,
      consumed: [32, 33, 34],
    });
  });

  it("encodes a chi of each tile of the run, with the copies of all three tiles", () => {
    // Seat 1 chis the 4p seat 0 drew (id 49) from the left (relative 3), with the chi flag 0x4.
    // Bits 10-15 are run * 3 + the called tile's index in the run (runs of pin start at 7); bits
    // 3-4, 5-6 and 7-8 the copies of the run's tiles.
    const chiOf = (consumed: string) =>
      melds([draw(0, "4p"), tsumogiri(0, "4p"), chi(1, 0, "4p", consumed), discard(1, "9p")]);
    // 2p(40) 3p(44) 4p(49): run 8, index 2, copies 0,0,1: 26<<10 | 1<<7 | 0x4 | 3
    expect(chiOf("23p")).toEqual([26759]);
    // 3p(44) 4p(49) 5p(53): run 9, index 1, copies 0,1,1: 28<<10 | 1<<7 | 1<<5 | 0x4 | 3
    expect(chiOf("35p")).toEqual([28839]);
    // 4p(49) 5p(53) 6p(56): run 10, index 0, copies 1,1,0: 30<<10 | 1<<5 | 1<<3 | 0x4 | 3
    expect(chiOf("56p")).toEqual([30767]);
    expect(decodeMeld(28839)).toEqual({ type: "chi", from: 3, called: 49, consumed: [44, 53] });
  });

  it("gives a red five copy 0", () => {
    // 0p is id 52: 4p(48) 0p(52) 6p(56) is run 10, index 1, copies 0,0,0: 31<<10 | 0x4 | 3.
    const events = [draw(0, "0p"), tsumogiri(0, "0p"), chi(1, 0, "0p", "46p"), discard(1, "9p")];
    expect(melds(events)).toEqual([31751]);
    const game = makeGame([makeRound({ events })]);
    expect(roundTrip(game).rounds[0]?.events[2]).toEqual(chi(1, 0, "0p", "46p"));
  });

  it("encodes an ankan with its first copy", () => {
    // 9m: 32<<8. A red five ankan: 0m is id 16, so 16<<8.
    expect(melds([draw(0, "9m"), ankan(0, "9999m"), draw(0, "5z"), tsumogiri(0, "5z")])).toEqual([
      8192,
    ]);
    const hands = makeRound().hands;
    hands[0] = tiles("0555m123456789p");
    const redKan = [draw(0, "5z"), ankan(0, "0555m"), draw(0, "6z"), tsumogiri(0, "6z")];
    expect(melds(redKan, { hands })).toEqual([4096]);
    expect(decodeMeld(4096)).toEqual({ type: "ankan", tiles: [16, 17, 18, 19] });
  });

  it("uses all four copies of a five as plain fives without red fives", () => {
    // Without red fives the first 5m is id 16; seat 0 holds 16, 17 and 18 and calls 19.
    const hands = makeRound().hands;
    hands[0] = tiles("555m123456789p1z");
    const events = [draw(1, "5m"), tsumogiri(1, "5m"), daiminkan(0, 1, "5m", "555m")];
    const game = makeGame([makeRound({ hands, events })], { rules: { redFives: false } });
    const xml = toMjlogXml(game);
    expect(meldValues(xml)).toEqual([(19 << 8) | 1]);
    expect(roundTrip(game).rounds[0]?.events.at(-1)).toEqual(daiminkan(0, 1, "5m", "555m"));
  });
});

describe("toMjlogXml: tags", () => {
  // Seat 3 (1122334455667z, waiting on 7z) declares riichi and rons seat 0's 7z.
  const riichiRon: GameLog = makeGame(
    [
      makeRound({
        events: [
          draw(0, "5s"),
          tsumogiri(0, "5s"),
          draw(1, "6s"),
          tsumogiri(1, "6s"),
          draw(2, "7s"),
          tsumogiri(2, "7s"),
          draw(3, "8s"),
          discard(3, "8s", { tsumogiri: true, riichi: true }),
          riichiAccepted(3),
          draw(0, "7z"),
          tsumogiri(0, "7z"),
          win(3, 0, [-3200, 0, 0, 4200], {
            tile: "7z",
            hand: tiles("11223344556677z"),
            han: 3,
            fu: 25,
            points: 3200,
            yaku: [
              { key: "riichi", han: 1 },
              { key: "chiitoitsu", han: 2 },
            ],
            uraIndicators: ["9p"],
          }),
        ],
      }),
    ],
    { finalScores: [21800, 25000, 25000, 28200] },
  );

  it("writes Tenhou's tags, attribute order and spacing", () => {
    expect(toMjlogXml(riichiRon)).toBe(
      [
        '<mjloggm ver="2.3">',
        '<GO type="1" lobby="0"/>',
        '<UN n0="%41" n1="%42" n2="%43" n3="%44" sx="M,M,M,M"/>',
        '<TAIKYOKU oya="0"/>',
        '<INIT seed="0,0,0,0,0,110" ten="250,250,250,250" oya="0" hai0="0,1,2,4,8,12,17,20,24,28,32,33,34" hai1="36,37,38,40,44,48,53,56,60,64,68,69,70" hai2="72,73,74,76,80,84,89,92,96,100,104,105,106" hai3="108,109,112,113,116,117,120,121,124,125,128,129,132"/>',
        // 5s: 89 is dealt, so the plain copies left are 90, 91; 6s, 7s and 8s likewise.
        "<T90/><D90/><U93/><E93/><V97/><F97/><W101/>",
        '<REACH who="3" step="1"/><G101/><REACH who="3" ten="250,250,250,240" step="2"/>',
        "<T133/><D133/>",
        // Ura dora 0 han after the yaku of a riichi win; the ura indicator 9p is the free copy 71.
        '<AGARI ba="0,1" hai="108,109,112,113,116,117,120,121,124,125,128,129,132,133" machi="133" ten="25,3200,0" yaku="1,1,22,2,53,0" doraHai="110" doraHaiUra="71" who="3" fromWho="0" sc="250,-32,250,0,250,0,240,42" owari="218,-28.2,250,5.0,250,-15.0,282,38.2" />',
        "</mjloggm>",
      ].join(""),
    );
    expect(roundTrip(riichiRon)).toStrictEqual(stripMjlogUnsupported(riichiRon));
  });

  it("writes the GO type of the rules", () => {
    const go = (rules: GameLog["rules"]) =>
      attribute(toMjlogXml(makeGame([makeRound()], { rules })), "GO", "type");
    const phoenix = {
      redFives: true,
      length: "south",
      room: "phoenix",
      openTanyao: true,
      fast: false,
    } as const;
    expect(go(phoenix)).toBe("169"); // 0x01 | 0x20 | 0x80 | 0x08
    expect(go({ ...phoenix, room: "special" })).toBe("41"); // 0x01 | 0x20 | 0x08
    expect(go({ ...phoenix, room: "upper", length: "east", openTanyao: false })).toBe("133"); // 0x01 | 0x80 | 0x04
    expect(go({ redFives: false, length: "east", room: "general", fast: true })).toBe("67"); // 0x01 | 0x02 | 0x40
    expect(go({ redFives: true })).toBe("1");
  });

  it("URL-encodes names byte by byte and writes dan, rate and sx", () => {
    const players: Quad<PlayerInfo> = [
      { name: "A", rank: "新人", danIndex: 0, rating: 1500 },
      { name: "あ", rank: "１級", danIndex: 9, rating: 1612.5 },
      { name: 'x&"<>', rank: "初段", danIndex: 10, rating: 1987.4 },
      { name: "", rank: "天鳳位", danIndex: 20, rating: 1800.25 },
    ];
    const game = makeGame([makeRound()], { players });
    const un = (readTags(toMjlogXml(game)) ?? []).find((tag) => tag.name === "UN");
    expect(Object.fromEntries(un?.attrs ?? [])).toEqual({
      n0: "%41",
      n1: "%E3%81%82",
      n2: "%78%26%22%3C%3E",
      n3: "",
      dan: "0,9,10,20",
      rate: "1500.00,1612.50,1987.40,1800.25",
      sx: "M,M,M,M",
    });
    expect(roundTrip(game).players).toEqual(players);
  });

  it("writes the round, honba, deposits and dealer in INIT", () => {
    const round = makeRound({ wind: 1, number: 2, dealer: 1, honba: 2, riichiSticks: 1 });
    round.scores = [18000, 32000, 25000, 24000];
    const xml = toMjlogXml(makeGame([round]));
    expect(attribute(xml, "INIT", "seed")).toBe("5,2,1,0,0,110");
    expect(attribute(xml, "INIT", "ten")).toBe("180,320,250,240");
    expect(attribute(xml, "INIT", "oya")).toBe("1");
  });

  it("lists the winner's melds newest first", () => {
    // Seat 3 pons 2z from seat 0 (44137), then 3z (id 118) from seat 1: kind 29, index 2,
    // copy 3 left out, across: (29*3+2)<<9 | 3<<5 | 0x8 | 2 = 45674. Then it wins by tsumo.
    const events = [
      draw(0, "2z"),
      tsumogiri(0, "2z"),
      pon(3, 0, "2z", "22z"),
      discard(3, "1z"),
      draw(1, "3z"),
      tsumogiri(1, "3z"),
      pon(3, 1, "3z", "33z"),
      discard(3, "1z"),
      draw(3, "7z"),
      win(3, 3, [-1000, -1000, -2000, 4000], {
        han: 2,
        fu: 40,
        points: 4000,
        yaku: [{ key: "toitoi", han: 2 }],
      }),
    ];
    const game = makeGame([makeRound({ events })]);
    const xml = toMjlogXml(game);
    expect(attribute(xml, "AGARI", "m")).toBe("45674,44137");
    expect(attribute(xml, "AGARI", "machi")).toBe("133");
    expect(attribute(xml, "AGARI", "hai")).toBe("120,121,124,125,128,129,132,133");
    expect(roundTrip(game)).toStrictEqual(stripMjlogUnsupported(game));
  });

  it("gives the deposits of a double ron to the first winner only", () => {
    const first = win(1, 0, [-4200, 6200, 0, 0], {
      fu: 30,
      points: 3900,
      yaku: [{ key: "riichi", han: 1 }],
    });
    const second = win(2, 0, [-2000, 0, 2000, 0], {
      fu: 30,
      points: 2000,
      yaku: [{ key: "chun", han: 1 }],
    });
    const round = wallRound({
      seed: 3,
      honba: 1,
      riichiSticks: 1,
      draws: 9,
      riichiAt: [5],
      results: [first, second],
    });
    const xml = toMjlogXml(makeGame([round]));
    expect(attribute(xml, "AGARI", "ba", 0)).toBe("1,2");
    expect(attribute(xml, "AGARI", "ba", 1)).toBe("1,0");
    // The second AGARI starts from the scores after the first.
    expect(attribute(xml, "AGARI", "sc", 1)).toBe("208,-20,302,0,250,20,250,0");
  });

  it("writes every ryuukyoku type and the hands Tenhou shows", () => {
    const tag = (round: Round) => {
      const xml = toMjlogXml(makeGame([round]));
      return (readTags(xml) ?? []).find((t) => t.name === "RYUUKYOKU")?.attrs ?? new Map();
    };
    const exhaustive = wallRound({
      seed: 4,
      draws: 70,
      results: [ryukyoku("exhaustive", [-1500, 1500, -1500, 1500], { tenpai: [1, 3] })],
    });
    const attrs = tag(exhaustive);
    expect(attrs.has("type")).toBe(false);
    expect(attrs.get("sc")).toBe("250,-15,250,15,250,-15,250,15");
    expect([0, 1, 2, 3].map((seat) => attrs.has(`hai${seat}`))).toEqual([false, true, false, true]);
    const shown = (attrs.get("hai1") as string)
      .split(",")
      .map((id) => tileFromId(Number(id), true));
    expect(shown).toEqual(sortTiles(exhaustive.hands[1]));

    const kyuushu = wallRound({
      seed: 5,
      dealer: 2,
      draws: 1,
      keepLastDraw: true,
      results: [ryukyoku("kyuushuKyuuhai")],
    });
    const declared = tag(kyuushu);
    expect(declared.get("type")).toBe("yao9");
    expect(declared.get("hai2")?.split(",")).toHaveLength(14);

    const types = (
      ["nagashiMangan", "suufonRenda", "suuchaRiichi", "suukaikan", "sanchaHou"] as const
    ).map((reason) =>
      tag(wallRound({ seed: 6, draws: 4, results: [ryukyoku(reason)] })).get("type"),
    );
    expect(types).toEqual(["nm", "kaze4", "reach4", "kan4", "ron3"]);
  });

  it("writes Tenhou's uma in owari", () => {
    expect(tenhouUma([32400, 18700, 25100, 23800])).toEqual(["42.4", "-31.3", "5.1", "-16.2"]);
    // Equal points rank by seat.
    expect(tenhouUma([25000, 25000, 25000, 25000])).toEqual(["35.0", "5.0", "-15.0", "-25.0"]);
  });
});

describe("toMjlogXml: what mjlog cannot express", () => {
  const base = () => makeRound({ events: [draw(0, "5z"), tsumogiri(0, "5z")] });
  const throws = (round: Round, message: RegExp, extra: Partial<GameLog> = {}) =>
    expect(() => toMjlogXml(makeGame([round], extra))).toThrow(message);

  it("rejects unknown tiles and impossible tile counts", () => {
    throws(makeRound({ events: [draw(0, "?")] }), /unknown tile of seat 0's draw/);
    throws(
      makeRound({ events: [draw(0, "1m"), tsumogiri(0, "1m"), draw(1, "1m")] }),
      /no 1m is left/,
    );
    throws(
      makeRound({ events: [draw(0, "0m"), tsumogiri(0, "0m")] }),
      /red five in a game without/,
      {
        rules: { redFives: false },
      },
    );
    throws(makeRound({ doraIndicators: ["1z", "2z"] }), /one dora indicator/);
  });

  it("rejects events the replay contradicts", () => {
    throws(makeRound({ events: [draw(0, "5z"), tsumogiri(0, "6z")] }), /not the tile just drawn/);
    throws(
      makeRound({ events: [draw(0, "5z"), discard(0, "5z")] }),
      /no 5z for a discard from the hand/,
    );
    throws(makeRound({ events: [pon(3, 0, "2z", "22z")] }), /does not follow a discard/);
    throws(makeRound({ events: [draw(3, "6z"), kakan(3, "6z")] }), /without a pon/);
  });

  it("rejects wins and draws it has no attributes for", () => {
    const ending = (event: RoundEvent) => {
      const round = base();
      round.events.push(event);
      return round;
    };
    throws(ending(win(1, 0, [-1000, 1000, 0, 0])), /points of every win/);
    throws(ending(win(1, 0, [-1000, 1000, 0, 0], { points: 1000 })), /fu of a win below mangan/);
    throws(ending(win(1, 0, [-1000, 1000, 0, 0], { points: 1000, fu: 30 })), /yaku of every win/);
    const yakuhai = { points: 1000, fu: 30, yaku: [{ key: "yakuhai" as const, han: 1 }] };
    throws(ending(win(1, 0, [-1000, 1000, 0, 0], yakuhai)), /no yaku id for yakuhai/);
    const unknownYaku = { points: 1000, fu: 30, yaku: [{ key: null, raw: "?", han: 1 }] };
    throws(ending(win(1, 0, [-1000, 1000, 0, 0], unknownYaku)), /no yaku id for \?/);
    const double = {
      points: 64000,
      limit: "yakuman" as const,
      yaku: [{ key: "suuankou" as const, han: 26, yakuman: true }],
    };
    throws(ending(win(1, 0, [-64000, 64000, 0, 0], double)), /counts each yakuman once/);
    throws(ending(ryukyoku("unknown")), /unknown reason/);
    throws(ending(ryukyoku("suufonRenda", [-50, 50, 0, 0])), /not a whole number of hundreds/);
  });
});

/** The hand-built games below as one hanchan. */
function buildHanchan(): GameLog {
  const rounds: Round[] = [];
  const next = (build: (scores: Quad<number>) => Round) => {
    const previous = rounds.at(-1);
    rounds.push(build(previous ? endScores(previous) : [25000, 25000, 25000, 25000]));
  };
  // East 1: chi with a red five, pon, riichi, daiminkan with kan dora, kakan, ankan, ron with ura.
  next(() => {
    const round = sampleRound();
    const ron = round.events.at(-1) as WinEvent;
    ron.yaku = [
      { key: "riichi", han: 1 },
      { key: "hatsu", han: 1 },
      { key: "uraDora", han: 2 },
    ];
    return round;
  });
  // East 1, 1 honba: exhaustive draw; the tenpai hands come from the replay.
  next((scores) =>
    wallRound({
      seed: 2,
      honba: 1,
      scores,
      draws: 70,
      results: [ryukyoku("exhaustive", [-1500, 1500, -1500, 1500], { tenpai: [1, 3] })],
    }),
  );
  // East 2: kyuushu kyuuhai.
  next((scores) =>
    wallRound({
      seed: 3,
      dealer: 1,
      honba: 2,
      scores,
      draws: 1,
      keepLastDraw: true,
      results: [ryukyoku("kyuushuKyuuhai")],
    }),
  );
  // East 3: double ron on the dealer's discard; the riichi winner has ura dora. Neither win names
  // its tile or hand, which come from the replay.
  next((scores) =>
    wallRound({
      seed: 4,
      dealer: 2,
      honba: 3,
      scores,
      draws: 9,
      riichiAt: [6],
      results: [
        win(0, 2, [5800, 0, -4800, 0], {
          fu: 40,
          points: 3900,
          yaku: [
            { key: "riichi", han: 1 },
            { key: "ippatsu", han: 1 },
          ],
          uraIndicators: [wallDraw(82, 4)],
        }),
        win(1, 2, [0, 2000, -2000, 0], { fu: 30, points: 2000, yaku: [{ key: "tanyao", han: 1 }] }),
      ],
    }),
  );
  // East 4: four riichi.
  next((scores) =>
    wallRound({
      seed: 5,
      dealer: 3,
      scores,
      draws: 4,
      riichiAt: [0, 1, 2, 3],
      results: [ryukyoku("suuchaRiichi")],
    }),
  );
  // South 1 to 3: triple ron, four winds, nagashi mangan by the dealer.
  next((scores) =>
    wallRound({
      seed: 6,
      wind: 1,
      honba: 1,
      riichiSticks: 4,
      scores,
      draws: 5,
      results: [ryukyoku("sanchaHou")],
    }),
  );
  next((scores) =>
    wallRound({
      seed: 7,
      wind: 1,
      dealer: 1,
      honba: 2,
      riichiSticks: 4,
      scores,
      draws: 4,
      results: [ryukyoku("suufonRenda")],
    }),
  );
  next((scores) =>
    wallRound({
      seed: 8,
      wind: 1,
      dealer: 2,
      honba: 3,
      riichiSticks: 4,
      scores,
      draws: 70,
      results: [ryukyoku("nagashiMangan", [-4000, -4000, 12000, -4000], { tenpai: [2] })],
    }),
  );
  // South 4: a yakuman tsumo with a liable player (pao) paying for it; it takes the deposits.
  next((scores) =>
    wallRound({
      seed: 9,
      wind: 1,
      dealer: 3,
      honba: 4,
      riichiSticks: 4,
      scores,
      draws: 3,
      keepLastDraw: true,
      results: [
        win(1, 1, [0, 37200, -33200, 0], {
          limit: "yakuman",
          points: 32000,
          yaku: [{ key: "daisangen", han: 13, yakuman: true }],
          pao: 2,
        }),
      ],
    }),
  );
  return makeGame(rounds, {
    format: "mjlog",
    players: [
      { name: "A", rank: "七段", danIndex: 16, rating: 2201.5 },
      { name: "B", rank: "八段", danIndex: 17, rating: 2150 },
      { name: "C", rank: "天鳳位", danIndex: 20, rating: 2400.75 },
      { name: "D", rank: "新人", danIndex: 0, rating: 1500 },
    ],
    rules: {
      redFives: true,
      length: "south",
      room: "phoenix",
      openTanyao: true,
      fast: false,
      description: "鳳南喰赤",
    },
    finalScores: endScores(rounds.at(-1) as Round),
  });
}

describe("parseMjlog(toMjlogXml(game)) on hand-built games", () => {
  const hanchan = buildHanchan();

  it("builds a consistent hanchan", () => {
    expect(checkGame(hanchan)).toEqual([]);
  });

  it("gives back the hanchan, which has nothing mjlog cannot carry but derived fields", () => {
    const back = roundTrip(hanchan);
    expect(back).toStrictEqual(stripMjlogUnsupported(hanchan));
    expect(checkGame(back)).toEqual([]);
    // The double ron's tiles and hands came from the replay.
    const [first, second] = (back.rounds[3]?.events ?? []).slice(-2) as [WinEvent, WinEvent];
    expect(first.hand).toHaveLength(14);
    expect(second.tile).toBe(first.tile);
    expect(first.uraIndicators).toEqual([wallDraw(82, 4)]);
  });

  it("keeps the deal order and the exact riichi, kan and dora order", () => {
    const back = roundTrip(hanchan);
    hanchan.rounds.forEach((round, index) => {
      expect(back.rounds[index]?.hands).toEqual(round.hands);
      expect(back.rounds[index]?.events.map((event) => event.type)).toEqual(
        round.events.map((event) => event.type),
      );
    });
  });

  it("reads games without red fives and with every rule flag", () => {
    const hands = makeRound().hands;
    hands[0] = tiles("555m123456789p1z");
    const round = makeRound({
      hands,
      events: [
        draw(0, "6z"),
        tsumogiri(0, "6z"),
        draw(1, "5m"),
        tsumogiri(1, "5m"),
        daiminkan(0, 1, "5m", "555m"),
        draw(0, "7z"),
      ],
    });
    const rules = {
      redFives: false,
      length: "east",
      room: "upper",
      openTanyao: false,
      fast: true,
    } as const;
    const game = makeGame([round], { rules });
    expect(roundTrip(game)).toStrictEqual(stripMjlogUnsupported(game));
    expect(roundTrip(game).rules).toEqual({ ...rules, description: "上東速" });
  });

  it("drops or restates exactly what mjlog cannot carry", () => {
    const lossy: GameLog = makeGame(
      [
        makeRound({
          events: [
            draw(0, "4p"),
            discard(0, "4p", { tsumogiri: true, riichi: true }),
            dora("2z"),
            riichiAccepted(0),
            chi(1, 0, "4p", "53p"),
            discard(1, "1p"),
            draw(2, "1p"),
            win(2, 2, [-4000, -2000, 8000, -2000], {
              tile: "1p",
              hand: tiles("1p1112345678999s").reverse(),
              han: 99,
              limit: "mangan",
              points: 8000,
              yaku: [{ key: "menzenTsumo", raw: "門前清自摸和", han: 1 }],
              uraIndicators: [],
              pao: 2,
            }),
          ],
        }),
        makeRound({
          events: [
            draw(0, "5z"),
            tsumogiri(0, "5z"),
            ryukyoku("suufonRenda", [0, 0, 0, 0], { tenpai: [1] }),
          ],
        }),
        makeRound(),
      ],
      {
        id: "a-log-id",
        players: [
          { name: "A", rank: "雀豪★1" },
          { name: "B", rank: "四段", danIndex: 13, rating: 1500.125 },
          { name: "C" },
          { name: "D" },
        ],
        rules: { redFives: true, length: "south", description: "Gold Room South" },
        finalScores: [25000, 25000, 25000, 25000],
      },
    );
    const back = roundTrip(lossy);
    expect(back).toStrictEqual(stripMjlogUnsupported(lossy));
    expect(back.format).toBe("mjlog");
    expect(back).not.toHaveProperty("id");
    expect(back.rules).toEqual({
      redFives: true,
      length: "south",
      room: "general",
      openTanyao: true,
      fast: false,
      description: "般南喰赤",
    });
    expect(back.players).toEqual([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]);
    expect(back.rounds[0]?.events.slice(1, 5).map((event) => event.type)).toEqual([
      "discard",
      "riichiAccepted",
      "dora",
      "chi",
    ]);
    expect(back.rounds[0]?.events[4]).toEqual(chi(1, 0, "4p", "35p"));
    expect(back.rounds[0]?.events.at(-1)).toEqual({
      type: "win",
      seat: 2,
      from: 2,
      deltas: [-4000, -2000, 8000, -2000],
      tile: "1p",
      hand: tiles("1p1112345678999s"),
      han: 1,
      fu: 0,
      limit: "mangan",
      points: 8000,
      yaku: [{ key: "menzenTsumo", han: 1 }],
    });
    expect(back.rounds[1]?.events.at(-1)).toEqual({
      type: "ryukyoku",
      reason: "suufonRenda",
      deltas: [0, 0, 0, 0],
      hands: [null, null, null, null],
    });
    expect(back).not.toHaveProperty("finalScores");
  });
});

/*
 * Three-player games. Ids the encoder hands out for makeSanmaRound's default deal (seat 0
 * 1112345678999p, seat 1 the same in sou, seat 2 1199m112233556z, seat 3 nothing):
 *   seat 0: 1p 36,37,38  2p 40  3p 44  4p 48  5p 53  6p 56  7p 60  8p 64  9p 68,69,70
 *   seat 1: 1s 72,73,74  2s 76  3s 80  4s 84  5s 89  6s 92  7s 96  8s 100  9s 104,105,106
 */
describe("toMjlogXml: three-player games", () => {
  // Seat 0 declares riichi, then sets aside the North it draws; seat 2 (chiitoitsu waiting on 4z)
  // wins by ron on that North and collects the deposit.
  const kitaRon: GameLog = makeSanmaGame(
    [
      makeSanmaRound({
        doraIndicators: ["9s"],
        hands: [tiles("1112345678999p"), tiles("1112345678999s"), tiles("1199m11223355z4z"), []],
        events: [
          draw(0, "7z"),
          discard(0, "7z", { tsumogiri: true, riichi: true }),
          riichiAccepted(0),
          draw(1, "7z"),
          tsumogiri(1, "7z"),
          draw(2, "6z"),
          tsumogiri(2, "6z"),
          draw(0, "4z"),
          kita(0),
          win(2, 0, [-1600, 0, 2600, 0], {
            tile: "4z",
            hand: tiles("1199m1122334455z"),
            han: 2,
            fu: 25,
            points: 1600,
            yaku: [{ key: "chiitoitsu", han: 2 }],
          }),
        ],
      }),
    ],
    { finalScores: [32400, 35000, 37600, 0] },
  );

  it("writes Tenhou's tags: GO bit 0x10, the empty seat 3, a kita and a ron on it", () => {
    expect(toMjlogXml(kitaRon)).toBe(
      [
        '<mjloggm ver="2.3">',
        '<GO type="17" lobby="0"/>',
        '<UN n0="%41" n1="%42" n2="%43" n3="" sx="M,M,M,C"/>',
        '<TAIKYOKU oya="0"/>',
        // The dora indicator 9s is the free copy 107; seat 3 is dealt nothing.
        '<INIT seed="0,0,0,0,0,107" ten="350,350,350,0" oya="0" hai0="36,37,38,40,44,48,53,56,60,64,68,69,70" hai1="72,73,74,76,80,84,89,92,96,100,104,105,106" hai2="0,1,32,33,108,109,112,113,116,117,124,125,120" hai3=""/>',
        '<T132/><REACH who="0" step="1"/><D132/><REACH who="0" ten="340,350,350,0" step="2"/>',
        "<U133/><E133/><V128/><F128/>",
        // The North drawn is 121 (seat 2 holds 120): (121 << 8) | 0x20. The ron names it as machi.
        '<T121/><N who="0" m="31008" />',
        '<AGARI ba="0,1" hai="0,1,32,33,108,109,112,113,116,117,120,121,124,125" machi="121" ten="25,1600,0" yaku="22,2" doraHai="107" who="2" fromWho="0" sc="340,-16,350,0,350,26,0,0" owari="324,-27.6,350,-5.0,376,32.6,0,0.0" />',
        "</mjloggm>",
      ].join(""),
    );
    expect(roundTrip(kitaRon)).toStrictEqual(stripMjlogUnsupported(kitaRon));
    expect(checkGame(kitaRon)).toEqual([]);
  });

  it("writes dan and rate with Tenhou's values for the empty seat 3", () => {
    const players: Quad<PlayerInfo> = [
      { name: "A", rank: "七段", danIndex: 16, rating: 2000.5 },
      { name: "B", rank: "四段", danIndex: 13, rating: 1800 },
      { name: "C", rank: "新人", danIndex: 0, rating: 1500 },
      { name: "" },
    ];
    const game = makeSanmaGame([makeSanmaRound()], { players });
    const un = (readTags(toMjlogXml(game)) ?? []).find((tag) => tag.name === "UN");
    expect(Object.fromEntries(un?.attrs ?? [])).toEqual({
      n0: "%41",
      n1: "%42",
      n2: "%43",
      n3: "",
      dan: "16,13,0,0",
      rate: "2000.50,1800.00,1500.00,1500.00",
      sx: "M,M,M,C",
    });
    expect(roundTrip(game).players).toEqual(players);
    // Ranks and ratings are kept only when all three players have them.
    const unranked = makeSanmaGame([makeSanmaRound()], {
      players: [players[0], players[1], { name: "C" }, { name: "" }],
    });
    expect(roundTrip(unranked).players).toEqual([
      { name: "A" },
      { name: "B" },
      { name: "C" },
      { name: "" },
    ]);
    expect(roundTrip(unranked)).toStrictEqual(stripMjlogUnsupported(unranked));
  });

  it("sets the three-player GO bit and the 三 of the description", () => {
    const rules = {
      redFives: true,
      length: "south",
      room: "phoenix",
      openTanyao: true,
      fast: false,
    } as const;
    const game = makeSanmaGame([makeSanmaRound()], { rules });
    expect(attribute(toMjlogXml(game), "GO", "type")).toBe("185"); // 0xA9 | 0x10
    // The player count is GameLog.playerCount, never a rule.
    expect(roundTrip(game).rules).toStrictEqual({ ...rules, description: "三鳳南喰赤" });
    expect(roundTrip(game).playerCount).toBe(3);
  });

  it("writes a pon across the empty chair with Tenhou's relative seat mod 4", () => {
    // Seat 0 holds 999p, seat 1 999s and seat 2 11z; each pons the copy another seat discards.
    const relative = (seat: Seat, from: Seat, tile: Tile, consumed: string) => {
      const events = [draw(from, tile), tsumogiri(from, tile), pon(seat, from, tile, consumed)];
      const game = makeSanmaGame([makeSanmaRound({ events })]);
      expect(roundTrip(game).rounds[0]?.events[2]).toEqual(pon(seat, from, tile, consumed));
      const meld = decodeMeld(meldValues(toMjlogXml(game))[0] as number);
      return meld?.type === "pon" ? meld.from : undefined;
    };
    expect(relative(0, 1, "9p", "99p")).toBe(1);
    expect(relative(0, 2, "9p", "99p")).toBe(2);
    expect(relative(1, 2, "9s", "99s")).toBe(1);
    expect(relative(1, 0, "9s", "99s")).toBe(3);
    expect(relative(2, 0, "1z", "11z")).toBe(2);
    expect(relative(2, 1, "1z", "11z")).toBe(3);
  });

  // Seat 0 pons 5z, sets aside two Norths (one after the kakan's replacement draw, before the kan
  // dora as Tenhou orders it) and wins on the next replacement draw.
  const kakanKita = (): GameLog =>
    makeSanmaGame([
      makeSanmaRound({
        doraIndicators: ["6z"],
        hands: [tiles("5544z12345678s1p"), tiles("1112345678999p"), tiles("1199m112233z999s"), []],
        events: [
          draw(0, "7z"),
          tsumogiri(0, "7z"),
          draw(1, "5z"),
          tsumogiri(1, "5z"),
          pon(0, 1, "5z", "55z"),
          discard(0, "1p"),
          draw(1, "7z"),
          tsumogiri(1, "7z"),
          draw(2, "7z"),
          tsumogiri(2, "7z"),
          draw(0, "4z"),
          kita(0),
          draw(0, "5z"),
          kakan(0, "5z"),
          draw(0, "4z"),
          kita(0),
          dora("8p"),
          draw(0, "9s"),
          win(0, 0, [12000, -6000, -6000, 0], {
            tile: "9s",
            hand: tiles("44z123456789s"),
            han: 5,
            fu: 50,
            limit: "haneman",
            points: 12000,
            yaku: [
              { key: "rinshanKaihou", han: 1 },
              { key: "haku", han: 1 },
              { key: "ittsu", han: 1 },
              { key: "dora", han: 2 },
            ],
          }),
        ],
      }),
    ]);

  it("lists kita among the winner's melds newest first, a kakan in its pon's place", () => {
    const game = kakanKita();
    const xml = toMjlogXml(game);
    // Pon of 126 from the right: (31*3+2)<<9 | 3<<5 | 0x8 | 1 = 48745, kakan 48753. The kita set
    // aside the lowest North in the hand: the dealt 120, then 121.
    expect(meldValues(xml)).toEqual([48745, 30752, 48753, 31008]);
    expect(attribute(xml, "AGARI", "m")).toBe("31008,30752,48753");
    expect(attribute(xml, "AGARI", "hai")).toBe("72,76,80,84,89,92,96,100,107,122,123");
    expect(attribute(xml, "AGARI", "machi")).toBe("107");
    expect(attribute(xml, "AGARI", "sc")).toBe("350,120,350,-60,350,-60,0,0");
    expect(
      (readTags(xml) ?? []).map((tag) => tag.name).filter((name) => /^(N|DORA|T\d+)$/.test(name)),
    ).toEqual(["T132", "N", "T122", "N", "T127", "N", "T123", "N", "DORA", "T107"]);
    expect(roundTrip(game)).toStrictEqual(stripMjlogUnsupported(game));
    expect(checkGame(game)).toEqual([]);
  });

  it("writes an exhaustive draw of the 55-tile wall with the tenpai hands", () => {
    const round = wallRound({
      playerCount: 3,
      seed: 11,
      draws: 55,
      kita: true,
      results: [ryukyoku("exhaustive", [2000, -1000, -1000, 0], { tenpai: [0] })],
    });
    const game = makeSanmaGame([round]);
    const tags = readTags(toMjlogXml(game)) ?? [];
    expect(tags.filter((tag) => /^[TUV]\d+$/.test(tag.name))).toHaveLength(55);
    expect(tags.some((tag) => /^[WG]\d+$/.test(tag.name))).toBe(false);
    const ryuukyoku = tags.find((tag) => tag.name === "RYUUKYOKU")?.attrs ?? new Map();
    expect(ryuukyoku.get("sc")).toBe("350,20,350,-10,350,-10,0,0");
    expect([0, 1, 2, 3].map((seat) => ryuukyoku.has(`hai${seat}`))).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(roundTrip(game)).toStrictEqual(stripMjlogUnsupported(game));
  });

  it("writes Tenhou's three-player uma in owari", () => {
    // 40000 return, uma 0 and -20 for 2nd and 3rd, the rest to the top; seat 3 gets 0.0.
    expect(tenhouUma([41000, 33000, 31000, 0], 3)).toEqual(["36.0", "-7.0", "-29.0", "0.0"]);
    // A negative score still ranks below the empty seat 3's 0, which is not ranked.
    expect(tenhouUma([-1200, 60500, 45700, 0], 3)).toEqual(["-61.2", "55.5", "5.7", "0.0"]);
    // Equal points rank by seat.
    expect(tenhouUma([35000, 35000, 35000, 0], 3)).toEqual(["30.0", "-5.0", "-25.0", "0.0"]);
  });

  it("rejects what a three-player mjlog cannot carry", () => {
    const throws = (game: GameLog, message: RegExp) =>
      expect(() => toMjlogXml(game)).toThrow(message);
    const sanma = (round: Partial<Round>, extra: Partial<GameLog> = {}) =>
      makeSanmaGame([makeSanmaRound(round)], extra);
    throws(makeGame([makeRound({ events: [draw(3, "4z"), kita(3)] })]), /kita in a four-player/);
    throws(sanma({ events: [draw(0, "1z"), kita(0, "1z")] }), /kita of 1z, which is not a North/);
    throws(sanma({ events: [draw(0, "2m")] }), /2m, which a three-player game does not have/);
    const dealt = makeSanmaRound().hands;
    dealt[3] = tiles("1112345678999p");
    throws(sanma({ hands: dealt }), /seat 3 starts with 13 tiles instead of 0/);
    throws(sanma({ scores: [35000, 35000, 30000, 5000] }), /empty seat 3.*start score of 5000/);
    throws(sanma({ events: [draw(3, "1z")] }), /seat of a draw is the empty seat 3/);
    const ending = (event: RoundEvent) =>
      sanma({ events: [draw(0, "1z"), tsumogiri(0, "1z"), event] });
    throws(ending(ryukyoku("exhaustive", [2000, -1000, -2000, 1000])), /point change of 1000/);
    throws(
      ending(ryukyoku("exhaustive", [0, 0, 0, 0], { tenpai: [3] })),
      /tenpai seat is the empty seat 3/,
    );
    const drawn = ending(ryukyoku("exhaustive"));
    drawn.finalScores = [35000, 35000, 34000, 1000];
    throws(drawn, /empty seat 3 of a three-player game has final points/);
  });
});

/** The seat of the last event of a type in a round. */
function lastSeat(round: Round, type: "draw" | "discard"): Seat {
  const event = round.events.findLast((e) => e.type === type);
  return event?.type === type ? event.seat : 0;
}

/** A three-player hanchan of hand-built rounds whose kita, dealers and honba all follow on. */
function buildSanmaHanchan(): GameLog {
  const rounds: Round[] = [];
  const scores = () => endScores(rounds.at(-1) as Round);
  // East 1: kita from a draw and from the hand, a pon across the empty chair, riichi, ankan with kan
  // dora, a kita in riichi and a ron on that North by a non-dealer.
  rounds.push(sampleSanmaRound());
  // East 2: the dealer is tenpai when the 55-tile wall runs out; every North drawn is set aside.
  rounds.push(
    wallRound({
      playerCount: 3,
      seed: 12,
      dealer: 1,
      scores: scores(),
      draws: 55,
      kita: true,
      results: [ryukyoku("exhaustive", [-1000, 2000, -1000, 0], { tenpai: [1] })],
    }),
  );
  // East 2, 1 honba: kyuushu kyuuhai.
  rounds.push(
    wallRound({
      playerCount: 3,
      seed: 13,
      dealer: 1,
      honba: 1,
      scores: scores(),
      draws: 1,
      keepLastDraw: true,
      results: [ryukyoku("kyuushuKyuuhai")],
    }),
  );
  // East 2, 2 honba: riichi, a kita in riichi, then a ron on the last discard (200 per honba).
  const riichiRound = wallRound({
    playerCount: 3,
    seed: 14,
    dealer: 1,
    honba: 2,
    scores: scores(),
    draws: 12,
    riichiAt: [2],
    kita: true,
  });
  const from = lastSeat(riichiRound, "discard");
  const declaration = riichiRound.events.find((e) => e.type === "discard" && e.riichi);
  const declarer = declaration?.type === "discard" ? declaration.seat : 0;
  const winner =
    declarer !== from ? declarer : (([0, 1, 2] as Seat[]).find((s) => s !== from) as Seat);
  const ronDeltas: Quad<number> = [0, 0, 0, 0];
  ronDeltas[from] = -4300;
  ronDeltas[winner] = 5300;
  riichiRound.events.push(
    win(winner, from, ronDeltas, {
      fu: 40,
      points: 3900,
      yaku: [
        { key: "riichi", han: 1 },
        { key: "dora", han: 2 },
      ],
      ...(winner === declarer ? { uraIndicators: [wallDraw(60, 14, 3)] } : {}),
    }),
  );
  rounds.push(riichiRound);
  // Then a tsumo in a round with a kita, with tsumo loss (two payers, 100 each per honba).
  const renchan = winner === 1;
  const tsumoRound = wallRound({
    playerCount: 3,
    seed: 15,
    dealer: renchan ? 1 : 2,
    honba: renchan ? 3 : 0,
    scores: scores(),
    draws: 10,
    keepLastDraw: true,
    kita: true,
  });
  const tsumo = lastSeat(tsumoRound, "draw");
  const extra = 100 * tsumoRound.honba;
  const tsumoDeltas: Quad<number> = [0, 0, 0, 0];
  for (const seat of [0, 1, 2] as Seat[]) {
    if (seat !== tsumo) {
      tsumoDeltas[seat] =
        -(seat === tsumoRound.dealer || tsumo === tsumoRound.dealer ? 2000 : 1000) - extra;
    }
  }
  tsumoDeltas[tsumo] = -tsumoDeltas.reduce((sum, delta) => sum + delta, 0);
  tsumoRound.events.push(
    win(tsumo, tsumo, tsumoDeltas, {
      fu: 30,
      points: -tsumoDeltas.reduce(
        (sum, delta, seat) => sum + (seat === tsumo ? 0 : delta + extra),
        0,
      ),
      yaku: [
        { key: "menzenTsumo", han: 1 },
        { key: "dora", han: 2 },
      ],
    }),
  );
  rounds.push(tsumoRound);
  return makeSanmaGame(rounds, {
    format: "mjlog",
    players: [
      { name: "A", rank: "七段", danIndex: 16, rating: 2201.5 },
      { name: "B", rank: "八段", danIndex: 17, rating: 2150 },
      { name: "C", rank: "天鳳位", danIndex: 20, rating: 2400.75 },
      { name: "" },
    ],
    rules: {
      redFives: true,
      length: "south",
      room: "phoenix",
      openTanyao: true,
      fast: false,
      description: "三鳳南喰赤",
    },
    finalScores: endScores(rounds.at(-1) as Round),
  });
}

describe("parseMjlog(toMjlogXml(game)) on a hand-built three-player hanchan", () => {
  const hanchan = buildSanmaHanchan();

  it("builds a consistent hanchan with kita in every round that draws a North", () => {
    expect(checkGame(hanchan)).toEqual([]);
    expect(hanchan.rounds.map((round) => round.events.at(-1)?.type)).toEqual([
      "win",
      "ryukyoku",
      "ryukyoku",
      "win",
      "win",
    ]);
    expect(hanchan.rounds.map((round) => round.events.some((e) => e.type === "kita"))).toEqual([
      true,
      true,
      false,
      true,
      true,
    ]);
  });

  it("gives back the hanchan minus what mjlog cannot carry, with the same events in order", () => {
    const back = roundTrip(hanchan);
    expect(back).toStrictEqual(stripMjlogUnsupported(hanchan));
    expect(checkGame(back)).toEqual([]);
    hanchan.rounds.forEach((round, index) => {
      expect(back.rounds[index]?.hands).toEqual(round.hands);
      expect(back.rounds[index]?.events.map((event) => event.type)).toEqual(
        round.events.map((event) => event.type),
      );
    });
  });
});

const TENHOU_DIR = join(import.meta.dirname, "..", "tenhou-json", "__fixtures__", "convlog");
const TENHOU_FIXTURES = readdirSync(TENHOU_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

/** convlog's hand-edited test game whose wall has four plain 5s although red fives are on. */
const NOT_ENCODABLE = "confusing_nakis_2.json";

function tenhouGame(name: string): GameLog {
  return parseTenhouJson(readFileSync(join(TENHOU_DIR, name), "utf-8"));
}

describe("parseMjlog(toMjlogXml(game)) on the tenhou.net/6 fixtures", () => {
  const encodable = TENHOU_FIXTURES.filter((name) => name !== NOT_ENCODABLE);

  it("covers chankan, double ron, four riichi, kyuushu, rinshan, suukantsu and the tricky calls", () => {
    expect(encodable).toHaveLength(19);
    for (const name of [
      "chankan",
      "double_ron",
      "four_reach",
      "kyushukyuhai",
      "rinshan",
      "suukantsu_1",
      "complex_nakis_0",
      "confusing_nakis_7",
      "ranked_game",
    ]) {
      expect(encodable).toContain(`${name}.json`);
    }
  });

  it.each(encodable)("%s comes back minus what mjlog cannot carry", (name) => {
    const game = tenhouGame(name);
    const back = roundTrip(game);
    expect(back).toStrictEqual(stripMjlogUnsupported(game));
    // The replay finds the same issues (none, except in the hand-edited confusing_nakis_1).
    expect(checkGame(back)).toEqual(checkGame(game));
    if (name !== "confusing_nakis_1.json") {
      expect(checkGame(back)).toEqual([]);
    }
  });

  it("refuses the game with four plain 5s in a game with red fives", () => {
    expect(() => toMjlogXml(tenhouGame(NOT_ENCODABLE))).toThrow(/no 5s is left for seat 2's draw/);
  });

  it("restates only the source fields for the ranked game", () => {
    const game = tenhouGame("ranked_game.json");
    const back = roundTrip(game);
    const { format: _format, rules: _rules, ...rest } = back;
    const { format: _sourceFormat, rules: _sourceRules, rounds, ...sourceRest } = game;
    expect(rest).toEqual({
      ...sourceRest,
      rounds: rounds.map((round) => ({
        ...round,
        events: round.events.map((event) =>
          event.type === "win" && event.limit ? { ...event, fu: 0 } : event,
        ),
      })),
    });
    expect(back.rules).toEqual(game.rules);
  });
});
