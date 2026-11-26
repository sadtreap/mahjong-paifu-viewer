import { describe, expect, it } from "vitest";
import type { YakuKey } from "../../core/yaku";
import { LogParseError } from "../errors";
import { parseRoundResult, parseScoreText, parseYakuText } from "./result";

/**
 * The standard four-player yaku of Mahjong Soul as tensoul (Equim-chan/tensoul, the Mahjong Soul to
 * tenhou.net/6 converter) writes them: [id, name_jp, name_en] from its data.json fan table. tensoul
 * writes the Japanese names unless its NAMEPREF setting is changed to English.
 */
const TENSOUL_YAKU: ReadonlyArray<[id: number, jp: string, en: string, key: YakuKey]> = [
  [1, "門前清自摸和", "Fully Concealed Hand", "menzenTsumo"],
  [2, "立直", "Riichi", "riichi"],
  [3, "槍槓", "Robbing a Kan", "chankan"],
  [4, "嶺上開花", "After a Kan", "rinshanKaihou"],
  [5, "海底摸月", "Under the Sea", "haiteiRaoyue"],
  [6, "河底撈魚", "Under the River", "houteiRaoyui"],
  [7, "役牌 白", "White Dragon", "haku"],
  [8, "役牌 發", "Green Dragon", "hatsu"],
  [9, "役牌 中", "Red Dragon", "chun"],
  [10, "役牌:自風牌", "Seat Wind", "seatWind"],
  [11, "役牌:場風牌", "Prevalent Wind", "roundWind"],
  [12, "断幺九", "All Simples", "tanyao"],
  [13, "一盃口", "Pure Double Sequence", "iipeikou"],
  [14, "平和", "Pinfu", "pinfu"],
  [15, "混全帯幺九", "Half Outside Hand", "chanta"],
  [16, "一気通貫", "Pure Straight", "ittsu"],
  [17, "三色同順", "Mixed Triple Sequence", "sanshokuDoujun"],
  [18, "ダブル立直", "Double Riichi", "doubleRiichi"],
  [19, "三色同刻", "Triple Triplets", "sanshokuDoukou"],
  [20, "三槓子", "Three Quads", "sankantsu"],
  [21, "対々和", "All Triplets", "toitoi"],
  [22, "三暗刻", "Three Concealed Triplets", "sanankou"],
  [23, "小三元", "Little Three Dragons", "shousangen"],
  [24, "混老頭", "All Terminals and Honors", "honroutou"],
  [25, "七対子", "Seven Pairs", "chiitoitsu"],
  [26, "純全帯幺九", "Fully Outside Hand", "junchan"],
  [27, "混一色", "Half Flush", "honitsu"],
  [28, "二盃口", "Twice Pure Double Sequence", "ryanpeikou"],
  [29, "清一色", "Full Flush", "chinitsu"],
  [30, "一発", "Ippatsu", "ippatsu"],
  [31, "ドラ", "Dora", "dora"],
  [32, "赤ドラ", "Red Five", "akaDora"],
  [33, "裏ドラ", "Ura Dora", "uraDora"],
  [35, "天和", "Blessing of Heaven", "tenhou"],
  [36, "地和", "Blessing of Earth", "chiihou"],
  [37, "大三元", "Big Three Dragons", "daisangen"],
  [38, "四暗刻", "Four Concealed Triplets", "suuankou"],
  [39, "字一色", "All Honors", "tsuuiisou"],
  [40, "緑一色", "All Green", "ryuuiisou"],
  [41, "清老頭", "All Terminals", "chinroutou"],
  [42, "国士無双", "Thirteen Orphans", "kokushiMusou"],
  [43, "小四喜", "Four Little Winds", "shousuushii"],
  [44, "四槓子", "Four Quads", "suukantsu"],
  [45, "九蓮宝燈", "Nine Gates", "chuurenPoutou"],
  [47, "純正九蓮宝燈", "True Nine Gates", "junseiChuurenPoutou"],
  [48, "四暗刻単騎", "Single-wait Four Concealed Triplets", "suuankouTanki"],
  [49, "国士無双十三面待ち", "Thirteen-wait Thirteen Orphans", "kokushiMusou13"],
  [50, "大四喜", "Four Big Winds", "daisuushii"],
  [59, "人和", "Hand of Man", "renhou"],
];

