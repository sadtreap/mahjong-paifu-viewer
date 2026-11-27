import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHORT, WIDE } from "./arrangement";

const fileUrl = (path: string) => new URL(path, import.meta.url);
const read = (path: string) => readFileSync(fileUrl(path), "utf8");
const indexCss = read("../index.css");

type Rgb = readonly [number, number, number];
interface Color {
  rgb: Rgb;
  alpha: number;
}

/** The `--name: value` custom properties declared in a CSS block (nested blocks included). */
function declarations(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+)\s*:\s*([^;{}]+?)\s*;/g)) {
    if (name && value) {
      result[name] = value.toLowerCase();
    }
  }
  return result;
}

/** The body of the first `{ ... }` block that starts at `start` (braces balanced). */
function blockAt(css: string, start: number): string {
  if (start < 0) {
    throw new Error("block not found");
  }
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

/** `#rrggbb`, `rgb(r g b)` or `rgb(r g b / a)`. */
function parseColor(value: string): Color {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(value);
  if (hex) {
    const [, r = "", g = "", b = ""] = hex;
    return { rgb: [r, g, b].map((part) => Number.parseInt(part, 16)) as unknown as Rgb, alpha: 1 };
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) {
    const [, r, g, b, alpha] = rgb;
    return {
      rgb: [Number(r), Number(g), Number(b)],
      alpha: alpha === undefined ? 1 : Number(alpha),
    };
  }
  throw new Error(`not a color: ${value}`);
}

/** A translucent color painted over an opaque backdrop. */
function over(color: Color, backdrop: Rgb): Rgb {
  const mix = (index: 0 | 1 | 2) =>
    color.rgb[index] * color.alpha + backdrop[index] * (1 - color.alpha);
  return [mix(0), mix(1), mix(2)];
}

/** WCAG 2 contrast ratio of two opaque colors. */
function contrast(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [r, g, bl] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) as unknown as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

type Palette = Record<string, string>;

/** Looks up a token as an opaque color (failing on a missing or translucent one). */
function solid(palette: Palette, name: string): Rgb {
  const value = palette[name];
  if (!value) {
    throw new Error(`missing --${name}`);
  }
  const color = parseColor(value);
  if (color.alpha !== 1) {
    throw new Error(`--${name} is translucent`);
  }
  return color.rgb;
}

/** The top-level `:root { ... }` blocks of index.css, in order. */
const rootBlocks = [...indexCss.matchAll(/^:root\s*\{/gm)].map((match) =>
  blockAt(indexCss, match.index),
);
const palette: Palette = Object.assign({}, ...rootBlocks.map(declarations));
const color = (name: string) => solid(palette, name);
/** Looks up a token as a color that may be translucent. */
const translucent = (name: string) => {
  const value = palette[name];
  if (!value) {
    throw new Error(`missing --${name}`);
  }
  return parseColor(value);
};
/** Tokens that are sizes, times, easings or shadows; every other token is a color. */
const NOT_A_COLOR =
  /^(radius-.+|control|text-.+|dur|ease|chrome-shadow|top-bar|side-column|scrub-rise)$/;

describe("theme structure", () => {
  it("has one dark palette on :root and nothing that switches it", () => {
    expect(rootBlocks[0]).toMatch(/color-scheme:\s*dark;/);
    expect(Object.keys(palette).length).toBeGreaterThan(40);
    expect(indexCss).not.toMatch(/prefers-color-scheme|data-theme|data-scene/);
  });

  it("labels the token blocks: base, chrome and table", () => {
    const labels = [...indexCss.matchAll(/^\/\* ---- (\w+):.*\*\/\n:root \{/gm)].map(
      (match) => match[1],
    );
    expect(labels).toEqual(["base", "chrome", "table"]);
  });

  it("declares each token once", () => {
    const names = rootBlocks.flatMap((block) => Object.keys(declarations(block)));
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it("writes every color as #rrggbb or rgb(r g b / a)", () => {
    for (const [name, value] of Object.entries(palette)) {
      if (!NOT_A_COLOR.test(name)) {
        expect(() => parseColor(value), `--${name}`).not.toThrow();
      }
    }
  });

  it("colors links with the link token", () => {
    expect(blockAt(indexCss, indexCss.search(/^a\s*\{/m))).toContain("var(--color-link)");
  });
});

describe("page, card and field contrast", () => {
  // Opaque surfaces: the room behind everything, cards and dialogs, fields and key caps, an alert.
  it.each([
    ["color-fg", ["room-1", "chrome-bg-solid", "color-surface", "color-danger-bg"]],
    ["color-muted", ["chrome-bg-solid", "color-surface"]],
    ["color-on-accent", ["color-accent", "color-accent-hover"]],
    ["color-link", ["chrome-bg-solid", "color-danger-bg"]],
    ["color-danger", ["room-1", "color-danger-bg"]],
  ] as const)("--%s reaches 4.5:1 for text on its backgrounds", (text, backgrounds) => {
    for (const background of backgrounds) {
      expect(contrast(color(text), color(background)), `on --${background}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("keeps the border of a field or a key cap at 3:1 on its fill and on the card around it", () => {
    for (const background of ["color-surface", "chrome-bg-solid"]) {
      expect(contrast(color("color-border"), color(background)), background).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("keeps the focus ring at 3:1 on the room, the cards, the fields and the console", () => {
    for (const background of [
      "room-1",
      "chrome-bg-solid",
      "color-surface",
      "color-danger-bg",
      "console-bg",
      "console-lit",
    ]) {
      expect(contrast(color("color-focus"), color(background)), background).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("keeps the accent (a primary button, a checked box) at 3:1 against a card", () => {
    expect(contrast(color("color-accent"), color("chrome-bg-solid"))).toBeGreaterThanOrEqual(3);
  });

  it("darkens an accent button on hover instead of lowering its contrast", () => {
    expect(contrast(color("color-on-accent"), color("color-accent-hover"))).toBeGreaterThanOrEqual(
      contrast(color("color-on-accent"), color("color-accent")),
    );
  });
});

describe("floating chrome contrast", () => {
  /** What chrome floats over: the felt, the rails and the room (never a tile). */
  const BEHIND = [
    "felt-light",
    "felt-center",
    "felt-edge",
    "felt-far",
    "rail-top-0",
    "rail-top-1",
    "rail-lip",
    "rail-edge",
    "room-0",
    "room-1",
    "room-2",
  ];
  /** Every colour a chrome surface can have: translucent over each backdrop, and the solid one. */
  const surfaces = (): ReadonlyArray<readonly [string, Rgb]> => [
    ...BEHIND.map(
      (name) => [`over --${name}`, over(translucent("chrome-bg"), color(name))] as const,
    ),
    ["solid", color("chrome-bg-solid")],
  ];
  const TEXTS = ["color-fg", "color-muted"];

  it("keeps text at 4.5:1 on the chrome, over every felt tone, the rails and the room", () => {
    for (const [where, surface] of surfaces()) {
      for (const text of TEXTS) {
        expect(contrast(color(text), surface), `--${text} ${where}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(["btn-bg", "btn-bg-hover", "btn-bg-pressed"])(
    "keeps text at 4.5:1 on a button filled with --%s on the chrome",
    (fill) => {
      for (const [where, surface] of surfaces()) {
        const button = over(translucent(fill), surface);
        for (const text of TEXTS) {
          expect(contrast(color(text), button), `--${text} ${where}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it("keeps button text at 4.5:1 on an alert", () => {
    for (const fill of ["btn-bg", "btn-bg-hover", "btn-bg-pressed"]) {
      const button = over(translucent(fill), color("color-danger-bg"));
      expect(contrast(color("color-fg"), button), `--${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps gains, losses and links at 4.5:1 on the chrome", () => {
    for (const [where, surface] of surfaces()) {
      for (const text of ["color-gain", "color-loss", "color-link"]) {
        expect(contrast(color(text), surface), `--${text} ${where}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // A seat tag's tenpai word and dealer's wind, and a caption naming a win.
  it("keeps the table's coloured words at 4.5:1 on the chrome", () => {
    for (const [where, surface] of surfaces()) {
      for (const text of ["aid-tenpai", "dealer-mark", "highlight"]) {
        expect(contrast(color(text), surface), `--${text} ${where}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the focus ring and the accent at 3:1 on the chrome", () => {
    for (const [where, surface] of surfaces()) {
      for (const mark of ["color-focus", "color-accent"]) {
        expect(contrast(color(mark), surface), `--${mark} ${where}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("makes the solid chrome the colour the translucent one has over the room", () => {
    const shown = over(translucent("chrome-bg"), color("room-1"));
    color("chrome-bg-solid").forEach((channel, index) => {
      expect(Math.abs(channel - (shown[index] ?? 0))).toBeLessThanOrEqual(1);
    });
  });
});

describe("table contrast", () => {
  it.each([
    ["badge-fg", "badge-bg"],
    ["console-fg", "console-screen"],
    ["console-fg", "console-bg"],
    ["console-fg", "console-lit"],
    ["console-fg", "console-wind"],
    ["console-muted", "console-screen"],
  ])("--%s on --%s reaches 4.5:1 for text", (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the same-tile spotlight at 3:1 where it is drawn", () => {
    // It outlines tiles on the felt in the middle and on the apron behind the own hand.
    for (const felt of ["felt-center", "felt-far"]) {
      expect(contrast(color("spot"), color(felt)), felt).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the turn bar at 3:1 on the console and the last-discard outline at 3:1 on the felt", () => {
    for (const slab of ["console-bg", "console-lit"]) {
      expect(contrast(color("turn"), color(slab)), slab).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(color("highlight"), color("felt-center"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps a riichi stick at 3:1 on the felt it lies on", () => {
    for (const felt of ["felt-light", "felt-center", "felt-edge"]) {
      expect(contrast(color("stick"), color(felt)), felt).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("forced colors (Windows High Contrast)", () => {
  /** The CSS inside a stylesheet's `@media (forced-colors: active)` blocks, or "". */
  const forcedBlock = (css: string) => {
    let result = "";
    let start = css.indexOf("@media (forced-colors: active)");
    while (start >= 0) {
      result += blockAt(css, start);
      start = css.indexOf("@media (forced-colors: active)", start + 1);
    }
    return result;
  };

  // The stylesheets around the table that draw a surface, a mark or a state with a fill alone.
  // (The table's own are checked in table/styles.test.ts.)
  it.for([
    "./Viewer.module.css",
    "./controls/InfoChip.module.css",
    "./controls/Popover.module.css",
    "./controls/PovMenu.module.css",
    "./controls/Scrubber.module.css",
    "./controls/Toast.module.css",
    "./controls/Toolbar.module.css",
    "./controls/Transport.module.css",
    "./result/ResultCard.module.css",
    "./settings/HelpDialog.module.css",
    "./settings/SettingsDialog.module.css",
    "./shell/Dialog.module.css",
    "./shell/Landing.module.css",
    "./shell/Shell.module.css",
  ])("has a forced-colors block in %s", (path) => {
    expect(forcedBlock(read(path))).not.toBe("");
  });

  it("draws the scrubber's track and thumb in system colours", () => {
    const forced = forcedBlock(read("./controls/Scrubber.module.css"));
    expect(forced).toMatch(/forced-color-adjust:\s*none/);
    expect(forced).toMatch(/track\s*\{[^}]*Highlight/);
    expect(forced).toMatch(/thumb\s*\{[^}]*ButtonText/);
  });

  it("marks the checked or current row of a popover with Highlight", () => {
    const forced = forcedBlock(read("./controls/Popover.module.css"));
    expect(forced).toMatch(/aria-checked="true"[^{]*aria-current="true"[^{]*\{[^}]*Highlight/);
  });

  it("marks the chosen table view in the settings with Highlight", () => {
    expect(forcedBlock(read("./settings/SettingsDialog.module.css"))).toMatch(
      /input:checked[^{]*\{[^}]*Highlight/,
    );
  });
});

describe("buttons in forced colors", () => {
  it("marks a pressed toggle and an open popover's opener with Highlight, and a disabled button with GrayText", () => {
    const forced = blockAt(indexCss, indexCss.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(
      /button\[aria-pressed="true"\],\s*button\[aria-expanded="true"\]\s*\{[^}]*Highlight/,
    );
    expect(forced).toMatch(/button\[aria-disabled="true"\]\s*\{[^}]*GrayText/);
  });
});

describe("arrangement queries", () => {
  /** Every stylesheet of the UI, by its path from this folder. */
  const sheets = (dir: string): string[] =>
    readdirSync(fileUrl(dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sheets(`${dir}${entry.name}/`)
        : entry.name.endsWith(".css")
          ? [`${dir}${entry.name}`]
          : [],
    );
  const mediaQueries = (path: string) =>
    [...read(path).matchAll(/@media ([^{]+)\{/g)].map((match) => (match[1] ?? "").trim());

  // CSS cannot import arrangement.ts, so the stylesheets repeat its strings.
  it.for(["./Viewer.module.css"])("lays %s out with both queries, verbatim", (path) => {
    const queries = mediaQueries(path);
    expect(queries).toContain(WIDE);
    expect(queries).toContain(SHORT);
  });

  it("asks about the viewport's shape only with those queries, in every stylesheet", () => {
    const all = sheets("./");
    expect(all.length).toBeGreaterThan(30);
    for (const path of all) {
      for (const query of mediaQueries(path).filter((text) => text.includes("aspect-ratio"))) {
        expect(query.startsWith(WIDE) || query.startsWith(SHORT), `${path}: ${query}`).toBe(true);
      }
    }
  });
});
