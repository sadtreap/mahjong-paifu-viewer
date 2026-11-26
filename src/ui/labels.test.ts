import { describe, expect, it } from "vitest";
import type { GameRules, Quad, WinEvent } from "../core/model";
import { YAKU_KEYS } from "../core/yaku";
import { MESSAGES } from "../i18n/messages";
import {
  discardLabel,
  formatDelta,
  formatPoints,
  logDate,
  meldLabel,
  playerNames,
  rankLabel,
  resultSummary,
  roundLabel,
  roundShortLabel,
  rulesLabel,
  sourceLabel,
  standings,
  tileLabel,
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

describe("players and rules", () => {
  it("falls back to a numbered name for blank names", () => {
    expect(playerNames(en, [{ name: "A" }, { name: " " }, { name: "" }, { name: "D" }])).toEqual([
      "A",
      "Player 2",
      "Player 3",
      "D",
    ]);
  });

  it("localizes Tenhou rules from the structured fields", () => {
    const rules = {
      redFives: true,
      length: "south",
      room: "phoenix",
      openTanyao: true,
      fast: false,
      description: "鳳南喰赤",
    } as const;
    expect(rulesLabel(en, rules)).toBe("Phoenix room · East-South game · Open tanyao · Red fives");
    expect(rulesLabel(ko, rules)).toBe("봉황탁 · 반장전 · 쿠이탕 있음 · 적도라 있음");
    expect(rulesLabel(ja, rules)).toBe("鳳凰卓 · 東南戦 · 喰いタンあり · 赤あり");

    const fast: GameRules = {
      redFives: false,
      length: "east",
      room: "upper",
      openTanyao: false,
      fast: true,
    };
    expect(rulesLabel(en, fast)).toBe(
      "Upper room · East-only game · No open tanyao · No red fives · Fast",
    );
    expect(rulesLabel(ja, fast)).toBe("上級卓 · 東風戦 · 喰いタンなし · 赤なし · 高速");
  });

  it("falls back to the source's rule text without the structured fields, then summarizes", () => {
    expect(rulesLabel(en, { redFives: true, description: "玉の間南喰赤" })).toBe("玉の間南喰赤");
    expect(rulesLabel(en, { redFives: false, length: "east" })).toBe(
      "East-only game · No red fives",
    );
  });
});

describe("rankLabel", () => {
  it("localizes Tenhou ranks from the dan index", () => {
    const player = (danIndex: number) => ({ name: "A", rank: "raw", danIndex });
    expect([0, 1, 9, 10, 16, 19, 20].map((dan) => rankLabel(en, player(dan)))).toEqual([
      "Novice",
      "9 kyu",
      "1 kyu",
      "1 dan",
      "7 dan",
      "10 dan",
      "Tenhoui",
    ]);
    expect([0, 1, 10, 16, 19, 20].map((dan) => rankLabel(ko, player(dan)))).toEqual([
      "신인",
      "9급",
      "초단",
      "7단",
      "10단",
      "천봉위",
    ]);
    expect([0, 1, 9, 10, 16, 19, 20].map((dan) => rankLabel(ja, player(dan)))).toEqual([
      "新人",
      "9級",
      "1級",
      "初段",
      "七段",
      "十段",
      "天鳳位",
    ]);
  });

  it("falls back to the source's rank text without a known dan index", () => {
    expect(rankLabel(en, { name: "A", rank: " 雀豪★1 " })).toBe("雀豪★1");
    expect(rankLabel(en, { name: "A", rank: "七段", danIndex: 21 })).toBe("七段");
    expect(rankLabel(en, { name: "A", danIndex: 2.5 })).toBeUndefined();
    expect(rankLabel(en, { name: "A" })).toBeUndefined();
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
    expect(formatDelta("en", 8000)).toBe("+8,000");
    expect(formatDelta("en", -2000)).toBe("-2,000");
    expect(formatDelta("en", 0)).toBe("0");
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

describe("roundShortLabel", () => {
  it("is short in every language", () => {
    const round = { wind: 0 as const, number: 3, honba: 1 };
    expect(roundShortLabel(en, round)).toBe("E3-1");
    expect(roundShortLabel(ko, round)).toBe("동3-1");
    expect(roundShortLabel(ja, round)).toBe("東3-1");
    expect(roundShortLabel(en, { wind: 1, number: 2, honba: 0 })).toBe("S2");
  });
});

describe("rulesLabel with the player count", () => {
  const rules: GameRules = { redFives: true, length: "east", room: "general", openTanyao: true };

  it("marks three-player games, structured or not", () => {
    expect(rulesLabel(en, rules, 3)).toBe(
      "Three-player · General room · East-only game · Open tanyao · Red fives",
    );
    expect(rulesLabel(en, rules, 4)).toBe(
      "General room · East-only game · Open tanyao · Red fives",
    );
    expect(rulesLabel(en, { redFives: true, description: "Gold room" }, 3)).toBe(
      "Three-player · Gold room",
    );
    expect(rulesLabel(ko, rules, 3).startsWith("3인 대국")).toBe(true);
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

describe("source", () => {
  it("reads the day from a Tenhou log id", () => {
    expect(logDate("en", "2000050417gm-0089-0000-0123abcd")).toBe("May 4, 2000");
    expect(logDate("en", "2000023117gm-0089-0000-0123abcd")).toBeNull();
    expect(logDate("en", "not-an-id")).toBeNull();
    expect(logDate("en", undefined)).toBeNull();
  });

  it("names the format, with the day when known", () => {
    expect(sourceLabel(en, "en", { format: "mjlog", id: "2000050417gm-0089-0000-0123abcd" })).toBe(
      "Tenhou mjlog XML · May 4, 2000",
    );
    expect(sourceLabel(en, "en", { format: "mjai" })).toBe("mjai JSONL");
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
