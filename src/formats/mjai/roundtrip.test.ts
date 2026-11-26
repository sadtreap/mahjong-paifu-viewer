import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  AnkanEvent,
  CallEvent,
  DiscardEvent,
  DoraEvent,
  DrawEvent,
  GameLog,
  KakanEvent,
  KitaEvent,
  Quad,
  RiichiAcceptedEvent,
  Round,
  RoundEvent,
  RyukyokuEvent,
  RyukyokuReason,
  Seat,
  WinEvent,
} from "../../core/model";
import type { KnownTile, Tile } from "../../core/tile";
import { corpusFiles, MJLOG_CORPUS, SANMA_MJLOG_CORPUS } from "../../test/corpus";
import { stripMjaiUnsupported, toMjaiEvents, toMjaiJsonl } from "../../test/mjai-serialize";
import { parseMjlog } from "../mjlog/parse";
import { parseTenhouJson } from "../tenhou-json/parse";
import { parseMjai } from "./parse";
import { tileToMjai } from "./tiles";

// Compact builders for hand-made rounds. Events are listed in convlog's order (see mjai-serialize).

/** "123m0p5z" -> 1m 2m 3m 0p 5z. */
function tiles(spec: string): Tile[] {
  const result: Tile[] = [];
  for (const [, digits, suit] of spec.matchAll(/([0-9?]+)([mpsz]?)/g)) {
    for (const digit of digits ?? "") {
      result.push((digit === "?" ? "?" : `${digit}${suit}`) as Tile);
    }
  }
  return result;
}

const draw = (seat: Seat, tile: Tile): DrawEvent => ({ type: "draw", seat, tile });
const cut = (seat: Seat, tile: Tile, tsumogiri = false, riichi = false): DiscardEvent => ({
  type: "discard",
  seat,
  tile,
  tsumogiri,
  riichi,
});
/** Draw a tile and discard it. */
const pass = (seat: Seat, tile: Tile): RoundEvent[] => [draw(seat, tile), cut(seat, tile, true)];
const accepted = (seat: Seat): RiichiAcceptedEvent => ({ type: "riichiAccepted", seat });
const dora = (indicator: KnownTile): DoraEvent => ({ type: "dora", indicator });
const call =
  (type: CallEvent["type"]) =>
  (seat: Seat, from: Seat, tile: Tile, consumed: string): CallEvent => ({
    type,
    seat,
    from,
    tile,
    consumed: tiles(consumed),
  });
const chi = call("chi");
const pon = call("pon");
const daiminkan = call("daiminkan");
const ankan = (seat: Seat, spec: string): AnkanEvent => ({
  type: "ankan",
  seat,
  tiles: tiles(spec),
});
const kakan = (seat: Seat, tile: Tile): KakanEvent => ({ type: "kakan", seat, tile });
const win = (
  seat: Seat,
  from: Seat,
  deltas: Quad<number>,
  extra: Omit<WinEvent, "type" | "seat" | "from" | "deltas"> = {},
): WinEvent => ({ type: "win", seat, from, deltas, ...extra });
const ryukyoku = (
  reason: RyukyokuReason,
  deltas: Quad<number> = [0, 0, 0, 0],
  extra: Omit<RyukyokuEvent, "type" | "reason" | "deltas"> = {},
): RyukyokuEvent => ({ type: "ryukyoku", reason, deltas, ...extra });

/** Draw-and-discard turns in seat order, enough to exhaust the wall when `count` is 70. */
function turns(first: Seat, count: number): RoundEvent[] {
  const cycle = tiles("19m19p19s567z28m28p28s");
  const events: RoundEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    events.push(...pass(((first + index) % 4) as Seat, cycle[index % cycle.length] as Tile));
  }
  return events;
}

const HANDS: Quad<Tile[]> = [
  tiles("123m456p789s1122z"),
  tiles("406m11p2378s3344z"),
  tiles("99m123p0567s5566z"),
  tiles("2345m678p99s7611z"),
];

function round(base: Partial<Round>, events: RoundEvent[]): Round {
  return {
    wind: 0,
    number: 1,
    dealer: 0,
    honba: 0,
    riichiSticks: 0,
    scores: [25000, 25000, 25000, 25000],
    doraIndicators: ["1p"],
    hands: HANDS,
    ...base,
    events,
  };
}

/**
 * A hanchan with every event type, every ryukyoku reason and convlog's dora/riichi orderings.
 * toMjaiJsonl(FULL_GAME) was checked to be identical to what convlog itself writes for this game
 * written as a tenhou.net/6 log.
 */
