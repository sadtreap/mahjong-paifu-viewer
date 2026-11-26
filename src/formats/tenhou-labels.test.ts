import { describe, expect, it } from "vitest";
import {
  parseTenhouRuleText,
  TENHOU_DAN_LABELS,
  tenhouDanIndex,
  tenhouRuleText,
} from "./tenhou-labels";

describe("tenhouDanIndex", () => {
  it("maps Tenhou dan labels to the mjlog dan index", () => {
    expect(tenhouDanIndex("新人")).toBe(0);
    expect(tenhouDanIndex("９級")).toBe(1);
    expect(tenhouDanIndex("１級")).toBe(9);
    expect(tenhouDanIndex("初段")).toBe(10);
    expect(tenhouDanIndex("七段")).toBe(16);
    expect(tenhouDanIndex("十段")).toBe(19);
    expect(tenhouDanIndex("天鳳位")).toBe(20);
    // How Tenhou's tenhou.net/6 export writes it.
    expect(tenhouDanIndex("天鳳")).toBe(20);
    TENHOU_DAN_LABELS.forEach((label, index) => {
      expect(tenhouDanIndex(label)).toBe(index);
    });
  });

  it("accepts half-width kyu digits and surrounding spaces", () => {
    expect(tenhouDanIndex("6級")).toBe(4);
    expect(tenhouDanIndex(" 四段 ")).toBe(13);
  });

  it("knows nothing else", () => {
    // Mahjong Soul ranks as tensoul writes them stay raw text.
    expect(tenhouDanIndex("雀豪★1")).toBeUndefined();
    expect(tenhouDanIndex("Expert 1")).toBeUndefined();
    expect(tenhouDanIndex("")).toBeUndefined();
    expect(tenhouDanIndex("constructor")).toBeUndefined();
  });
});

describe("parseTenhouRuleText", () => {
  it("reads Tenhou's rule text", () => {
    expect(parseTenhouRuleText("鳳南喰赤")).toEqual({
      players: 4,
      room: "phoenix",
      length: "south",
      openTanyao: true,
      redFives: true,
      fast: false,
    });
    expect(parseTenhouRuleText("上東喰赤速")).toEqual({
      players: 4,
      room: "upper",
      length: "east",
      openTanyao: true,
      redFives: true,
      fast: true,
    });
    expect(parseTenhouRuleText("般東喰")).toEqual({
      players: 4,
      room: "general",
      length: "east",
      openTanyao: true,
      redFives: false,
      fast: false,
    });
    expect(parseTenhouRuleText("特南赤")).toMatchObject({ room: "special", openTanyao: false });
    // Newer exports start with the player count.
    expect(parseTenhouRuleText("四鳳南喰赤")).toMatchObject({ room: "phoenix", length: "south" });
    // Three-player text starts with 三.
    expect(parseTenhouRuleText("三鳳南喰赤")).toMatchObject({ players: 3, room: "phoenix" });
    expect(parseTenhouRuleText("三般東喰赤速")).toMatchObject({ players: 3, fast: true });
  });

  it("does not guess at other text", () => {
    expect(parseTenhouRuleText("Gold Room South")).toBeUndefined();
    expect(parseTenhouRuleText("玉の間南喰赤")).toBeUndefined();
    expect(parseTenhouRuleText("三玉の間南喰赤")).toBeUndefined();
    expect(parseTenhouRuleText("鳳南喰赤祝５")).toBeUndefined();
    expect(parseTenhouRuleText("")).toBeUndefined();
  });

  it("reads back what tenhouRuleText writes", () => {
    for (const room of ["general", "upper", "special", "phoenix"] as const) {
      for (const flags of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
        const rules = {
          players: flags & 8 ? (3 as const) : (4 as const),
          room,
          length: flags & 1 ? ("south" as const) : ("east" as const),
          openTanyao: (flags & 2) !== 0,
          redFives: (flags & 4) !== 0,
          fast: flags === 3,
        };
        expect(parseTenhouRuleText(tenhouRuleText(rules))).toEqual(rules);
      }
    }
    const phoenix = {
      room: "phoenix",
      length: "south",
      openTanyao: true,
      redFives: true,
      fast: false,
    } as const;
    expect(tenhouRuleText({ ...phoenix, players: 4 })).toBe("鳳南喰赤");
    expect(tenhouRuleText({ ...phoenix, players: 3 })).toBe("三鳳南喰赤");
  });
});
