/**
 * Tests of the test-only tenhou.net/6 serializer (src/test/tenhou-json-serialize.ts): parsing what
 * it writes gives back stripTenhouJsonUnsupported(game), and on Tenhou's own exports it writes
 * Tenhou's log arrays entry for entry.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameLog } from "../../core/model";
import { corpusFiles, SANMA_TENHOU_JSON_CORPUS } from "../../test/corpus";
import {
  discard,
  draw,
  kakan,
  kita,
  makeGame,
  makeRound,
  makeSanmaGame,
  makeSanmaRound,
  pon,
  ryukyoku,
  sampleRound,
  sampleSanmaGame,
  sampleSanmaRound,
  tiles,
  tsumogiri,
  win,
} from "../../test/round-builder";
import {
  stripTenhouJsonUnsupported,
  tenhouHandOrder,
  toTenhouJson,
  toTenhouJsonObject,
} from "../../test/tenhou-json-serialize";
import { parseTenhouJson } from "./parse";

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__", "convlog");
const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

const readFixture = (name: string) => readFileSync(join(FIXTURE_DIR, name), "utf-8");

type TenhouJson = Record<string, unknown> & { log: unknown[][] };

/**
 * Fixtures whose log arrays the serializer cannot write back as they are, because the model does
 * not keep what differs.
 */
const NOT_ENTRY_FOR_ENTRY: Record<string, string> = {
  "confusing_nakis_2.json": "hand-edited by convlog: two starting hands are not sorted",
  "confusing_nakis_7.json":
    "written by tensoul in English: yaku names, a red five before the plain one, ura dora worth 0",
};

describe("toTenhouJson on the fixtures", () => {
  it.each(FIXTURES)(
    "%s comes back from parseTenhouJson as stripTenhouJsonUnsupported says",
    (name) => {
      const game = parseTenhouJson(readFixture(name));
      expect(parseTenhouJson(toTenhouJson(game))).toStrictEqual(stripTenhouJsonUnsupported(game));
    },
  );

  it.each(FIXTURES.filter((name) => !(name in NOT_ENTRY_FOR_ENTRY)))(
    "%s is written back entry for entry",
    (name) => {
      const source = JSON.parse(readFixture(name)) as TenhouJson;
      const game = parseTenhouJson(readFixture(name));
      expect(stripTenhouJsonUnsupported(game)).toStrictEqual(game);
      expect(toTenhouJsonObject(game).log).toStrictEqual(source.log);
    },
  );

  it("lists only existing fixtures as exceptions", () => {
    for (const name of Object.keys(NOT_ENTRY_FOR_ENTRY)) {
      expect(FIXTURES).toContain(name);
    }
  });

  it("writes the ranked game's players, rules and final points as Tenhou does", () => {
    const source = JSON.parse(readFixture("ranked_game.json")) as TenhouJson;
    const written = toTenhouJsonObject(parseTenhouJson(readFixture("ranked_game.json")));
    expect(Object.keys(written)).toEqual(Object.keys(source));
    for (const key of ["ver", "ratingc", "rule", "lobby", "dan", "rate", "name"]) {
      expect(written[key], key).toStrictEqual(source[key]);
    }
    // The points are kept; the results are Tenhou's ranked result to one decimal, which this
    // four-player export rounded to whole numbers. The model has no sx (the players' sex).
    const [sc, sourceSc] = [written.sc, source.sc] as number[][];
    expect(sc?.filter((_, index) => index % 2 === 0)).toEqual(
      sourceSc?.filter((_, index) => index % 2 === 0),
    );
    expect(sc?.filter((_, index) => index % 2 === 1)).toEqual([-18.9, 65, -54.9, 8.8]);
    expect(written.sx).toEqual(["M", "M", "M", "M"]);
  });
});