const FULL_GAME: GameLog = {
  format: "mjai",
  id: "hand-made",
  playerCount: 4,
  players: [
    { name: "A", rank: "七段", rating: 2100 },
    { name: "B" },
    { name: "C" },
    { name: "D", rank: "八段" },
  ],
  rules: { redFives: true, length: "south", description: "四鳳南喰赤" },
  finalScores: [31000, 22000, 18000, 29000],
  rounds: [
    // Chi with a red five, pon, riichi, then a tsumo with ura dora.
    round({}, [
      ...pass(0, "1z"),
      draw(1, "3m"),
      cut(1, "9p"),
      ...pass(2, "4m"),
      chi(3, 2, "4m", "06m"),
      cut(3, "9s"),
      ...pass(0, "7z"),
      pon(2, 0, "7z", "77z"),
      cut(2, "1s"),
      draw(3, "2p"),
      cut(3, "2p", true, true),
      accepted(3),
      ...pass(0, "3s"),
      draw(1, "5p"),
      cut(1, "8m"),
      ...pass(2, "6s"),
      draw(3, "0p"),
      win(3, 3, [-2600, -1300, -1300, 6200], {
        tile: "0p",
        uraIndicators: ["3z"],
        hand: tiles("23m234p0p0p78s"),
        han: 3,
        fu: 30,
        points: 5200,
        yaku: [
          { key: "riichi", han: 1 },
          { key: "menzenTsumo", han: 1 },
          { key: "akaDora", han: 1 },
        ],
      }),
    ]),
    // Daiminkan (dora before the rinshan discard), ankan (dora right away), ron with pao.
    round({ number: 2, dealer: 1, scores: [22400, 23700, 23700, 30200] }, [
      ...pass(1, "2z"),
      daiminkan(3, 1, "2z", "222z"),
      draw(3, "8p"),
      dora("5s"),
      cut(3, "8p", true),
      ...pass(0, "9m"),
      draw(1, "1m"),
      ankan(1, "1111m"),
      dora("6z"),
      draw(1, "4p"),
      cut(1, "4p", true),
      ...pass(2, "7p"),
      ...pass(3, "3p"),
      win(0, 3, [32000, 0, 0, -32000], { tile: "3p", han: 13, limit: "yakuman", pao: 1 }),
    ]),
    // Kakan, a riichi discard called by pon, daiminkan then kakan (two dora pending), double ron.
    round({ number: 3, dealer: 2, scores: [54400, 23700, 23700, -1800] }, [
      ...pass(2, "5z"),
      pon(0, 2, "5z", "55z"),
      cut(0, "9s"),
      ...pass(1, "2s"),
      ...pass(2, "8s"),
      draw(3, "6p"),
      cut(3, "6p", true, true),
      accepted(3),
      pon(1, 3, "6p", "66p"),
      cut(1, "1p"),
      ...pass(2, "4s"),
      ...pass(3, "7m"),
      draw(0, "5z"),
      kakan(0, "5z"),
      draw(0, "2m"),
      dora("8m"),
      cut(0, "2m", true),
      ...pass(1, "3z"),
      ...pass(2, "4z"),
      daiminkan(1, 2, "4z", "444z"),
      draw(1, "6p"),
      kakan(1, "6p"),
      dora("1s"),
      draw(1, "9p"),
      dora("2s"),
      cut(1, "9p", true),
      draw(2, "1m"),
      cut(2, "3s"),
      win(3, 2, [0, 0, -3900, 4900], { tile: "3s", uraIndicators: ["4p"] }),
      win(0, 2, [2000, 0, -2000, 0], { tile: "3s" }),
    ]),
    // Kyuushu kyuuhai.
    round({ number: 4, dealer: 3, scores: [56400, 23700, 17800, 2100] }, [
      draw(3, "1z"),
      ryukyoku("kyuushuKyuuhai", [0, 0, 0, 0], {
        hands: [null, null, null, tiles("19m19p19s12345677z")],
      }),
    ]),
    // Exhaustive draw.
    round({ wind: 1, honba: 1, riichiSticks: 1, scores: [56400, 23700, 17800, 2100] }, [
      ...turns(0, 70),
      ryukyoku("exhaustive", [1500, -1500, 1500, -1500], { tenpai: [0, 2] }),
    ]),
    // Suucha riichi: the fourth riichi is accepted, then the round is aborted.
    round({ wind: 1, honba: 2, riichiSticks: 1, scores: [57900, 22200, 19300, 600] }, [
      draw(0, "9m"),
      cut(0, "9m", true, true),
      accepted(0),
      draw(1, "1p"),
      cut(1, "1p", true, true),
      accepted(1),
      draw(2, "9p"),
      cut(2, "9p", true, true),
      accepted(2),
      draw(3, "1s"),
      cut(3, "1s", true, true),
      accepted(3),
      ryukyoku("suuchaRiichi"),
    ]),
    // Chankan.
    round({ wind: 1, honba: 3, riichiSticks: 5, scores: [56900, 21200, 18300, -400] }, [
      ...pass(0, "2z"),
      ...pass(1, "7p"),
      pon(2, 1, "7p", "77p"),
      cut(2, "9s"),
      ...pass(3, "1m"),
      ...pass(0, "3m"),
      ...pass(1, "4m"),
      draw(2, "7p"),
      kakan(2, "7p"),
      win(1, 2, [0, 7900, -2900, 0], { tile: "7p" }),
    ]),
    // Suufon renda.
    round({ wind: 1, number: 2, dealer: 1, scores: [56900, 29100, 15400, -400] }, [
      ...pass(1, "2z"),
      ...pass(2, "2z"),
      ...pass(3, "2z"),
      ...pass(0, "2z"),
      ryukyoku("suufonRenda"),
    ]),
    // Suukaikan: four ankan by four players, each revealing a dora at once.
    round({ wind: 1, number: 2, dealer: 1, honba: 1, scores: [56900, 29100, 15400, -400] }, [
      draw(1, "1m"),
      ankan(1, "1111m"),
      dora("2p"),
      ...pass(1, "2m"),
      draw(2, "3m"),
      ankan(2, "3333m"),
      dora("3p"),
      ...pass(2, "4m"),
      draw(3, "5s"),
      ankan(3, "5550s"),
      dora("4p"),
      ...pass(3, "6m"),
      draw(0, "7m"),
      ankan(0, "7777m"),
      dora("5p"),
      ...pass(0, "8m"),
      ryukyoku("suukaikan"),
    ]),
    // Sanchahou.
    round({ wind: 1, number: 3, dealer: 2, scores: [56900, 29100, 15400, -400] }, [
      ...pass(2, "5m"),
      ...pass(3, "6m"),
      ...pass(0, "7m"),
      ...pass(1, "8p"),
      ryukyoku("sanchaHou"),
    ]),
    // Nagashi mangan.
    round({ wind: 1, number: 3, dealer: 2, honba: 1, scores: [56900, 29100, 15400, -400] }, [
      ...turns(2, 70),
      ryukyoku("nagashiMangan", [8000, -2000, -4000, -2000]),
    ]),
    // A riichi on the rinshan tile does not reveal the kakan dora (it comes at the next discard),
    // then an ankan and a rinshan tsumo.
    round({ wind: 1, number: 4, dealer: 3, honba: 2, scores: [64900, 27100, 11400, -2400] }, [
      ...pass(3, "5m"),
      pon(1, 3, "5m", "50m"),
      cut(1, "9m"),
      ...pass(2, "1p"),
      ...pass(3, "2p"),
      ...pass(0, "3p"),
      draw(1, "5m"),
      kakan(1, "5m"),
      draw(1, "3s"),
      cut(1, "3s", true, true),
      accepted(1),
      draw(2, "4s"),
      dora("7s"),
      cut(2, "4s", true),
      draw(3, "6z"),
      ankan(3, "6666z"),
      dora("8s"),
      draw(3, "1p"),
      win(3, 3, [-4200, -4200, -4200, 13600], { tile: "1p" }),
    ]),
    // Kokushi musou robs an ankan: the round ends before the kan dora.
    round({ wind: 1, number: 4, dealer: 3, honba: 3, scores: [60700, 21900, 7200, 11200] }, [
      draw(3, "1z"),
      ankan(3, "1111z"),
      win(0, 3, [48900, 0, 0, -48900], { tile: "1z", limit: "yakuman" }),
    ]),
  ],
};