describe("parseScoreText", () => {
  it("reads ron values", () => {
    expect(parseScoreText("30符1飜1000点")).toEqual({ fu: 30, han: 1, points: 1000 });
    expect(parseScoreText("40符2飜2600点")).toEqual({ fu: 40, han: 2, points: 2600 });
    expect(parseScoreText("満貫8000点")).toEqual({ limit: "mangan", points: 8000 });
    expect(parseScoreText("跳満18000点")).toEqual({ limit: "haneman", points: 18000 });
    expect(parseScoreText("倍満16000点")).toEqual({ limit: "baiman", points: 16000 });
    expect(parseScoreText("三倍満36000点")).toEqual({ limit: "sanbaiman", points: 36000 });
    expect(parseScoreText("役満32000点")).toEqual({ limit: "yakuman", points: 32000 });
    expect(parseScoreText("数え役満48000点")).toEqual({ limit: "yakuman", points: 48000 });
  });

  it("adds up tsumo payments", () => {
    // Non-dealer tsumo: each non-dealer pays the first value, the dealer the second.
    expect(parseScoreText("30符2飜500-1000点")).toEqual({ fu: 30, han: 2, points: 2000 });
    expect(parseScoreText("満貫2000-4000点")).toEqual({ limit: "mangan", points: 8000 });
    // Dealer tsumo: "∀" means everyone pays the same.
    expect(parseScoreText("30符4飜3900点∀")).toEqual({ fu: 30, han: 4, points: 11700 });
    expect(parseScoreText("跳満6000点∀")).toEqual({ limit: "haneman", points: 18000 });
  });

  it("reads English spellings", () => {
    expect(parseScoreText("Mangan 8000pts")).toEqual({ limit: "mangan", points: 8000 });
    expect(parseScoreText("30fu 2han 2000")).toEqual({ fu: 30, han: 2, points: 2000 });
  });

  it("skips text far longer than any real score, without scanning it", () => {
    // Real score texts are at most a few dozen characters. Long runs of digits and spaces made the
    // score patterns backtrack for seconds.
    const long = ["1".repeat(20_000), `1${" ".repeat(2_500)}x`, `${"9".repeat(200)}点`];
    const start = performance.now();
    for (const text of long) {
      expect(parseScoreText(text)).toEqual({});
    }
    expect(performance.now() - start).toBeLessThan(1000);
    expect(parseScoreText(`${" ".repeat(60)}30符1飜1000点`)).toEqual({
      fu: 30,
      han: 1,
      points: 1000,
    });
  });
});