describe("toTenhouJson on hand-built games", () => {
  it("writes every kind of event of a four-player round", () => {
    // Seat 1 chis from the left ("c" first), seat 3 pons seat 1's discard from across and adds to
    // it ("k" in place of "p"), seat 2's open kan from the right takes a 0 in its discards.
    const game = makeGame([sampleRound()], { rules: { redFives: true, description: "般南喰赤" } });
    const [round] = toTenhouJsonObject(game).log as unknown[][];
    expect(round).toStrictEqual([
      [0, 0, 0],
      [25000, 25000, 25000, 25000],
      [42, 23, 38, 11],
      [34, 22, 18, 33],
      [13, 19, 21, 22, 23, 27, 28, 29, 32, 32, 32, 46, 46],
      [41, 19, 32, 17],
      [13, "r41", "323232a32", 60],
      [14, 51, 28, 28, 31, 31, 35, 36, 37, 39, 43, 43, 43],
      ["c131451", 44, 46],
      [39, 60, 60],
      [11, 12, 13, 25, 52, 29, 29, 31, 37, 38, 44, 44, 44],
      ["m44444444", 36],
      [0, 31],
      [12, 13, 14, 16, 17, 18, 24, 25, 26, 39, 39, 47, 47],
      ["39p3939", 39, 15],
      [12, "39k393939", 60],
      ["和了", [13000, -12000, 0, 0], [0, 1, 0, "40符4飜12000点"]],
    ]);
    // The kakan's dora comes back before seat 3's discard, where Tenhou reveals it.
    const withoutDora = (game: GameLog) =>
      game.rounds[0]?.events.filter((event) => event.type !== "dora");
    const parsed = parseTenhouJson(toTenhouJson(game));
    expect(withoutDora(parsed)).toStrictEqual(withoutDora(stripTenhouJsonUnsupported(game)));
    expect(parsed.rounds[0]?.events.slice(17, 20).map((event) => event.type)).toEqual([
      "draw",
      "dora",
      "discard",
    ]);
  });

  it("writes a three-player round in Tenhou's 17-entry layout with f44 for a kita", () => {
    const game = makeSanmaGame([sampleSanmaRound()], {
      rules: { redFives: true, description: "三般東喰赤" },
    });
    const data = toTenhouJsonObject(game);
    expect(data).toMatchObject({
      ratingc: "PF3",
      rule: { disp: "三般東喰赤", aka53: 1, aka52: 1, aka51: 1 },
      sx: ["M", "M", "M", "C"],
      name: ["A", "B", "C", ""],
    });
    const [round] = data.log as unknown[][];
    expect(round).toHaveLength(17);
    expect(round?.slice(0, 4)).toStrictEqual([[0, 0, 0], [35000, 35000, 35000, 0], [11, 28], []]);
    // Seat 0 pons seat 2's discard at the across position; seat 3's lists are empty.
    expect(round?.slice(4, 16)).toStrictEqual([
      [19, 19, 32, 33, 34, 36, 37, 38, 46, 46, 47, 47, 47],
      [44, 25, "46p4646", 47, 22],
      ["f44", 60, 19, "474747a47", 60],
      [29, 37, 38, 39, 42, 42, 42, 43, 43, 43, 44, 45, 45],
      [45, 31, 19, 44],
      ["f44", 60, "r29", "f44"],
      [21, 22, 23, 24, 52, 26, 27, 28, 29, 31, 31, 31, 44],
      [46, 23],
      [60, 60],
      [],
      [],
      [],
    ]);
    expect(round?.[16]).toStrictEqual([
      "和了",
      [0, -5200, 6200, 0],
      [2, 1, 2, "40符3飜5200点", "一気通貫(2飜)", "赤ドラ(1飜)"],
    ]);
    expect(parseTenhouJson(toTenhouJson(game))).toStrictEqual(stripTenhouJsonUnsupported(game));
  });

  it("gives back the three-player sample game", () => {
    const game = sampleSanmaGame();
    const parsed = parseTenhouJson(toTenhouJson(game));
    expect(parsed).toStrictEqual(stripTenhouJsonUnsupported(game));
    expect(parsed.playerCount).toBe(3);
  });

  it("writes three-player tsumo payments as Tenhou's four-player score texts", () => {
    const tsumo = (seat: 0 | 1, points: number, extra = {}) =>
      makeSanmaRound({
        dealer: 0,
        hands: [tiles("123p456p789p11s23s"), tiles("1112345678999s"), tiles("1199m112233556z"), []],
        events: [
          draw(0, "1s"),
          tsumogiri(0, "1s"),
          draw(1, "4s"),
          ...(seat === 0 ? [tsumogiri(1, "4s"), draw(2, "5z"), tsumogiri(2, "5z")] : []),
          ...(seat === 0 ? [draw(0, "4s")] : []),
          win(seat, seat, [0, 0, 0, 0], { points, ...extra }),
        ],
      });
    const texts = [
      tsumo(1, 3000, { fu: 30, han: 3 }),
      tsumo(1, 1500, { fu: 30, han: 2 }),
      tsumo(1, 6000, { limit: "mangan" }),
      tsumo(0, 7800, { fu: 30, han: 4 }),
      tsumo(0, 32000, { limit: "yakuman" }),
    ].map((round) => {
      const [entry] = toTenhouJsonObject(makeSanmaGame([round])).log as unknown[][][][];
      return entry?.[16]?.[2]?.[3];
    });
    expect(texts).toEqual([
      "30符3飜1000-2000点",
      "30符2飜500-1000点",
      "満貫2000-4000点",
      "30符4飜3900点∀",
      "役満16000点∀",
    ]);
  });

  it("writes draws by their Tenhou names", () => {
    const result = (event: ReturnType<typeof ryukyoku>, playerCount: 3 | 4 = 3) => {
      const round =
        playerCount === 3 ? makeSanmaRound({ events: [event] }) : makeRound({ events: [event] });
      const game = playerCount === 3 ? makeSanmaGame([round]) : makeGame([round]);
      return (toTenhouJsonObject(game).log as unknown[][])[0]?.[16];
    };
    expect(result(ryukyoku("exhaustive", [2000, -1000, -1000, 0], { tenpai: [0] }))).toEqual([
      "流局",
      [2000, -1000, -1000, 0],
    ]);
    expect(result(ryukyoku("exhaustive", [0, 0, 0, 0], { tenpai: [0, 1, 2] }))).toEqual([
      "全員聴牌",
    ]);
    expect(result(ryukyoku("exhaustive", [0, 0, 0, 0], { tenpai: [] }))).toEqual(["全員不聴"]);
    expect(result(ryukyoku("exhaustive", [0, 0, 0, 0], { tenpai: [0, 1, 2] }), 4)).toEqual([
      "流局",
    ]);
    expect(result(ryukyoku("kyuushuKyuuhai"))).toEqual(["九種九牌"]);
    expect(result(ryukyoku("nagashiMangan", [8000, -4000, -4000, 0]))).toEqual([
      "流し満貫",
      [8000, -4000, -4000, 0],
    ]);
    expect(result(ryukyoku("unknown"))).toBeUndefined();
  });

  it("orders starting hands as Tenhou does, a red five after the plain fives", () => {
    expect(tenhouHandOrder(tiles("05p5s0s1z11m"))).toEqual(tiles("11m5p0p5s0s1z"));
  });

  it("throws on what tenhou.net/6 cannot express", () => {
    const write = (game: GameLog) => () => toTenhouJson(game);
    const sanma = (events: Parameters<typeof makeSanmaRound>[0]) =>
      makeSanmaGame([makeSanmaRound(events)]);
    expect(write(makeGame([makeRound({ doraIndicators: [] })]))).toThrow(/starting dora/);
    expect(write(makeGame([makeRound({ events: [draw(0, "?")] })]))).toThrow(/unknown tile/);
    expect(write(makeGame([makeRound({ events: [draw(0, "1z"), tsumogiri(0, "2z")] })]))).toThrow(
      /tsumogiri/,
    );
    expect(write(makeGame([makeRound({ events: [draw(0, "4z"), kita(0)] })]))).toThrow(/kita/);
    expect(
      write(sanma({ events: [draw(0, "1z"), discard(0, "1z"), pon(1, 1, "1z", "11z")] })),
    ).toThrow(/own discard/);
    expect(write(sanma({ events: [draw(0, "1z"), kakan(0, "1z")] }))).toThrow(/without a pon/);
    expect(
      write(
        sanma({ events: [draw(0, "1z"), win(0, 0, [2000, -1000, -1000, 0], { points: 1900 })] }),
      ),
    ).toThrow(/does not split/);
    expect(write(makeGame([makeRound({ wind: 3, dealer: 3, number: 4 })]))).not.toThrow();
    expect(write(makeGame([makeRound({ wind: 4 as 0, dealer: 0 })]))).toThrow(/above 15/);
  });
});

// Real three-player games kept outside the repository (src/test/corpus.ts).
const SANMA_CORPUS = corpusFiles(SANMA_TENHOU_JSON_CORPUS, ".json");

describe.skipIf(SANMA_CORPUS.length === 0)(
  `toTenhouJson on the three-player corpus in ${SANMA_TENHOU_JSON_CORPUS}`,
  () => {
    it.each(SANMA_CORPUS)("%s is written back entry for entry", (_, path) => {
      const source = JSON.parse(readFileSync(path, "utf-8")) as TenhouJson;
      const game = parseTenhouJson(readFileSync(path, "utf-8"));
      expect(stripTenhouJsonUnsupported(game)).toStrictEqual(game);
      expect(parseTenhouJson(toTenhouJson(game))).toStrictEqual(game);
      const written = toTenhouJsonObject(game);
      // Everything but sx, the players' sex, which the model does not keep.
      for (const key of ["log", "ratingc", "rule", "dan", "rate", "sc", "name"]) {
        expect(written[key], key).toStrictEqual(source[key]);
      }
    });
  },
);