/** An east-only game without red fives, recorded from seat 0: other hands and draws are hidden. */
const HIDDEN = tiles("?????????????");
const SEAT_VIEW_GAME: GameLog = {
  format: "mjai",
  playerCount: 4,
  players: [{ name: "me" }, { name: "B" }, { name: "C" }, { name: "D" }],
  rules: { redFives: false, length: "east" },
  rounds: [
    round({ hands: [tiles("123m456p789s1122z"), HIDDEN, HIDDEN, HIDDEN] }, [
      draw(0, "3z"),
      cut(0, "3z", true),
      draw(1, "?"),
      cut(1, "5z", true),
      draw(2, "?"),
      cut(2, "3p"),
      draw(3, "?"),
      cut(3, "1z", true),
      draw(0, "4z"),
      cut(0, "4z", true),
      draw(1, "?"),
      cut(1, "4s", false, true),
      accepted(1),
      draw(2, "?"),
      win(2, 2, [-1000, -1000, 3000, -1000]),
    ]),
    round(
      {
        number: 2,
        dealer: 1,
        scores: [24000, 23000, 28000, 24000],
        hands: [tiles("123m456p789s1122z"), HIDDEN, HIDDEN, HIDDEN],
      },
      [
        draw(1, "?"),
        cut(1, "7z", true),
        draw(2, "?"),
        cut(2, "8m"),
        draw(3, "?"),
        cut(3, "5p"),
        draw(0, "1z"),
        cut(0, "2z"),
        win(3, 0, [-2000, 0, 0, 2000], { tile: "2z" }),
      ],
    ),
  ],
};

describe("toMjaiEvents", () => {
  it("writes convlog's header and footer", () => {
    const events = toMjaiEvents(FULL_GAME);
    expect(events[0]).toEqual({
      type: "start_game",
      names: ["A", "B", "C", "D"],
      kyoku_first: 0,
      aka_flag: true,
    });
    expect(events[1]).toEqual({
      type: "start_kyoku",
      bakaze: "E",
      dora_marker: "1p",
      kyoku: 1,
      honba: 0,
      kyotaku: 0,
      oya: 0,
      scores: [25000, 25000, 25000, 25000],
      tehais: [
        ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "E", "E", "S", "S"],
        ["4m", "5mr", "6m", "1p", "1p", "2s", "3s", "7s", "8s", "W", "W", "N", "N"],
        ["9m", "9m", "1p", "2p", "3p", "5sr", "5s", "6s", "7s", "P", "P", "F", "F"],
        ["2m", "3m", "4m", "5m", "6p", "7p", "8p", "9s", "9s", "C", "F", "E", "E"],
      ],
    });
    expect(events.at(-1)).toEqual({ type: "end_game" });
    expect(toMjaiEvents(SEAT_VIEW_GAME)[0]).toMatchObject({ kyoku_first: 4, aka_flag: false });
  });

  it("writes convlog's field order", () => {
    const lines = toMjaiJsonl(FULL_GAME).split("\n");
    expect(lines).toContain(
      '{"type":"chi","actor":3,"target":2,"pai":"4m","consumed":["5mr","6m"]}',
    );
    expect(lines).toContain('{"type":"dahai","actor":3,"pai":"2p","tsumogiri":true}');
    expect(lines).toContain(
      '{"type":"hora","actor":3,"target":3,"deltas":[-2600,-1300,-1300,6200],"ura_markers":["W"]}',
    );
    expect(lines).toContain('{"type":"ryukyoku","deltas":[1500,-1500,1500,-1500]}');
    expect(lines).toContain('{"type":"kakan","actor":1,"pai":"5m","consumed":["5m","5m","5mr"]}');
    expect(lines.at(-1)).toBe("");
  });

  it("emits kans, dora and riichi in convlog's order", () => {
    const rounds: string[][] = [];
    for (const event of toMjaiEvents(FULL_GAME)) {
      if (event.type === "start_kyoku") {
        rounds.push([]);
      } else if (event.type !== "end_game") {
        rounds.at(-1)?.push(event.type);
      }
    }
    // Daiminkan: dora before the rinshan discard. Ankan: dora before the rinshan draw.
    expect(rounds[1]).toEqual([
      ...["tsumo", "dahai", "daiminkan", "tsumo", "dora", "dahai", "tsumo", "dahai"],
      ...["tsumo", "ankan", "dora", "tsumo", "dahai", "tsumo", "dahai", "tsumo", "dahai"],
      ...["hora", "end_kyoku"],
    ]);
    // reach_accepted comes before the pon of the riichi tile. Kakan: dora before the rinshan
    // discard. Daiminkan then kakan: the first dora before the second rinshan draw.
    expect(rounds[2]).toEqual([
      ...["tsumo", "dahai", "pon", "dahai", "tsumo", "dahai", "tsumo", "dahai"],
      ...["tsumo", "reach", "dahai", "reach_accepted", "pon", "dahai", "tsumo", "dahai"],
      ...["tsumo", "dahai", "tsumo", "kakan", "tsumo", "dora", "dahai", "tsumo", "dahai"],
      ...["tsumo", "dahai", "daiminkan", "tsumo", "kakan", "dora", "tsumo", "dora", "dahai"],
      ...["tsumo", "dahai", "hora", "hora", "end_kyoku"],
    ]);
    // No reach_accepted for the fourth riichi.
    expect(rounds[5]).toEqual([
      ...["tsumo", "reach", "dahai", "reach_accepted", "tsumo", "reach", "dahai"],
      ...["reach_accepted", "tsumo", "reach", "dahai", "reach_accepted", "tsumo", "reach", "dahai"],
      ...["ryukyoku", "end_kyoku"],
    ]);
    // A riichi on the rinshan tile leaves the kakan dora for the next player's discard.
    expect(rounds[11]).toEqual([
      ...["tsumo", "dahai", "pon", "dahai", "tsumo", "dahai", "tsumo", "dahai", "tsumo", "dahai"],
      ...["tsumo", "kakan", "tsumo", "reach", "dahai", "reach_accepted", "tsumo", "dora", "dahai"],
      ...["tsumo", "ankan", "dora", "tsumo", "hora", "end_kyoku"],
    ]);
    // No dora for an ankan that is robbed.
    expect(rounds[12]).toEqual(["tsumo", "ankan", "hora", "end_kyoku"]);
  });
});

