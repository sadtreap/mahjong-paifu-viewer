import { describe, expect, it } from "vitest";
import { LOCALES } from "../locales";
import { MESSAGES } from "./index";

/** Every array in a message tree, by its dotted path. */
function arrays(tree: unknown, path = ""): Map<string, readonly unknown[]> {
  const found = new Map<string, readonly unknown[]>();
  if (Array.isArray(tree)) {
    found.set(path, tree);
    tree.forEach((item, index) => {
      for (const [key, value] of arrays(item, `${path}[${index}]`)) {
        found.set(key, value);
      }
    });
  } else if (typeof tree === "object" && tree !== null) {
    for (const [key, value] of Object.entries(tree)) {
      for (const [inner, array] of arrays(value, path ? `${path}.${key}` : key)) {
        found.set(inner, array);
      }
    }
  }
  return found;
}

/** How many arguments every message that is a function takes, by its dotted path. */
function arities(tree: unknown, path = ""): Map<string, number> {
  const found = new Map<string, number>();
  if (typeof tree === "function") {
    found.set(path, tree.length);
  } else if (typeof tree === "object" && tree !== null && !Array.isArray(tree)) {
    for (const [key, value] of Object.entries(tree)) {
      for (const [inner, arity] of arities(value, path ? `${path}.${key}` : key)) {
        found.set(inner, arity);
      }
    }
  }
  return found;
}

const english = arrays(MESSAGES.en);

describe.each(LOCALES.filter((locale) => locale !== "en"))("%s messages", (locale) => {
  const translated = arrays(MESSAGES[locale]);

  // The typecheck matches the keys but not the lengths of lists (formats, winds, honors).
  it("has lists of the same length as English", () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [path, list] of english) {
      expect(translated.get(path)?.length, path).toBe(list.length);
    }
  });

  // A function that takes fewer arguments still type-checks, and silently drops what it is told.
  it("uses every argument English uses", () => {
    expect(Object.fromEntries(arities(MESSAGES[locale]))).toEqual(
      Object.fromEntries(arities(MESSAGES.en)),
    );
  });
});

describe("mahjong terms", () => {
  /** The strings in which a player meets each of the usual terms. */
  const used = (locale: "ko" | "ja") => {
    const m = MESSAGES[locale];
    return [
      m.round.name(0, 2, 1),
      m.info.deposits(2),
      m.transport.turn(8),
      m.captions.tsumo,
      m.captions.ron,
      m.captions.riichi,
      m.board.dora,
      m.table.waitsShort,
      m.table.shanten(1),
      m.table.tenpai,
      m.table.furiten,
      m.viewer.showAllHands,
      m.board.discards("A"),
      m.tools.pov,
    ];
  };

  it("uses the usual Korean terms", () => {
    expect(used("ko")).toEqual([
      "동 2국 1본장",
      "공탁 2",
      "8순",
      "쯔모",
      "론",
      "리치",
      "도라 표시패",
      "대기",
      "1샹텐",
      "텐파이",
      "후리텐",
      "모든 손패 보기",
      "A의 버림패",
      "시점",
    ]);
  });

  it("uses the usual Japanese terms", () => {
    expect(used("ja")).toEqual([
      "東2局 1本場",
      "供託 2",
      "8巡目",
      "ツモ",
      "ロン",
      "リーチ",
      "ドラ表示牌",
      "待ち",
      "1向聴",
      "聴牌",
      "フリテン",
      "全員の手牌を表示",
      "Aの捨て牌",
      "視点",
    ]);
  });
});

describe("interpolated messages", () => {
  it.each(LOCALES)("lists waits, names rounds and counts honba and deposits in %s", (locale) => {
    const m = MESSAGES[locale];
    expect(m.table.waitsSr(["A", "B"], 6, true)).toMatch(/A.*B.*6/);
    expect(m.round.name(1, 3, 0)).toMatch(/3/);
    expect(m.round.name(1, 3, 2)).toMatch(/3.*2/);
    expect(m.info.deposits(3)).toContain("3");
    expect(m.transport.turn(8)).toContain("8");
    expect(m.tools.povButton("W", "N")).toMatch(/W.*N/);
    expect(m.rounds.ron("A", "B")).toMatch(/A.*B/);
  });

  it("uses English plurals and ordinals", () => {
    const { en } = MESSAGES;
    expect(en.table.wallHand("C", 1)).toBe("C's hand, 1 tile face down");
    expect(en.table.wallHand("C", 13)).toBe("C's hand, 13 tiles face down");
    expect(en.table.waitsSr(["1 Man", "4 Man", "7 Man"], 6, false)).toBe(
      "Waits 1 Man, 4 Man and 7 Man, 6 left",
    );
    expect(en.round.name(0, 3, 1)).toBe("East 3, 1 honba");
    expect(en.info.deposits(1)).toBe("1 deposit");
    expect(en.info.deposits(2)).toBe("2 deposits");
    expect(en.standings.place(11)).toBe("11th");
  });
});
