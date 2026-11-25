import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const indexCss = read("../index.css");

/** The `--name: #rrggbb` color tokens declared in a CSS block. */
function tokens(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    if (name && value) {
      result[name] = value.toLowerCase();
    }
  }
  return result;
}

/** The body of the first `{ ... }` block that starts at `start` (braces balanced). */
function blockAt(css: string, start: number): string {
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === "{") {
      depth++;
    } else if (css[index] === "}" && --depth === 0) {
      return css.slice(open + 1, index);
    }
  }
  throw new Error("unbalanced CSS");
}

const light = tokens(blockAt(indexCss, indexCss.indexOf(":root")));
const dark = {
  ...light,
  ...tokens(blockAt(indexCss, indexCss.indexOf("@media (prefers-color-scheme: dark)"))),
};

/** WCAG 2 contrast ratio of two #rrggbb colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, bl = 0] = [1, 3, 5].map((i) => {
      const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme contrast", (_scheme, colors) => {
  const color = (name: string) => {
    const value = colors[`color-${name}`];
    if (!value) {
      throw new Error(`missing --color-${name}`);
    }
    return value;
  };

  it.each([
    ["on-accent", "accent"],
    ["on-accent", "accent-hover"],
    ["link", "bg"],
    ["link", "surface"],
    ["link", "danger-bg"],
    ["fg", "bg"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["danger", "danger-bg"],
  ])("--color-%s on --color-%s reaches 4.5:1 for text", (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the accent (slider, checkbox) at 3:1 against the page", () => {
    expect(contrast(color("accent"), color("bg"))).toBeGreaterThanOrEqual(3);
  });

  it("darkens the file button on hover instead of lowering its contrast", () => {
    expect(contrast(color("on-accent"), color("accent-hover"))).toBeGreaterThanOrEqual(
      contrast(color("on-accent"), color("accent")),
    );
  });

  it("colors links with the link token", () => {
    expect(blockAt(indexCss, indexCss.search(/^a\s*\{/m))).toContain("var(--color-link)");
  });
});

describe("forced colors (Windows High Contrast)", () => {
  /** The CSS inside a stylesheet's `@media (forced-colors: active)` block, or "". */
  const forcedBlock = (css: string) => {
    const start = css.indexOf("@media (forced-colors: active)");
    return start < 0 ? "" : blockAt(css, start);
  };

  it("keeps the riichi sticks, the counter sticks and the active seat visible", () => {
    expect(forcedBlock(read("./Board.module.css"))).toMatch(/\.riichiStick[^{]*\{[^}]*CanvasText/);
    const center = forcedBlock(read("./CenterPanel.module.css"));
    expect(center).toMatch(/\.stick100/);
    expect(center).toMatch(/\.stick1000/);
    expect(center).toMatch(/forced-color-adjust:\s*none/);
    expect(forcedBlock(read("./SeatInfo.module.css"))).toMatch(/\.active[^{]*\{[^}]*Highlight/);
  });
});