describe("parseMjai(toMjaiJsonl(game))", () => {
  it("gives back a game with every event type", () => {
    expect(parseMjai(toMjaiJsonl(FULL_GAME))).toStrictEqual(stripMjaiUnsupported(FULL_GAME));
  });

  it("gives back a game with hidden tiles", () => {
    expect(parseMjai(toMjaiJsonl(SEAT_VIEW_GAME))).toStrictEqual(
      stripMjaiUnsupported(SEAT_VIEW_GAME),
    );
  });

  it("is stable over a second round trip", () => {
    const once = toMjaiJsonl(FULL_GAME);
    expect(toMjaiJsonl(parseMjai(once))).toBe(once);
  });
});

describe("stripMjaiUnsupported", () => {
  const stripped = stripMjaiUnsupported(FULL_GAME);

  it("drops the game fields mjai cannot carry", () => {
    expect(stripped.id).toBeUndefined();
    expect(stripped.finalScores).toBeUndefined();
    expect(stripped.players).toEqual([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]);
    expect(stripped.rules).toEqual({ redFives: true, length: "south" });
  });

  it("drops the win and ryukyoku fields mjai cannot carry", () => {
    const events = stripped.rounds.flatMap((r) => r.events);
    expect(events.find((event) => event.type === "win")).toEqual(
      win(3, 3, [-2600, -1300, -1300, 6200], { tile: "0p", uraIndicators: ["3z"] }),
    );
    expect(stripped.rounds[1]?.events.at(-1)).toEqual(
      win(0, 3, [32000, 0, 0, -32000], { tile: "3p" }),
    );
    expect(stripped.rounds[3]?.events.at(-1)).toEqual(ryukyoku("kyuushuKyuuhai"));
    // Tenpai at an exhaustive draw is kept: mjai carries it in the noten payments.
    expect(stripped.rounds[4]?.events.at(-1)).toEqual(
      ryukyoku("exhaustive", [1500, -1500, 1500, -1500], { tenpai: [0, 2] }),
    );
  });

  it("drops tenpai that the noten payments cannot tell", () => {
    const endings = [
      ryukyoku("exhaustive", [0, 0, 0, 0], { tenpai: [0, 1, 2, 3] }),
      ryukyoku("exhaustive", [0, 0, 0, 0], { tenpai: [] }),
      ryukyoku("nagashiMangan", [12000, -4000, -4000, -4000], { tenpai: [1] }),
    ];
    const game: GameLog = {
      ...FULL_GAME,
      rounds: endings.map((ending) => round({}, [...turns(0, 70), ending])),
    };
    expect(stripMjaiUnsupported(game).rounds.map((r) => r.events.at(-1))).toEqual([
      ryukyoku("exhaustive"),
      ryukyoku("exhaustive"),
      ryukyoku("nagashiMangan", [12000, -4000, -4000, -4000]),
    ]);
    expect(parseMjai(toMjaiJsonl(game))).toStrictEqual(stripMjaiUnsupported(game));
  });

  it("keeps everything else and does not modify its input", () => {
    expect(stripped.rounds.map((r) => r.events.length)).toEqual(
      FULL_GAME.rounds.map((r) => r.events.length),
    );
    expect(FULL_GAME.rounds[0]?.events.at(-1)).toMatchObject({ han: 3, fu: 30 });
    expect(FULL_GAME.id).toBe("hand-made");
  });
});

/** A tenhou.net/6 fixture as convlog-style mjai, read back by parseMjai. */
function tenhouViaMjai(name: string): GameLog {
  const path = join(import.meta.dirname, "..", "tenhou-json", "__fixtures__", "convlog", name);
  return parseMjai(toMjaiJsonl(parseTenhouJson(readFileSync(path, "utf-8"))));
}