describe("parseYakuText", () => {
  it("reads han and yakuman", () => {
    expect(parseYakuText("立直(1飜)")).toEqual({ key: "riichi", han: 1 });
    expect(parseYakuText("役牌 白(1飜)")).toEqual({ key: "haku", han: 1 });
    expect(parseYakuText("場風 東(1飜)")).toEqual({ key: "roundWindEast", han: 1 });
    expect(parseYakuText("ドラ(3飜)")).toEqual({ key: "dora", han: 3 });
    expect(parseYakuText("裏ドラ(0飜)")).toEqual({ key: "uraDora", han: 0 });
    expect(parseYakuText("大三元(役満)")).toEqual({ key: "daisangen", han: 13, yakuman: true });
    expect(parseYakuText("国士無双１３面(ダブル役満)")).toEqual({
      key: "kokushiMusou13",
      han: 26,
      yakuman: true,
    });
  });

  it("falls back to English and romaji names", () => {
    expect(parseYakuText("Riichi(1飜)")).toEqual({ key: "riichi", han: 1 });
    expect(parseYakuText("Ura Dora(0飜)")).toEqual({ key: "uraDora", han: 0 });
    expect(parseYakuText("Red Five(2飜)")).toEqual({ key: "akaDora", han: 2 });
    expect(parseYakuText("All Simples(1han)")).toEqual({ key: "tanyao", han: 1 });
  });

  it.each(TENSOUL_YAKU)("reads tensoul's Mahjong Soul yaku %i (%s, %s)", (_, jp, en, key) => {
    expect(parseYakuText(`${jp}(1飜)`)).toEqual({ key, han: 1 });
    expect(parseYakuText(`${en}(1飜)`)).toEqual({ key, han: 1 });
    // tensoul writes yakuman as "(役満)".
    expect(parseYakuText(`${jp}(役満)`)).toEqual({ key, han: 13, yakuman: true });
  });

  it("keeps the text of unknown yaku", () => {
    expect(parseYakuText("謎の役(2飜)")).toEqual({ key: null, raw: "謎の役", han: 2 });
    expect(parseYakuText("???")).toEqual({ key: null, raw: "???", han: 0 });
  });

  it("does not read text far longer than any real yaku entry", () => {
    const text = `a${" ".repeat(50_000)}(`;
    const start = performance.now();
    const entry = parseYakuText(text);
    expect(performance.now() - start).toBeLessThan(1000);
    // Worth 0 han, so parseRoundResult drops it.
    expect(entry).toMatchObject({ key: null, han: 0 });
    expect(entry.raw?.length).toBeLessThanOrEqual(100);
    expect(parseYakuText("Single-wait Four Concealed Triplets(ダブル役満)")).toEqual({
      key: "suuankouTanki",
      han: 26,
      yakuman: true,
    });
  });
});

describe("parseRoundResult", () => {
  it("reads multiple ron", () => {
    const result = parseRoundResult([
      "和了",
      [0, 0, -32000, 33000],
      [3, 2, 3, "役満32000点", "四槓子(役満)"],
      [16000, 0, -16000, 0],
      [0, 2, 0, "倍満16000点", "立直(1飜)", "役牌 白(1飜)", "ドラ(2飜)", "裏ドラ(4飜)"],
    ]);
    expect(result).toEqual({
      kind: "win",
      wins: [
        {
          seat: 3,
          from: 2,
          deltas: [0, 0, -32000, 33000],
          han: 13,
          limit: "yakuman",
          points: 32000,
          yaku: [{ key: "suukantsu", han: 13, yakuman: true }],
        },
        {
          seat: 0,
          from: 2,
          deltas: [16000, 0, -16000, 0],
          han: 8,
          limit: "baiman",
          points: 16000,
          yaku: [
            { key: "riichi", han: 1 },
            { key: "haku", han: 1 },
            { key: "dora", han: 2 },
            { key: "uraDora", han: 4 },
          ],
        },
      ],
    });
  });

  it("drops yaku worth 0 han", () => {
    const result = parseRoundResult([
      "和了",
      [-2600, 3600, 0, 0],
      [1, 0, 1, "40符2飜2600点", "立直(1飜)", "ドラ(1飜)", "裏ドラ(0飜)"],
    ]);
    expect(result.kind === "win" && result.wins[0]).toEqual({
      seat: 1,
      from: 0,
      deltas: [-2600, 3600, 0, 0],
      fu: 40,
      han: 2,
      points: 2600,
      yaku: [
        { key: "riichi", han: 1 },
        { key: "dora", han: 1 },
      ],
    });
  });

  it("only reports pao when the liable seat is neither the winner nor the dealer-in", () => {
    const pao = parseRoundResult(["和了", [0, 0, -32000, 32000], [3, 3, 2, "役満32000点"]]);
    expect(pao.kind === "win" && pao.wins[0]?.pao).toBe(2);
    const plain = parseRoundResult(["和了", [0, 0, -32000, 32000], [3, 2, 2, "役満32000点"]]);
    expect(plain.kind === "win" && plain.wins[0]?.pao).toBeUndefined();
  });

  it("maps draw names to reasons", () => {
    const reasons = [
      ["流局", "exhaustive"],
      ["流し満貫", "nagashiMangan"],
      ["九種九牌", "kyuushuKyuuhai"],
      ["四家立直", "suuchaRiichi"],
      ["三家和了", "sanchaHou"],
      ["四槓散了", "suukaikan"],
      ["四風連打", "suufonRenda"],
      // tensoul's spellings for Mahjong Soul logs.
      ["四開槓", "suukaikan"],
      ["三家和", "sanchaHou"],
      ["something else", "unknown"],
    ];
    for (const [status, reason] of reasons) {
      expect(parseRoundResult([status])).toMatchObject({ kind: "ryukyoku", reason });
    }
  });

  it("infers tenpai seats from tenpai payments", () => {
    expect(parseRoundResult(["流局", [-3000, 1000, 1000, 1000]])).toEqual({
      kind: "ryukyoku",
      reason: "exhaustive",
      deltas: [-3000, 1000, 1000, 1000],
      tenpai: [1, 2, 3],
    });
    expect(parseRoundResult(["全員聴牌"])).toMatchObject({ tenpai: [0, 1, 2, 3] });
    expect(parseRoundResult(["全員不聴"])).toMatchObject({ tenpai: [] });
    expect(parseRoundResult(["流局"])).toEqual({
      kind: "ryukyoku",
      reason: "exhaustive",
      deltas: [0, 0, 0, 0],
    });
    expect(parseRoundResult(["流し満貫", [12000, -4000, -4000, -4000]])).toEqual({
      kind: "ryukyoku",
      reason: "nagashiMangan",
      deltas: [12000, -4000, -4000, -4000],
    });
  });

  it("rejects malformed results", () => {
    expect(() => parseRoundResult("和了")).toThrow();
    expect(() => parseRoundResult(["和了"])).toThrow();
    expect(() => parseRoundResult(["和了", [0, 0, 0], [0, 1, 0, "満貫8000点"]])).toThrow();
    expect(() => parseRoundResult(["和了", [0, 0, 0, 0], [7, 1, 0, "満貫8000点"]])).toThrow();
  });
});

