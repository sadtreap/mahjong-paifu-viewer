import { describe, expect, it } from "vitest";
import type { Quad, WinEvent } from "../core/model";
import { YAKU_KEYS } from "../core/yaku";
import { MESSAGES } from "../i18n/messages";
import {
  discardLabel,
  formatDelta,
  formatPoints,
  meldLabel,
  playerNames,
  resultSummary,
  roundLabel,
  standings,
  tileLabel,
  winValue,
  winValueLabel,
  yakuLabel,
  yakuValueLabel,
} from "./labels";

const { en, ko, ja } = MESSAGES;

describe("tileLabel", () => {
  it("names red fives in each language", () => {
    expect(tileLabel(en, "0m")).toBe("5 Man (red)");
    expect(tileLabel(ko, "0m")).toBe("적5만");
    expect(tileLabel(ja, "0m")).toBe("赤五萬");
  });

  it("names plain number tiles and honors", () => {
    expect(tileLabel(en, "3p")).toBe("3 Pin");
    expect(tileLabel(ko, "9s")).toBe("9삭");
    expect(tileLabel(ja, "1p")).toBe("一筒");
    expect(tileLabel(en, "1z")).toBe("East");
    expect(tileLabel(ko, "6z")).toBe("발");
    expect(tileLabel(ja, "5z")).toBe("白");
  });

  it("names unknown tiles", () => {
    expect(tileLabel(en, "?")).toBe(en.tiles.unknown);
  });
});

describe("roundLabel", () => {
  it("formats the round with honba in each language", () => {
    const round = { wind: 0, number: 1, honba: 2 } as const;
    expect(roundLabel(en, round)).toBe("East 1, 2 honba");
    expect(roundLabel(ko, round)).toBe("동 1국 2본장");
    expect(roundLabel(ja, round)).toBe("東1局 2本場");
  });

  it("leaves out zero honba", () => {
    const round = { wind: 1, number: 4, honba: 0 } as const;
    expect(roundLabel(en, round)).toBe("South 4");
    expect(roundLabel(ko, round)).toBe("남 4국");
    expect(roundLabel(ja, round)).toBe("南4局");
  });
});

describe("playerNames", () => {
  it("falls back to a numbered name for blank names", () => {
    expect(playerNames(en, [{ name: "A" }, { name: " " }, { name: "" }, { name: "D" }])).toEqual([
      "A",
      "Player 2",
      "Player 3",
      "D",
    ]);
  });
});

