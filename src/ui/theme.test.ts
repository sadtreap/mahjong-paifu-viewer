import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BREAKPOINT_QUERIES } from "./breakpoints";

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

const ruleBody = (selector: string) => blockAt(indexCss, indexCss.indexOf(`${selector} {`));

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

const root = declarations(blockAt(indexCss, indexCss.search(/^:root\s*\{/m)));
const darkMedia = declarations(
  blockAt(blockAt(indexCss, indexCss.indexOf("@media (prefers-color-scheme: dark)")), 0),
);
const darkAttribute = declarations(ruleBody(':root[data-theme="dark"]'));
const scene = declarations(ruleBody('[data-scene="player"]'));

const light: Palette = root;
const dark: Palette = { ...root, ...darkAttribute };
const themes = [
  ["light", light],
  ["dark", dark],
] as const;

describe("theme structure", () => {
  it("defines the dark theme for the system setting and for data-theme=dark alike", () => {
    expect(Object.keys(darkMedia).length).toBeGreaterThan(10);
    expect(darkMedia).toEqual(darkAttribute);
  });

  it("lets the settings force either color scheme", () => {
    expect(ruleBody(':root[data-theme="light"]')).toMatch(/color-scheme:\s*light;/);
    expect(ruleBody(':root[data-theme="dark"]')).toMatch(/color-scheme:\s*dark;/);
  });

  it("makes the player a dark scene that defines every themed page color", () => {
    expect(ruleBody('[data-scene="player"]')).toMatch(/color-scheme:\s*dark;/);
    // The page colors that change with the theme; the scene must not inherit the light ones.
    const pageTokens = Object.keys(darkAttribute).filter((name) => name.startsWith("color-"));
    expect(pageTokens.length).toBeGreaterThan(10);
    for (const name of pageTokens) {
      expect(scene, `--${name}`).toHaveProperty(name);
    }
    for (const name of ["seat-0", "seat-1", "seat-2", "seat-3"]) {
      expect(scene, `--${name}`).toHaveProperty(name);
    }
    for (const name of ["dock-bg", "btn-bg", "btn-bg-hover", "btn-border"]) {
      expect(scene, `--${name}`).toHaveProperty(name);
    }
  });

  it("gives the table the same palette in both themes, except the felt", () => {
    const tableTokens = Object.keys(root).filter((name) =>
      /^(room|rail|console|tile-(edge|lid|back|drop)|plate|seatc|turn|highlight|spot$|next|tip|fu|card|coach|dealer-)/.test(
        name,
      ),
    );
    expect(tableTokens.length).toBeGreaterThan(30);
    for (const name of tableTokens) {
      expect(dark[name], `--${name}`).toBe(light[name]);
    }
    for (const name of ["felt-light", "felt-center", "felt-edge", "felt-far"]) {
      expect(dark[name], `--${name}`).not.toBe(light[name]);
    }
  });
});

describe.each(themes)("%s theme contrast", (_scheme, colors) => {
  const color = (name: string) => solid(colors, `color-${name}`);

  it.each([
    ["on-accent", "accent"],
    ["on-accent", "accent-hover"],
    ["link", "bg"],
    ["link", "surface"],
    ["link", "danger-bg"],
    ["fg", "bg"],
    ["fg", "surface"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["danger", "danger-bg"],
    ["gain", "surface"],
    ["loss", "surface"],
  ])("--color-%s on --color-%s reaches 4.5:1 for text", (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["seat-0", "seat-1", "seat-2", "seat-3"])(
    "--%s reaches 4.5:1 on the page and its surfaces",
    (seat) => {
      for (const background of ["bg", "surface"]) {
        expect(contrast(solid(colors, seat), color(background))).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("keeps the rail's pick outline and win star at 3:1 (non-text)", () => {
    expect(contrast(solid(colors, "spot-page"), color("surface"))).toBeGreaterThanOrEqual(3);
    expect(contrast(solid(colors, "win-glyph"), color("surface"))).toBeGreaterThanOrEqual(3);
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

describe.each(themes)("player scene contrast (page in the %s theme)", (_scheme, page) => {
  const colors: Palette = { ...page, ...scene };
  const color = (name: string) => solid(colors, name);

  it.each([
    [
      "color-fg",
      ["color-bg", "dock-bg", "btn-bg", "btn-bg-hover", "color-surface", "color-surface-alt"],
    ],
    ["color-muted", ["color-bg", "dock-bg", "btn-bg", "color-surface", "color-surface-alt"]],
    ["color-on-accent", ["color-accent", "color-accent-hover"]],
    ["color-gain", ["color-bg", "dock-bg", "color-surface"]],
    ["color-loss", ["color-bg", "dock-bg", "color-surface"]],
    ["color-link", ["color-bg", "color-surface"]],
    ["color-danger", ["color-danger-bg"]],
    ["color-dealer-text", ["color-surface"]],
    ["seat-0", ["color-bg", "dock-bg", "color-surface", "color-surface-alt"]],
    ["seat-1", ["color-bg", "dock-bg", "color-surface", "color-surface-alt"]],
    ["seat-2", ["color-bg", "dock-bg", "color-surface", "color-surface-alt"]],
    ["seat-3", ["color-bg", "dock-bg", "color-surface", "color-surface-alt"]],
  ] as const)("--%s reaches 4.5:1 for text on its backgrounds", (text, backgrounds) => {
    for (const background of backgrounds) {
      expect(contrast(color(text), color(background)), `on --${background}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("keeps the focus ring at 3:1 on the scene", () => {
    for (const background of ["color-bg", "dock-bg", "btn-bg"]) {
      expect(contrast(color("color-focus"), color(background))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe.each(themes)("table contrast (%s theme)", (_scheme, colors) => {
  const color = (name: string) => solid(colors, name);
  const translucent = (name: string) => {
    const value = colors[name];
    if (!value) {
      throw new Error(`missing --${name}`);
    }
    return parseColor(value);
  };
  /** What a label on the table can sit on: any part of the felt, or a tile face. */
  const backdrops = () => [
    ...["felt-light", "felt-center", "felt-edge", "felt-far"].map(color),
    [255, 255, 255] as const,
  ];

  it.each([
    ["plate-bg", ["plate-fg", "plate-score", "plate-muted", "aid-tenpai"]],
    ["coach-bg", ["coach-fg"]],
    ["card-bg", ["card-fg", "card-value", "card-gain", "card-loss"]],
  ] as const)("text on --%s reaches 4.5:1 wherever it sits", (background, texts) => {
    for (const backdrop of backdrops()) {
      const composite = over(translucent(background), backdrop);
      for (const text of texts) {
        expect(contrast(color(text), composite), `--${text}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each([
    ["fu-fg", "fu-bg"],
    ["dealer-fg", "dealer-bg"],
    ["console-fg", "console-screen"],
    ["console-fg", "console-bg"],
    ["console-muted", "console-screen"],
    ["console-muted", "console-bg"],
    ["tip-fg", "tip-bg"],
    ["tip-muted", "tip-bg"],
    ["tip-go", "tip-bg"],
    ["card-fg", "card-btn"],
  ])("--%s on --%s reaches 4.5:1 for text", (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["seatc0", "seatc1", "seatc2", "seatc3", "card-btn-primary"])(
    "white text reaches 4.5:1 on --%s",
    (background) => {
      expect(contrast([255, 255, 255], color(background))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("keeps the review outlines at 3:1 where they are drawn", () => {
    // The spotlight outlines tiles on the felt in the middle and on the apron behind the own hand.
    for (const felt of ["felt-center", "felt-far"]) {
      expect(contrast(color("spot"), color(felt)), felt).toBeGreaterThanOrEqual(3);
    }
    // The next-discard marker sits on the apron.
    expect(contrast(color("next"), color("felt-far"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps the turn bar and the last-discard highlight at 3:1 on the felt", () => {
    for (const indicator of ["turn", "highlight"]) {
      expect(contrast(color(indicator), color("felt-center")), indicator).toBeGreaterThanOrEqual(3);
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

  it("keeps the riichi sticks, the counter sticks and the active seat visible", () => {
    expect(forcedBlock(read("./table/SeatZone.module.css"))).toMatch(
      /\.stick[^{]*\{[^}]*Highlight/,
    );
    const hud = forcedBlock(read("./table/Hud.module.css"));
    expect(hud).toMatch(/\.stick100/);
    expect(hud).toMatch(/\.stick1000/);
    expect(hud).toMatch(/forced-color-adjust:\s*none/);
    expect(forcedBlock(read("./table/SeatPlates.module.css"))).toMatch(
      /\.active[^{]*\{[^}]*Highlight/,
    );
  });

  // The viewer's stylesheets that draw with backgrounds.
  it.for([
    "./table/TableStage.module.css",
    "./table/SeatPlates.module.css",
    "./table/Hud.module.css",
    "./table/CallCaption.module.css",
    "./timeline/RoundBand.module.css",
    "./panels/RoundMatrix.module.css",
    "./panels/PlayersList.module.css",
    "./shell/StageTools.module.css",
    "./shell/Welcome.module.css",
    "./shell/FirstUseHint.module.css",
    "./shell/Dialog.module.css",
  ])("has a forced-colors block in %s", (path) => {
    expect(forcedBlock(read(path))).not.toBe("");
  });

  // Sticks in the HUD, the plates and the Players rows keep their own colors plus an outline.
  it.for([
    "./table/Hud.module.css",
    "./table/SeatPlates.module.css",
    "./panels/PlayersList.module.css",
  ])("keeps the sticks' colors and outlines them in %s", (path) => {
    const forced = forcedBlock(read(path));
    expect(forced).toMatch(/forced-color-adjust:\s*none/);
    expect(forced).toMatch(/outline:[^;]*(CanvasText|Highlight)/);
  });
});

describe("stage toolbar in forced colors", () => {
  it("marks pressed toggles, open menus and the checked seat with Highlight", () => {
    const css = read("./shell/StageTools.module.css");
    const start = css.indexOf("@media (forced-colors: active)");
    const forced = blockAt(css, start);
    for (const selector of [
      '.button[aria-pressed="true"]',
      '.button[aria-expanded="true"]',
      '.item[aria-checked="true"]',
    ]) {
      expect(forced).toContain(selector);
    }
    expect(forced).toMatch(/outline:[^;]*Highlight/);
  });
});

describe("shell media queries", () => {
  // The shell's stylesheets use breakpoints.ts's strings (plus the 360 px phone width).
  it.for(["./shell/StageTools.module.css", "./shell/Welcome.module.css"])(
    "only uses breakpoint queries in %s",
    (path) => {
      const allowed = [
        ...Object.values(BREAKPOINT_QUERIES),
        "(orientation: portrait)",
        "(orientation: portrait) and (max-width: 359px)",
        "(forced-colors: active)",
        "(prefers-reduced-motion: reduce)",
      ];
      const queries = [...read(path).matchAll(/@media ([^{]+)\{/g)].map((match) =>
        (match[1] ?? "").trim(),
      );
      expect(queries.length).toBeGreaterThan(0);
      for (const query of queries) {
        for (const part of query.split(/,\s*/)) {
          expect(allowed, path).toContain(part);
        }
      }
    },
  );
});

describe("breakpoints", () => {
  const viewerCss = read("./Viewer.module.css");
  const queries = Object.values(BREAKPOINT_QUERIES);

  it("repeats breakpoints.ts's media queries verbatim in Viewer.module.css", () => {
    for (const query of queries) {
      expect(viewerCss).toContain(query);
    }
  });
});