function onlyRound(game: GameLog): Round {
  expect(game.rounds).toHaveLength(1);
  return game.rounds[0] as Round;
}

function ofType<T extends RoundEvent["type"]>(round: Round, type: T) {
  return round.events.filter(
    (event): event is Extract<RoundEvent, { type: T }> => event.type === type,
  );
}

// What parseMjai infers from what a convlog-style log leaves out, on real games.
describe("parseMjai on the tenhou.net/6 fixtures written as convlog-style mjai", () => {
  it("reads the game header", () => {
    const game = tenhouViaMjai("ranked_game.json");
    expect(game.rules).toEqual({ redFives: true, length: "south" });
    expect(game.rounds).toHaveLength(3);
    expect(game.finalScores).toBeUndefined();
    expect(tenhouViaMjai("four_reach.json").rules).toEqual({ redFives: true, length: "east" });
  });

  it("restores the fourth riichi acceptance of suucha riichi", () => {
    const round = onlyRound(tenhouViaMjai("four_reach.json"));
    expect(round.events.slice(-3)).toEqual([
      { type: "discard", seat: 0, tile: "2p", tsumogiri: false, riichi: true },
      { type: "riichiAccepted", seat: 0 },
      { type: "ryukyoku", reason: "suuchaRiichi", deltas: [0, 0, 0, 0] },
    ]);
    expect(ofType(round, "riichiAccepted").map((event) => event.seat)).toEqual([3, 2, 1, 0]);
  });

  it("infers kyuushu kyuuhai from a draw that ends the round", () => {
    const round = onlyRound(tenhouViaMjai("kyushukyuhai.json"));
    expect(round.events.at(-2)?.type).toBe("draw");
    expect(round.events.at(-1)).toEqual({
      type: "ryukyoku",
      reason: "kyuushuKyuuhai",
      deltas: [0, 0, 0, 0],
    });
  });

  it("infers an exhaustive draw after 70 draws, with tenpai from the noten payments", () => {
    const round = onlyRound(tenhouViaMjai("ryukyoku.json"));
    expect(ofType(round, "draw")).toHaveLength(70);
    expect(round.events.at(-1)).toStrictEqual({
      type: "ryukyoku",
      reason: "exhaustive",
      deltas: [1500, 1500, -1500, -1500],
      tenpai: [0, 1],
    });
  });

  it("reads double ron with ura indicators only for the riichi winner", () => {
    const round = onlyRound(tenhouViaMjai("double_ron.json"));
    const wins = ofType(round, "win");
    expect(wins).toHaveLength(2);
    const lastDiscard = ofType(round, "discard").at(-1);
    for (const win of wins) {
      expect(win.from).toBe(lastDiscard?.seat);
      expect(win.tile).toBe(lastDiscard?.tile);
      const riichi = ofType(round, "discard").some(
        (event) => event.riichi && event.seat === win.seat,
      );
      expect(win.uraIndicators !== undefined).toBe(riichi);
    }
  });

  it("takes the winning tile of a chankan from the kakan", () => {
    for (const name of ["chankan.json", "double_kakan_then_chankan.json"]) {
      const round = onlyRound(tenhouViaMjai(name));
      const kakan = ofType(round, "kakan").at(-1);
      expect(round.events.at(-2)).toBe(kakan);
      expect(round.events.at(-1)).toMatchObject({
        type: "win",
        from: kakan?.seat,
        tile: kakan?.tile,
      });
    }
  });

  it("takes the winning tile of a rinshan tsumo from the rinshan draw", () => {
    const round = onlyRound(tenhouViaMjai("rinshan.json"));
    const win = round.events.at(-1) as WinEvent;
    expect(win.seat).toBe(win.from);
    expect(round.events.at(-2)).toMatchObject({ type: "draw", seat: win.seat, tile: win.tile });
  });

  it("reads four kans with their dora", () => {
    for (const name of ["suukantsu_0.json", "suukantsu_1.json"]) {
      const round = tenhouViaMjai(name).rounds.at(-1) as Round;
      const kans = round.events.filter((event) =>
        ["ankan", "kakan", "daiminkan"].includes(event.type),
      );
      expect(kans).toHaveLength(4);
      expect(ofType(round, "dora").length).toBeGreaterThanOrEqual(3);
      expect(round.events.at(-1)?.type).toBe("win");
    }
  });
});

// Three-player games.

const kita = (seat: Seat): KitaEvent => ({ type: "kita", seat, tile: "4z" });

/** Draw-and-discard turns in three-player order, enough to exhaust the wall when `count` is 55. */
function sanmaTurns(first: Seat, count: number): RoundEvent[] {
  const cycle = tiles("19m19p19s567z28p28s");
  const events: RoundEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    events.push(...pass(((first + index) % 3) as Seat, cycle[index % cycle.length] as Tile));
  }
  return events;
}

const SANMA_HANDS: Quad<Tile[]> = [
  tiles("11m234p678p34s455z"),
  tiles("19m1159p267s1237z"),
  tiles("99m306p1178s1366z"),
  [],
];

function sanmaRound(base: Partial<Round>, events: RoundEvent[]): Round {
  return round(
    { scores: [35000, 35000, 35000, 0], doraIndicators: ["9s"], hands: SANMA_HANDS, ...base },
    events,
  );
}

/**
 * A three-player hanchan with kita and its replacement draw, a ron on a kita, a kan dora revealed
 * after a kita, a double ron with a riichi deposit, and the three-player exhaustive draw (55 draws,
 * 2000 noten payments) and nagashi mangan.
 */
