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

const english = arrays(MESSAGES.en);

describe.each(LOCALES.filter((locale) => locale !== "en"))("%s messages", (locale) => {
  const translated = arrays(MESSAGES[locale]);

  // The typecheck matches the keys but not the lengths of lists (hint pairs, formats, winds).
  it("has lists of the same length as English", () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [path, list] of english) {
      expect(translated.get(path)?.length, path).toBe(list.length);
    }
  });

  it("translates the first-use hint's pairs", () => {
    for (const pair of [...MESSAGES[locale].hint.mouse, ...MESSAGES[locale].hint.touch]) {
      expect(pair[0].length).toBeGreaterThan(0);
      expect(pair[1].length).toBeGreaterThan(0);
    }
    expect(MESSAGES[locale].hint.mouse).not.toEqual(MESSAGES.en.hint.mouse);
  });
});

describe("interpolated messages", () => {
  it.each(LOCALES)("lists waits, facts and notes in %s", (locale) => {
    const m = MESSAGES[locale];
    expect(m.table.waitsSr(["A", "B"], 6, true)).toMatch(/A.*B.*6/);
    expect(m.panel.cellLabel("E1", "C", "+3900", ["F1", "F2"], "Go")).toMatch(
      /E1.*C.*\+3900.*F1.*F2.*Go/,
    );
    expect(m.panel.cellLabel("E1", "C", "0", [], "Go")).not.toMatch(/[,、]\s*[.。]/);
    expect(m.panel.moveRow(3, "C", "9p", ["N1"])).toMatch(/3.*C.*9p.*N1/);
    expect(m.panel.moveRow(9, null, null, [])).toMatch(/9/);
    expect(m.panel.source("mjai", null)).toBe("mjai");
    expect(m.round.short(0, 3, 1)).toMatch(/3-1$/);
    expect(m.round.short(1, 2, 0)).toMatch(/2$/);
  });

  it("uses English plurals and ordinals", () => {
    const { en } = MESSAGES;
    expect(en.table.wallHand("C", 1)).toBe("C's hand, 1 tile face down");
    expect(en.table.wallHand("C", 13)).toBe("C's hand, 13 tiles face down");
    expect(en.table.waitsSr(["1 Man", "4 Man", "7 Man"], 6, false)).toBe(
      "Waits 1 Man, 4 Man and 7 Man, 6 left",
    );
    // A no-break space before each "·" keeps the separator off the start of a wrapped line.
    expect(en.ptip.head("C", 3, 3)).toBe("C\u00a0· 3rd discard\u00a0· turn 3");
    expect(en.ptip.headShort("C", 3)).toBe("C\u00a0· 3rd discard");
    expect(en.timeline.pinLabel("C", 11)).toBe("Go to C's 11th discard");
    expect(en.round.short(0, 3, 1)).toBe("E3-1");
    expect(en.panel.moveRow(3, "C", "9 Pin", ["tsumogiri"])).toBe("Turn 3, C: 9 Pin, tsumogiri");
  });
});
