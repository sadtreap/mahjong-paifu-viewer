import { describe, expect, it } from "vitest";
import { arrangementFor, SHORT, WIDE } from "./arrangement";

/** Evaluates the media features the arrangement queries use, for a viewport in CSS pixels. */
function matches(query: string, width: number, height: number): boolean {
  return query.split(" and ").every((feature) => {
    const ratio = /^\(min-aspect-ratio: (\d+) \/ (\d+)\)$/.exec(feature);
    if (ratio) {
      return width * Number(ratio[2]) >= height * Number(ratio[1]);
    }
    const size = /^\((min|max)-height: (\d+)px\)$/.exec(feature);
    if (!size) {
      throw new Error(`unsupported media feature: ${feature}`);
    }
    return size[1] === "min" ? height >= Number(size[2]) : height <= Number(size[2]);
  });
}

const arrangementAt = (width: number, height: number) =>
  arrangementFor(matches(WIDE, width, height), matches(SHORT, width, height));

describe("arrangement", () => {
  it.each([
    [1920, 950, "wide"],
    [1440, 790, "wide"],
    [1366, 650, "wide"],
    [1024, 700, "wide"],
    [1024, 768, "wide"],
    [626, 481, "wide"],
    [844, 340, "short"],
    [844, 390, "short"],
    [667, 375, "short"],
    [768, 480, "short"],
    [1000, 900, "stack"],
    [768, 1024, "stack"],
    [390, 664, "stack"],
    [390, 844, "stack"],
    [320, 454, "stack"],
    // Too tall for "short" and too square for "wide".
    [700, 480, "stack"],
    [625, 481, "stack"],
  ] as const)("puts %ix%i in %s", (width, height, expected) => {
    expect(arrangementAt(width, height)).toBe(expected);
  });

  it("never matches both queries", () => {
    for (let width = 200; width <= 2600; width += 37) {
      for (const height of [200, 300, 479, 480, 481, 482, 600, 900, 1400]) {
        expect(matches(WIDE, width, height) && matches(SHORT, width, height)).toBe(false);
      }
    }
  });

  it("maps the two results to an arrangement", () => {
    expect(arrangementFor(true, false)).toBe("wide");
    expect(arrangementFor(false, true)).toBe("short");
    expect(arrangementFor(false, false)).toBe("stack");
  });
});