const SANMA_GAME: GameLog = {
  format: "tenhou-json",
  id: "sanma-hand-made",
  playerCount: 3,
  players: [{ name: "A", rank: "七段" }, { name: "B" }, { name: "C" }, { name: "" }],
  rules: { redFives: true, length: "south", description: "三鳳南喰赤" },
  finalScores: [27000, 42100, 35900, 0],
  rounds: [
    // Kita, then a tsumo with nukidora.
    sanmaRound({}, [
      draw(0, "9s"),
      kita(0),
      draw(0, "5s"),
      cut(0, "9s"),
      draw(1, "6z"),
      cut(1, "7z"),
      draw(2, "1p"),
      cut(2, "1z"),
      draw(0, "5z"),
      win(0, 0, [4000, -2000, -2000, 0], {
        tile: "5z",
        han: 2,
        fu: 30,
        yaku: [
          { key: "menzenTsumo", han: 1 },
          { key: "nukidora", han: 1 },
        ],
      }),
    ]),
    // A riichi, then a ron on the North set aside.
    sanmaRound({ number: 2, dealer: 1, scores: [39000, 33000, 33000, 0] }, [
      draw(1, "1s"),
      cut(1, "1s", true),
      draw(2, "2p"),
      cut(2, "2p", true, true),
      accepted(2),
      draw(0, "7p"),
      cut(0, "7p", true),
      draw(1, "4z"),
      kita(1),
      win(2, 1, [0, -3900, 4900, 0], { tile: "4z", uraIndicators: ["3s"] }),
    ]),
    // Kakan, then a kita on the rinshan tile: the kan dora comes before the replacement draw.
    // Then a double ron; the riichi deposit goes to seat 1, first after seat 0.
    sanmaRound({ number: 3, dealer: 2, scores: [39000, 29100, 36900, 0] }, [
      ...pass(2, "6z"),
      pon(0, 2, "6z", "66z"),
      cut(0, "1s"),
      draw(1, "2s"),
      cut(1, "2s", true, true),
      accepted(1),
      ...pass(2, "3s"),
      draw(0, "6z"),
      kakan(0, "6z"),
      draw(0, "4z"),
      kita(0),
      dora("1p"),
      draw(0, "8s"),
      cut(0, "8s", true),
      win(1, 0, [-8000, 9000, 0, 0], { tile: "8s", uraIndicators: ["9p"] }),
      win(2, 0, [-2000, 0, 2000, 0], { tile: "8s" }),
    ]),
    // Kyuushu kyuuhai.
    sanmaRound(
      {
        wind: 1,
        scores: [29000, 37100, 38900, 0],
        hands: [tiles("19m19p19s1234567z"), SANMA_HANDS[1], SANMA_HANDS[2], []],
      },
      [
        draw(0, "1z"),
        ryukyoku("kyuushuKyuuhai", [0, 0, 0, 0], {
          hands: [tiles("19m19p19s11234567z"), null, null, null],
        }),
      ],
    ),
    // Exhaustive draw after 55 draws, one seat tenpai.
    sanmaRound({ wind: 1, honba: 1, scores: [29000, 37100, 38900, 0] }, [
      ...sanmaTurns(0, 55),
      ryukyoku("exhaustive", [2000, -1000, -1000, 0], { tenpai: [0] }),
    ]),
    // Nagashi mangan by seat 1.
    sanmaRound({ wind: 1, honba: 2, scores: [31000, 36100, 37900, 0] }, [
      ...sanmaTurns(0, 55),
      ryukyoku("nagashiMangan", [-4000, 6000, -2000, 0]),
    ]),
  ],
};

const H13 = Array.from({ length: 13 }, () => "?");

/** `JSON.stringify` with Python's `json.dumps` separators, as mortal-sanma's script writes. */
function pythonJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(pythonJson).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).map(
      ([key, item]) => `${JSON.stringify(key)}: ${pythonJson(item)}`,
    );
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value);
}

const lines = (events: object[], write: (event: object) => string = JSON.stringify) =>
  `${events.map(write).join("\n")}\n`;

const firstThree = (value: unknown) => (value as unknown[]).slice(0, 3);

/** mortal-sanma's tenhou6_to_mjai.py, from convlog3p: three slots, no ura_markers, spaced JSON. */
function asDialectC(game: GameLog): string {
  const events = toMjaiEvents(game).map((event): object => {
    switch (event.type) {
      case "start_game":
        return { type: "start_game", names: firstThree(event.names) };
      case "start_kyoku":
        return { ...event, scores: firstThree(event.scores), tehais: firstThree(event.tehais) };
      case "hora":
        return {
          type: "hora",
          actor: event.actor,
          target: event.target,
          deltas: firstThree(event.deltas),
        };
      case "ryukyoku": {
        // A draw without payments (kyuushu kyuuhai, all tenpai or all noten) has no deltas.
        const deltas = firstThree(event.deltas);
        return deltas.every((delta) => delta === 0)
          ? { type: "ryukyoku" }
          : { type: "ryukyoku", deltas };
      }
      default:
        return event;
    }
  });
  return lines(events, pythonJson);
}

/** RiichiEnv, from convlog3p: a bare start_game, three slots, kita, keys in alphabetical order. */
function asRiichiEnv(game: GameLog): string {
  const events = toMjaiEvents(game).map((event): object => {
    switch (event.type) {
      case "start_game":
        return { type: "start_game" };
      case "start_kyoku":
        return { ...event, scores: firstThree(event.scores), tehais: firstThree(event.tehais) };
      case "nukidora":
        return { ...event, type: "kita" };
      case "hora":
        return { ...event, deltas: firstThree(event.deltas), tsumo: event.actor === event.target };
      case "ryukyoku":
        return { ...event, deltas: firstThree(event.deltas) };
      default:
        return event;
    }
  });
  return lines(events, (event) => JSON.stringify(Object.fromEntries(Object.entries(event).sort())));
}

