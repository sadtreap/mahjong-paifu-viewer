import { describe, expect, it } from "vitest";
import {
  BREAKPOINT_QUERIES,
  BREAKPOINTS,
  breakpointFor,
  isPhoneBreakpoint,
  panelModeFor,
} from "./breakpoints";

/** Evaluates the small media-query subset the breakpoints use, for a viewport in CSS pixels. */
function matches(query: string, width: number, height: number): boolean {
  return query.split(" and ").every((feature) => {
    const match = /^\((orientation|min-width|max-width|min-height|max-height): (\w+?)(px)?\)$/.exec(
      feature,
    );
    if (!match) {
      throw new Error(`unsupported media feature: ${feature}`);
    }
    const [, name, value] = match;
    const px = Number(value);
    switch (name) {
      case "orientation":
        return (value === "landscape") === width > height;
      case "min-width":
        return width >= px;
      case "max-width":
        return width <= px;
      case "min-height":
        return height >= px;
      default:
        return height <= px;
    }
  });
}

const VIEWPORTS: ReadonlyArray<readonly [number, number, string]> = [
  [1920, 1080, "wide"],
  [1440, 900, "wide"],
  [1280, 720, "wide"],
  [1200, 501, "wide"],
  [1199, 768, "laptop"],
  [1024, 768, "laptop"],
  [1200, 500, "phoneLandscape"],
  [844, 390, "phoneLandscape"],
  [667, 375, "phoneLandscape"],
  [740, 360, "phoneLandscape"],
  [768, 1024, "tabletPortrait"],
  [600, 900, "tabletPortrait"],
  [600, 600, "tabletPortrait"],
  [599, 900, "phonePortrait"],
  [390, 844, "phonePortrait"],
  [375, 553, "phonePortrait"],
  [320, 640, "phonePortrait"],
];

describe("breakpoints", () => {
  it.each(VIEWPORTS)("puts %ix%i in %s", (width, height, expected) => {
    expect(breakpointFor(width, height)).toBe(expected);
    const matching = BREAKPOINTS.filter((name) => matches(BREAKPOINT_QUERIES[name], width, height));
    expect(matching).toEqual([expected]);
  });

  it("has exactly one matching query for every whole-pixel viewport, the one breakpointFor gives", () => {
    const sizes = (from: number, to: number, edges: readonly number[]) => {
      const values = new Set(edges.flatMap((edge) => [edge - 1, edge, edge + 1]));
      for (let value = from; value <= to; value += 37) {
        values.add(value);
      }
      return [...values];
    };
    const mismatches: string[] = [];
    for (const width of sizes(200, 2600, [500, 600, 1200])) {
      for (const height of sizes(200, 1600, [500, 501, 600, 1200])) {
        const matching = BREAKPOINTS.filter((name) =>
          matches(BREAKPOINT_QUERIES[name], width, height),
        );
        if (matching.length !== 1 || matching[0] !== breakpointFor(width, height)) {
          mismatches.push(`${width}x${height}: ${matching.join(",")}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("lists every breakpoint once", () => {
    expect([...BREAKPOINTS].sort()).toEqual(Object.keys(BREAKPOINT_QUERIES).sort());
  });

  it("has no gaps at fractional sizes", () => {
    expect(breakpointFor(1199.5, 800)).toBe("laptop");
    expect(breakpointFor(900, 500.5)).toBe("phoneLandscape");
    expect(breakpointFor(599.5, 900)).toBe("phonePortrait");
  });

  it("marks the phone layouts", () => {
    expect(BREAKPOINTS.filter(isPhoneBreakpoint)).toEqual(["phoneLandscape", "phonePortrait"]);
  });

  it("places the review rail per layout", () => {
    expect(BREAKPOINTS.map(panelModeFor)).toEqual(["column", "sheet", "sheet", "inline", "inline"]);
  });
});