describe("yaku labels", () => {
  it("has a name for every yaku in every language", () => {
    for (const messages of [en, ko, ja]) {
      for (const key of YAKU_KEYS) {
        expect(messages.yaku[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("uses standard terms", () => {
    expect(yakuLabel(en, { key: "haku", han: 1 })).toBe("Yakuhai: Haku");
    expect(yakuLabel(ko, { key: "tanyao", han: 1 })).toBe("탕야오");
    expect(yakuLabel(ja, { key: "menzenTsumo", han: 1 })).toBe("門前清自摸和");
  });

  it("falls back to the source text for unknown yaku", () => {
    expect(yakuLabel(en, { key: null, raw: "Some yaku", han: 2 })).toBe("Some yaku");
    expect(yakuLabel(en, { key: null, han: 2 })).toBe(en.result.unknownYaku);
  });

  it("shows han, or the yakuman multiple", () => {
    expect(yakuValueLabel(en, { key: "riichi", han: 1 })).toBe("1 han");
    expect(yakuValueLabel(ja, { key: "dora", han: 3 })).toBe("3飜");
    expect(yakuValueLabel(en, { key: "suuankou", han: 13, yakuman: true })).toBe("Yakuman");
    expect(yakuValueLabel(ko, { key: "suuankouTanki", han: 26, yakuman: true })).toBe("2배 역만");
  });
});

describe("board labels", () => {
  it("describes pond tiles", () => {
    const label = discardLabel(
      en,
      { tile: "9m", tsumogiri: false, riichi: true, called: true },
      false,
    );
    expect(label).toBe("9 Man, riichi declaration, called");
    expect(
      discardLabel(en, { tile: "1z", tsumogiri: true, riichi: false, called: false }, true),
    ).toBe("East, discarded right after drawing, last discard");
  });

  it("describes melds", () => {
    expect(meldLabel(en, { type: "pon", tiles: ["5p", "5p"], from: 1, calledTile: "0p" })).toBe(
      "Pon: 5 Pin, 5 Pin, 5 Pin (red)",
    );
  });
});

describe("numbers", () => {
  it("formats points and signed deltas", () => {
    expect(formatPoints("en", 25000)).toBe("25,000");
    expect(formatPoints("en", -4900)).toBe("−4,900");
    expect(formatDelta("en", 8000)).toBe("+8,000");
    expect(formatDelta("en", -2000)).toBe("−2,000");
    expect(formatDelta("en", 0)).toBe("±0");
    expect(formatDelta("ko", -12300, false)).toBe("−12300");
  });
});

describe("standings", () => {
  it("ranks by score, breaking ties by starting seat", () => {
    expect(standings([30000, 20000, 30000, 20000]).map((s) => [s.seat, s.place])).toEqual([
      [0, 1],
      [2, 2],
      [1, 3],
      [3, 4],
    ]);
  });
});

describe("standings with three players", () => {
  it("never ranks the empty chair", () => {
    const ranked = standings([30000, 40000, 38000, 0], 3);
    expect(ranked.map((s) => [s.seat, s.place])).toEqual([
      [1, 1],
      [2, 2],
      [0, 3],
    ]);
    // Even when the empty chair's placeholder would outrank a negative score.
    expect(standings([-5000, 60000, 50000, 0], 3).map((s) => s.seat)).toEqual([1, 2, 0]);
  });
});

describe("results", () => {
  const names: Quad<string> = ["A", "B", "C", "D"];
  const win = (extra: Partial<WinEvent>): WinEvent => ({
    type: "win",
    seat: 0,
    from: 0,
    deltas: [12000, -4000, -4000, -4000],
    han: 6,
    fu: 30,
    limit: "haneman",
    points: 12000,
    ...extra,
  });

  it("names a win's value, without fu under a limit", () => {
    expect(winValueLabel(en, "en", win({}))).toBe("6 han · Haneman · 12,000 points");
    expect(winValueLabel(en, "en", win({ han: 2, fu: 40, limit: undefined, points: 2600 }))).toBe(
      "2 han · 40 fu · 2,600 points",
    );
    expect(
      winValueLabel(en, "en", win({ yaku: [{ key: "kokushiMusou13", han: 26, yakuman: true }] })),
    ).toBe("2× Yakuman · 12,000 points");
  });

  it("gives a win's value in two parts: how the hand counts, and its points", () => {
    expect(winValue(en, "en", win({}))).toEqual({
      count: "6 han · Haneman",
      points: "12,000 points",
    });
    expect(winValue(en, "en", win({ han: 2, fu: 40, limit: undefined, points: 2600 }))).toEqual({
      count: "2 han · 40 fu",
      points: "2,600 points",
    });
    // A limit hand is named instead of its fu, and a fu of zero is no fu.
    expect(winValue(en, "en", win({ han: 5, fu: 30, limit: "mangan" })).count).toBe(
      "5 han · Mangan",
    );
    expect(winValue(en, "en", win({ han: 1, fu: 0, limit: undefined })).count).toBe("1 han");
  });

  it("counts yakuman instead of han, adding up every yakuman of the hand", () => {
    const single = win({ limit: "yakuman", yaku: [{ key: "daisangen", han: 13, yakuman: true }] });
    expect(winValue(en, "en", single).count).toBe("Yakuman");
    const double = win({ yaku: [{ key: "kokushiMusou13", han: 26, yakuman: true }] });
    expect(winValue(en, "en", double).count).toBe("2× Yakuman");
    const two = win({
      limit: "yakuman",
      points: 64000,
      yaku: [
        { key: "daisangen", han: 13, yakuman: true },
        { key: "tsuuiisou", han: 13, yakuman: true },
      ],
    });
    expect(winValue(en, "en", two)).toEqual({ count: "2× Yakuman", points: "64,000 points" });
    // Dora beside a yakuman does not count.
    const withDora = win({
      yaku: [
        { key: "suuankou", han: 13, yakuman: true },
        { key: "dora", han: 2 },
      ],
    });
    expect(winValue(en, "en", withDora).count).toBe("Yakuman");
  });

  it("leaves out the part of a win's value the log does not have", () => {
    const bare = { han: undefined, fu: undefined, limit: undefined, points: undefined };
    expect(winValue(en, "en", win(bare))).toEqual({ count: "", points: null });
    expect(winValue(en, "en", win({ ...bare, points: 1000 }))).toEqual({
      count: "",
      points: "1,000 points",
    });
    expect(winValue(en, "en", win({ points: undefined }))).toEqual({
      count: "6 han · Haneman",
      points: null,
    });
    // The one-line label joins what there is.
    expect(winValueLabel(en, "en", win(bare))).toBe("");
    expect(winValueLabel(en, "en", win({ ...bare, points: 1000 }))).toBe("1,000 points");
    expect(winValueLabel(en, "en", win({ points: undefined }))).toBe("6 han · Haneman");
  });

  it("words a win's value in Korean and Japanese", () => {
    const plain = win({ han: 2, fu: 40, limit: undefined, points: 2600 });
    const yakuman = win({
      points: 64000,
      yaku: [{ key: "suuankouTanki", han: 26, yakuman: true }],
    });
    expect(winValue(ko, "ko", win({}))).toEqual({ count: "6판 · 하네만", points: "12,000점" });
    expect(winValue(ko, "ko", plain)).toEqual({ count: "2판 · 40부", points: "2,600점" });
    expect(winValue(ko, "ko", yakuman)).toEqual({ count: "2배 역만", points: "64,000점" });
    expect(winValue(ja, "ja", win({}))).toEqual({ count: "6飜 · 跳満", points: "12,000点" });
    expect(winValue(ja, "ja", plain)).toEqual({ count: "2飜 · 40符", points: "2,600点" });
    expect(winValue(ja, "ja", yakuman)).toEqual({ count: "2倍役満", points: "64,000点" });
    expect(winValueLabel(ja, "ja", plain)).toBe("2飜 · 40符 · 2,600点");
  });

  it("summarizes wins and draws in one line", () => {
    expect(resultSummary(en, [win({})], names, "en")).toBe(
      "A wins by tsumo · 6 han · Haneman · 12,000 points",
    );
    expect(
      resultSummary(
        en,
        [
          win({ seat: 1, from: 3 }),
          win({ seat: 2, from: 3, han: 1, fu: 30, limit: undefined, points: 1000 }),
        ],
        names,
        "en",
      ),
    ).toBe(
      "B wins by ron off D · 6 han · Haneman · 12,000 points / C wins by ron off D · 1 han · 30 fu · 1,000 points",
    );
    const draw = (tenpai?: Array<0 | 1 | 2 | 3>) =>
      resultSummary(
        en,
        [{ type: "ryukyoku", reason: "exhaustive", deltas: [0, 0, 0, 0], tenpai }],
        names,
        "en",
      );
    expect(draw([1, 2])).toBe("Exhaustive draw · tenpai: B and C");
    expect(draw([])).toBe("Exhaustive draw · nobody tenpai");
    expect(draw()).toBe("Exhaustive draw");
    expect(
      resultSummary(
        ja,
        [{ type: "ryukyoku", reason: "exhaustive", deltas: [0, 0, 0, 0], tenpai: [0, 2] }],
        names,
        "ja",
      ),
    ).toContain("聴牌：A、C");
  });
});

describe("ordinals", () => {
  it("formats English places", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(en.standings.place)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
    ]);
  });
});