/** Akagi-NG's reasons for abortive draws (RiichiEnv's spellings). */
const AKAGI_NG_ABORTS: Partial<Record<RyukyokuReason, string>> = {
  kyuushuKyuuhai: "kyushu_kyuhai",
  suufonRenda: "sufuurenta",
  suukaikan: "suukansansen",
  suuchaRiichi: "suucha_riichi",
  sanchaHou: "sanchaho",
};

/**
 * Akagi-NG, from the Akagi shape: four-slot start_kyoku, three-slot results with the winning tile
 * and the scores after them, and empty arrays on an abortive draw. Tenpai flags are written for
 * exhaustive draws only.
 */
function asDialectE(game: GameLog): string {
  const results = game.rounds.flatMap((r) =>
    r.events.filter((event) => event.type === "win" || event.type === "ryukyoku"),
  );
  let scores: number[] = [];
  const after = (deltas: unknown) =>
    scores.map((score, seat) => score + ((deltas as number[])[seat] ?? 0));
  const events = toMjaiEvents(game, { sanma: "akagi" }).map((event): object => {
    switch (event.type) {
      case "start_game":
        return { type: "start_game", names: event.names, num_players: 3 };
      case "start_kyoku": {
        const { num_players: _, ...rest } = event;
        scores = [...(event.scores as number[])];
        return { ...rest, scores: [...scores, 0], tehais: [...(event.tehais as unknown[]), H13] };
      }
      case "reach_accepted": {
        const seat = event.actor as number;
        scores[seat] = (scores[seat] ?? 0) - 1000;
        return event;
      }
      case "hora": {
        const win = results.shift() as WinEvent;
        const hora: Record<string, unknown> = {
          type: "hora",
          actor: event.actor,
          target: event.target,
        };
        if (win.tile !== undefined) {
          hora.pai = tileToMjai(win.tile);
        }
        return {
          ...hora,
          scores: after(event.deltas),
          deltas: event.deltas,
          ...(event.ura_markers ? { ura_markers: event.ura_markers } : {}),
        };
      }
      case "ryukyoku": {
        const draw = results.shift() as RyukyokuEvent;
        if (draw.reason !== "exhaustive" && draw.reason !== "nagashiMangan") {
          return {
            type: "ryukyoku",
            scores: [],
            deltas: [],
            tenpais: [],
            reason: AKAGI_NG_ABORTS[draw.reason],
          };
        }
        const ryukyoku: Record<string, unknown> = {
          type: "ryukyoku",
          scores: after(event.deltas),
          deltas: event.deltas,
        };
        if (draw.reason === "exhaustive" && draw.tenpai) {
          ryukyoku.tenpais = [0, 1, 2].map((seat) => draw.tenpai?.includes(seat as Seat));
        }
        ryukyoku.reason = draw.reason === "exhaustive" ? "exhaustive_draw" : "nagashimangan";
        return ryukyoku;
      }
      default:
        return event;
    }
  });
  return lines(events);
}

/** The Akagi v2 bridge stream of seat 0, from convlog3p: no names, others hidden, no results. */
function asDialectA1(game: GameLog): string {
  const events = toMjaiEvents(game).flatMap((event): object[] => {
    switch (event.type) {
      case "start_game":
        return [{ type: "start_game", id: 0 }];
      case "start_kyoku":
        return [
          {
            ...event,
            tehais: (event.tehais as unknown[]).map((hand, seat) => (seat === 0 ? hand : H13)),
          },
        ];
      case "tsumo":
        return [event.actor === 0 ? event : { ...event, pai: "?" }];
      case "hora":
      case "ryukyoku":
        return [];
      default:
        return [event];
    }
  });
  return lines(events);
}

/** Red fives are on when the log has no aka_flag and shows a red five. */
function inferredRules(rounds: Round[]): GameLog["rules"] {
  return { redFives: /"0[mps]"/.test(JSON.stringify(rounds)) };
}

/**
 * What a log without kyoku_first and aka_flag carries, with or without names, ura_markers (C has
 * none) and tenpai flags (E writes them for exhaustive draws).
 */
function withoutHeader(
  game: GameLog,
  options: { names: boolean; ura: boolean; tenpai: boolean },
): GameLog {
  const stripped = stripMjaiUnsupported(game);
  const rounds = stripped.rounds.map((r, index) => ({
    ...r,
    events: r.events.map((event, at) => {
      const source = game.rounds[index]?.events[at];
      if (event.type === "win" && !options.ura) {
        const { uraIndicators: _, ...rest } = event;
        return rest;
      }
      if (
        options.tenpai &&
        event.type === "ryukyoku" &&
        event.reason === "exhaustive" &&
        source?.type === "ryukyoku" &&
        source.tenpai
      ) {
        return { ...event, tenpai: [...source.tenpai] };
      }
      return event;
    }),
  }));
  return {
    ...stripped,
    players: options.names
      ? stripped.players
      : [{ name: "" }, { name: "" }, { name: "" }, { name: "" }],
    rules: inferredRules(rounds),
    rounds,
  };
}

/** What seat 0's bridge stream carries: seat 0's tiles, everyone's discards and calls, no results. */
function seatZeroView(game: GameLog): GameLog {
  const stripped = stripMjaiUnsupported(game);
  const rounds = stripped.rounds.map((r) => ({
    ...r,
    hands: r.hands.map((hand, seat) =>
      seat === 0 || hand.length === 0 ? hand : tiles("?????????????"),
    ) as Quad<Tile[]>,
    events: r.events.flatMap((event): RoundEvent[] => {
      if (event.type === "win" || event.type === "ryukyoku") {
        return [];
      }
      return event.type === "draw" && event.seat !== 0 ? [{ ...event, tile: "?" }] : [event];
    }),
  }));
  return {
    ...stripped,
    players: [{ name: "" }, { name: "" }, { name: "" }, { name: "" }],
    rules: inferredRules(rounds),
    rounds,
  };
}

