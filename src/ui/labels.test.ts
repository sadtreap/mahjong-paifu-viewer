import { describe, expect, it } from "vitest";
import type { GameRules } from "../core/model";
import { YAKU_KEYS } from "../core/yaku";
import { MESSAGES } from "../i18n/messages";
import {
  discardLabel,
  formatDelta,
  formatPoints,
  meldLabel,
  playerNames,
  rankLabel,
  roundLabel,
  rulesLabel,
  standings,
  tileLabel,
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