describe("three-player results", () => {
  it("adds up tsumo payments with one payer fewer (Tenhou's tsumo loss)", () => {
    // Each of the two others pays what they would with four players.
    expect(parseScoreText("30符2飜1000点∀", 3)).toEqual({ fu: 30, han: 2, points: 2000 });
    expect(parseScoreText("20符3飜700-1300点", 3)).toEqual({ fu: 20, han: 3, points: 2000 });
    expect(parseScoreText("満貫2000-4000点", 3)).toEqual({ limit: "mangan", points: 6000 });
    expect(parseScoreText("倍満8000点∀", 3)).toEqual({ limit: "baiman", points: 16000 });
    // A ron is paid by one player either way.
    expect(parseScoreText("満貫8000点", 3)).toEqual({ limit: "mangan", points: 8000 });
  });

  it("pads three deltas with 0 for the empty seat 3", () => {
    const result = parseRoundResult(
      ["和了", [-1000, 2000, -1000], [1, 1, 1, "30符2飜1000点∀", "役牌 白(1飜)", "ドラ(1飜)"]],
      3,
    );
    expect(result).toEqual({
      kind: "win",
      wins: [
        {
          seat: 1,
          from: 1,
          deltas: [-1000, 2000, -1000, 0],
          fu: 30,
          han: 2,
          points: 2000,
          yaku: [
            { key: "haku", han: 1 },
            { key: "dora", han: 1 },
          ],
        },
      ],
    });
    // Four-player results need four deltas.
    expect(() =>
      parseRoundResult(["和了", [-1000, 2000, -1000], [1, 1, 1, "30符2飜1000点∀"]]),
    ).toThrow(LogParseError);
  });

  it("reads a double ron", () => {
    const result = parseRoundResult(
      [
        "和了",
        [8000, -8000, 0, 0],
        [0, 1, 0, "満貫8000点", "立直(1飜)", "ドラ(4飜)"],
        [0, -2000, 2000, 0],
        [2, 1, 2, "30符2飜2000点", "役牌 中(1飜)", "ドラ(1飜)"],
      ],
      3,
    );
    expect(result.kind === "win" && result.wins.map(({ seat, from }) => [seat, from])).toEqual([
      [0, 1],
      [2, 1],
    ]);
  });

  it("keeps the empty seat 3 out of wins", () => {
    const win = (deltas: number[], info: unknown[]) => () =>
      parseRoundResult(["和了", deltas, info], 3);
    expect(win([0, 0, 0, 0], [3, 3, 3, "満貫6000点∀"])).toThrow(LogParseError);
    expect(win([0, 0, 0, 0], [0, 3, 0, "満貫8000点"])).toThrow(LogParseError);
    expect(win([8000, 0, 0, -8000], [0, 2, 0, "満貫8000点"])).toThrow(LogParseError);
    // A liable seat that does not play is no pao, like any other value that is not a seat.
    const pao = parseRoundResult(
      ["和了", [32000, -16000, -16000, 0], [0, 0, 3, "役満16000点∀", "大三元(役満)"]],
      3,
    );
    expect(pao.kind === "win" && pao.wins[0]?.pao).toBeUndefined();
    const real = parseRoundResult(
      ["和了", [32000, 0, -32000, 0], [0, 0, 2, "役満16000点∀", "大三元(役満)"]],
      3,
    );
    expect(real.kind === "win" && real.wins[0]).toMatchObject({ pao: 2, points: 32000 });
  });

  it("reads draws with four, three or no deltas, all tenpai and all noten", () => {
    expect(parseRoundResult(["流局", [2000, -1000, -1000, 0]], 3)).toEqual({
      kind: "ryukyoku",
      reason: "exhaustive",
      deltas: [2000, -1000, -1000, 0],
      tenpai: [0],
    });
    expect(parseRoundResult(["流局", [1000, -2000, 1000]], 3)).toEqual({
      kind: "ryukyoku",
      reason: "exhaustive",
      deltas: [1000, -2000, 1000, 0],
      tenpai: [0, 2],
    });
    expect(parseRoundResult(["流局"], 3)).toEqual({
      kind: "ryukyoku",
      reason: "exhaustive",
      deltas: [0, 0, 0, 0],
    });
    expect(parseRoundResult(["全員聴牌"], 3)).toMatchObject({ tenpai: [0, 1, 2] });
    expect(parseRoundResult(["全員不聴"], 3)).toMatchObject({ tenpai: [] });
    expect(parseRoundResult(["九種九牌"], 3)).toEqual({
      kind: "ryukyoku",
      reason: "kyuushuKyuuhai",
      deltas: [0, 0, 0, 0],
    });
  });

  it("rejects a draw that gives the empty seat 3 points, like a win", () => {
    const draw = (deltas: number[]) => () => parseRoundResult(["流局", deltas], 3);
    expect(draw([1000, 1000, -3000, 1000])).toThrow(LogParseError);
    expect(draw([1000, 1000, -3000, 1000])).toThrow(/draw gives the empty seat 3 points/);
    expect(draw([0, 0, 0, -1000])).toThrow(LogParseError);
    expect(() => parseRoundResult(["流局", [2000, -1000, -1000, 0]], 3)).not.toThrow();
    // Four players: the same list is four real payments.
    expect(parseRoundResult(["流局", [1000, 1000, -3000, 1000]], 4)).toEqual({
      kind: "ryukyoku",
      reason: "exhaustive",
      deltas: [1000, 1000, -3000, 1000],
      tenpai: [0, 1, 3],
    });
  });

  it("reads Mahjong Soul's nukidora and keeps Tenhou's North tiles inside ドラ", () => {
    expect(parseYakuText("抜きドラ(2飜)")).toEqual({ key: "nukidora", han: 2 });
    expect(parseYakuText("Kita(1飜)")).toEqual({ key: "nukidora", han: 1 });
    expect(parseYakuText("ドラ(4飜)")).toEqual({ key: "dora", han: 4 });
  });
});