/** Every three-player shape, with what parseMjai must give back from it. */
const SANMA_DIALECTS: Array<[string, (game: GameLog) => string, (game: GameLog) => GameLog]> = [
  ["A2 (convlog3p)", (game) => toMjaiJsonl(game), stripMjaiUnsupported],
  ["D (Akagi v3)", (game) => toMjaiJsonl(game, { sanma: "akagi" }), stripMjaiUnsupported],
  [
    "C (mortal-sanma)",
    asDialectC,
    (game) => withoutHeader(game, { names: true, ura: false, tenpai: false }),
  ],
  [
    "D (RiichiEnv)",
    asRiichiEnv,
    (game) => withoutHeader(game, { names: false, ura: true, tenpai: false }),
  ],
  [
    "E (Akagi-NG)",
    asDialectE,
    (game) => withoutHeader(game, { names: true, ura: true, tenpai: true }),
  ],
  ["A1 (Akagi v2 bridge)", asDialectA1, seatZeroView],
];

describe("toMjaiEvents on a three-player game", () => {
  it("writes convlog3p's four slots with an empty fourth, and nukidora", () => {
    const events = toMjaiEvents(SANMA_GAME);
    expect(events[0]).toEqual({
      type: "start_game",
      names: ["A", "B", "C", ""],
      kyoku_first: 0,
      aka_flag: true,
    });
    expect(events[1]).toMatchObject({
      scores: [35000, 35000, 35000, 0],
      tehais: [...SANMA_HANDS.slice(0, 3).map((hand) => hand.map(tileToMjai)), H13],
    });
    const jsonl = toMjaiJsonl(SANMA_GAME).split("\n");
    expect(jsonl).toContain('{"type":"nukidora","actor":0,"pai":"N"}');
    expect(jsonl).toContain(
      '{"type":"hora","actor":2,"target":1,"deltas":[0,-3900,4900,0],"ura_markers":["3s"]}',
    );
    expect(jsonl).toContain('{"type":"ryukyoku","deltas":[2000,-1000,-1000,0]}');
  });

  it("writes Akagi v3's three slots, num_players, kita and combined multi-ron deltas", () => {
    const events = toMjaiEvents(SANMA_GAME, { sanma: "akagi" });
    expect(events[0]).toEqual({
      type: "start_game",
      names: ["A", "B", "C"],
      kyoku_first: 0,
      aka_flag: true,
      num_players: 3,
    });
    expect(events[1]).toMatchObject({ scores: [35000, 35000, 35000], num_players: 3 });
    expect(events[1]?.tehais).toHaveLength(3);
    const jsonl = toMjaiJsonl(SANMA_GAME, { sanma: "akagi" }).split("\n");
    expect(jsonl).toContain('{"type":"kita","actor":0,"pai":"N"}');
    expect(jsonl).toContain(
      '{"type":"hora","actor":1,"target":0,"deltas":[-10000,9000,2000],"ura_markers":["9p"]}',
    );
    expect(jsonl).toContain('{"type":"hora","actor":2,"target":0,"deltas":[-10000,9000,2000]}');
  });

  it("writes a kan dora pending at a kita before the replacement draw", () => {
    const types = toMjaiEvents(SANMA_GAME).map((event) => event.type);
    const kakan = types.indexOf("kakan");
    expect(types.slice(kakan, kakan + 6)).toEqual([
      "kakan",
      "tsumo",
      "nukidora",
      "dora",
      "tsumo",
      "dahai",
    ]);
  });
});

describe("parseMjai on every three-player shape of one game", () => {
  it.each(SANMA_DIALECTS)("gives back what %s carries", (_, write, expected) => {
    expect(parseMjai(write(SANMA_GAME))).toStrictEqual(expected(SANMA_GAME));
  });

  it.each([
    ["convlog3p", {}],
    ["akagi", { sanma: "akagi" }],
  ] as const)("is stable over a second round trip (%s)", (_, options) => {
    const once = toMjaiJsonl(SANMA_GAME, options);
    expect(toMjaiJsonl(parseMjai(once), options)).toBe(once);
  });

  it("keeps the yaku and players' ranks out, and the empty chair as it is", () => {
    const stripped = stripMjaiUnsupported(SANMA_GAME);
    expect(stripped.playerCount).toBe(3);
    expect(stripped.players[3]).toStrictEqual({ name: "" });
    expect(stripped.rounds[0]?.events.at(-1)).toStrictEqual(
      win(0, 0, [4000, -2000, -2000, 0], { tile: "5z" }),
    );
    expect(stripped.rounds[4]?.events.at(-1)).toStrictEqual(
      ryukyoku("exhaustive", [2000, -1000, -1000, 0], { tenpai: [0] }),
    );
  });
});

// Real games kept outside the repository (src/test/corpus.ts): every three-player game in every
// shape above; four-player games have convlog's shape only.
const CORPUS_FILES = [
  ...corpusFiles(MJLOG_CORPUS, ".xml"),
  ...corpusFiles(SANMA_MJLOG_CORPUS, ".xml"),
];

describe.skipIf(CORPUS_FILES.length === 0)("mjai shapes of the mjlog corpus games", () => {
  const load = (path: string) => parseMjlog(readFileSync(path, "utf-8"));

  it.each(CORPUS_FILES)("%s gives back what each shape carries", (_, path) => {
    const game = load(path);
    const dialects = game.playerCount === 3 ? SANMA_DIALECTS : SANMA_DIALECTS.slice(0, 1);
    for (const [dialect, write, expected] of dialects) {
      expect(parseMjai(write(game)), dialect).toStrictEqual(expected(game));
    }
  });
});
