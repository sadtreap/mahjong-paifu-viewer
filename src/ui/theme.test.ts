import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fileUrl = (path: string) => new URL(path, import.meta.url);
const read = (path: string) => readFileSync(fileUrl(path), "utf8");
const indexCss = read("../index.css");

/** The files under a folder whose names end in one of `endings`, by their path from this one. */
function files(dir: string, endings: readonly string[]): string[] {
  return readdirSync(fileUrl(dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(`${dir}${entry.name}/`, endings)
      : endings.some((ending) => entry.name.endsWith(ending))
        ? [`${dir}${entry.name}`]
        : [],
  );
}

/** Every stylesheet of the UI, by its path from this folder. */
const SHEETS = files("./", [".css"]);

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

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
const NOT_A_COLOR = /^(radius-.+|control|text-.+|dur|ease|shadow-.+)$/;

describe("theme structure", () => {
  it("has one light palette on :root and nothing that switches it", () => {
    expect(rootBlocks[0]).toMatch(/color-scheme:\s*light;/);
    expect(indexCss.match(/color-scheme\s*:/g)).toHaveLength(1);
    expect(Object.keys(palette).length).toBeGreaterThan(30);
    expect(indexCss).not.toMatch(/prefers-color-scheme|data-theme|data-scene/);
  });

  it("labels the token blocks: base, chrome and table", () => {
    const labels = [...indexCss.matchAll(/^\/\* ---- (\w+):.*\*\/\n:root \{/gm)].map(
      (match) => match[1],
    );
    expect(labels).toEqual(["base", "chrome", "table"]);
    // They come first, and no other :root rule (the page's own) declares a token.
    const declaring = rootBlocks.filter((block) => Object.keys(declarations(block)).length > 0);
    expect(declaring).toEqual(rootBlocks.slice(0, labels.length));
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
    // A shadow's colour is written the same way, after its lengths.
    const shadows = Object.entries(palette).filter(([name]) => name.startsWith("shadow-"));
    expect(shadows.length).toBeGreaterThan(0);
    for (const [name, value] of shadows) {
      const shade = /^[\d.a-z\s-]+ (#\S+|rgb\([^)]*\))$/.exec(value)?.[1] ?? "";
      expect(() => parseColor(shade), `--${name}`).not.toThrow();
    }
  });

  it("colors links with the link token", () => {
    expect(blockAt(indexCss, indexCss.search(/^a\s*\{/m))).toContain("var(--color-link)");
  });

  describe("tokens and what reads them", () => {
    /** The app's stylesheets and code (tests aside): everything that can name a custom property. */
    const sources = ["../index.css", ...files("./", [".css", ".ts", ".tsx"])]
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .map((path) => ({ path, text: withoutComments(read(path)) }));
    /** Every `var(--name)` of the app, and whether it carries a fallback. */
    const reads = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/var\(\s*--([\w-]+)\s*([,)])/g)].map((match) => ({
        path,
        name: match[1] ?? "",
        fallback: match[2] === ",",
      })),
    );
    /** Every custom property a stylesheet declares or the code sets inline. */
    const set = new Set(
      sources.flatMap(({ path, text }) =>
        [
          ...text.matchAll(
            path.endsWith(".css") ? /(?<![\w-])--([\w-]+)\s*:/g : /["'`]--([\w-]+)["'`]\s*:/g,
          ),
        ].map((match) => match[1] ?? ""),
      ),
    );

    // A token that is gone (the old dark palette's) would paint nothing, silently.
    it("reads no custom property that nothing sets, unless it has a fallback", () => {
      expect(reads.length).toBeGreaterThan(100);
      expect(
        reads
          .filter((use) => !use.fallback && !set.has(use.name))
          .map((use) => `${use.path}: --${use.name}`),
      ).toEqual([]);
    });

    it("declares no token that nothing reads", () => {
      const used = new Set(reads.map((use) => use.name));
      expect(Object.keys(palette).filter((name) => !used.has(name))).toEqual([]);
    });
  });

  it("keeps the colours in index.css: no other stylesheet writes one of its own", () => {
    // The one exception is the dialog's backdrop, which cannot read the page's custom properties
    // in older browsers: it is the ink, written out.
    const ink = color("color-fg").join(" ");
    const own = SHEETS.flatMap((path) =>
      [...withoutComments(read(path)).matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\([^)]*\)/gi)].map(
        (match) => `${path}: ${match[0]}`,
      ),
    );
    expect(own).toHaveLength(1);
    expect(own[0]).toMatch(
      new RegExp(`^\\./shell/Dialog\\.module\\.css: rgb\\(${ink} / [\\d.]+\\)$`),
    );
    expect(read("./shell/Dialog.module.css")).toMatch(/::backdrop\s*\{\s*background:\s*rgb\(/);
  });
});

/*
 * What stands on what. The page's ground is --color-bg (the landing page, and in the viewer the
 * transport under the table); the panel, cards and dialogs are --color-panel; fields and key caps
 * are --color-surface; an alert is --color-danger-bg. A button adds a veil of ink to the ground it
 * stands on: --color-hover when hovered, --color-fill when held, on (aria-pressed) or current
 * (aria-current). On the table, tiles, sticks and captions lie on --mat and the console in its
 * middle is --console-bg.
 */

/** A button's grounds over one surface: bare, hovered, and held, on or current. */
const buttonStates = (ground: string): ReadonlyArray<readonly [string, Rgb]> => [
  [`on --${ground}`, color(ground)],
  [`on --color-hover over --${ground}`, over(translucent("color-hover"), color(ground))],
  [`on --color-fill over --${ground}`, over(translucent("color-fill"), color(ground))],
];

describe("page, panel and field contrast", () => {
  it.each([
    ["color-fg", ["color-bg", "color-panel", "color-surface", "color-danger-bg"]],
    // The step's number beside the slider; captions, hints and notes; a field's placeholder.
    ["color-muted", ["color-bg", "color-panel", "color-surface"]],
    ["color-on-accent", ["color-accent", "color-accent-hover"]],
    // The one link today is an alert's; any other would stand on the panel.
    ["color-link", ["color-panel", "color-danger-bg"]],
    // The furiten word in the player list (and the alert's icon, which needs less).
    ["color-danger", ["color-danger-bg"]],
    ["color-gain", ["color-panel"]],
    ["color-loss", ["color-panel"]],
    // Words on ink: the toast, the dealer's wind in the player list, a call's caption, the kita
    // count.
    ["color-panel", ["color-fg"]],
  ] as const)("--%s reaches 4.5:1 for text on its backgrounds", (text, backgrounds) => {
    for (const background of backgrounds) {
      expect(contrast(color(text), color(background)), `on --${background}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  // The transport's buttons stand on the page; every other button on the panel, a card or a
  // dialog.
  it.each(["color-bg", "color-panel"])(
    "keeps a button's text at 4.5:1 on --%s, bare, hovered and held or on",
    (ground) => {
      for (const [where, fill] of buttonStates(ground)) {
        expect(contrast(color("color-fg"), fill), where).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  // The rows of the player list and of the round list are buttons, and the viewed player's and the
  // shown round's are filled; the panel's actions are buttons set in the muted colour.
  it.each(["color-muted", "color-gain", "color-loss"])(
    "keeps --%s at 4.5:1 on a row of the panel, bare, hovered and filled",
    (text) => {
      for (const [where, fill] of buttonStates("color-panel")) {
        expect(contrast(color(text), fill), where).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("keeps the border of a field or a key cap at 3:1 on its fill and on the panel", () => {
    for (const background of ["color-surface", "color-panel"]) {
      expect(contrast(color("color-border"), color(background)), background).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("keeps an alert's border at 3:1 on the alert and on what it stands on", () => {
    for (const background of ["color-danger-bg", "color-bg", "color-panel"]) {
      expect(contrast(color("color-danger"), color(background)), background).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("keeps the focus ring at 3:1 on the page, the panel, fields, an alert and the table", () => {
    for (const background of [
      "color-bg",
      "color-panel",
      "color-surface",
      "color-danger-bg",
      "mat",
      "console-bg",
    ]) {
      expect(contrast(color("color-focus"), color(background)), background).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  // The ring around a row of a list touches the rows beside it, which can be hovered or filled.
  it("keeps the focus ring at 3:1 beside a hovered or filled button", () => {
    for (const [where, fill] of [...buttonStates("color-bg"), ...buttonStates("color-panel")]) {
      expect(contrast(color("color-focus"), fill), where).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the accent (a primary button, a checked box) at 3:1 on the page and the panel", () => {
    for (const background of ["color-bg", "color-panel"]) {
      expect(contrast(color("color-accent"), color(background)), background).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("darkens an accent button on hover instead of lowering its contrast", () => {
    expect(contrast(color("color-on-accent"), color("color-accent-hover"))).toBeGreaterThanOrEqual(
      contrast(color("color-on-accent"), color("color-accent")),
    );
  });
});

describe("table contrast", () => {
  it.each([
    // The console: the round and the scores, its labels, and the dealer's wind on ink.
    ["color-fg", "console-bg"],
    ["color-muted", "console-bg"],
    ["console-bg", "color-fg"],
    // A win's caption (a call's is --color-panel on ink, above).
    ["color-on-accent", "mark"],
  ])("--%s on --%s reaches 4.5:1 for text", (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the same-tile outline at 3:1 where it is drawn", () => {
    // Around tiles on the mat and around the dora indicators on the console; in a row of tiles it
    // also runs over the faces beside it, white or dimmed.
    for (const ground of ["mat", "console-bg", "tile-face", "tile-dim"]) {
      expect(contrast(color("spot"), color(ground)), ground).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the turn bar at 3:1 on the console", () => {
    expect(contrast(color("mark"), color("console-bg"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps the last discard's ring at 3:1 on the mat and beside the tiles around it", () => {
    for (const ground of ["mat", "tile-face", "tile-dim"]) {
      expect(contrast(color("mark"), color(ground)), ground).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * How well something flat and faceless is told from the ground it lies on: by its body or by
   * the hairline around it (--tile-line over the body), whichever stands out more.
   */
  const standsOut = (body: string, ground: string) =>
    Math.max(
      contrast(color(body), color(ground)),
      contrast(over(translucent("tile-line"), color(body)), color(ground)),
    );

  // Hidden hands and closed kans on the mat; a closed kan of the winning hand in the panel.
  it("keeps a face-down tile at 3:1 on the mat and the panel, by its body or its hairline", () => {
    for (const ground of ["mat", "color-panel"]) {
      expect(standsOut("tile-back", ground), ground).toBeGreaterThanOrEqual(3);
    }
  });

  // The stick is how the table says that a player is in riichi. Its body is as pale as the mat,
  // so its outline (SeatZone.module.css draws it in the field border's colour) is what shows.
  it("keeps a riichi stick's outline at 3:1 on the mat it lies on and on the stick itself", () => {
    expect(read("./table/SeatZone.module.css")).toMatch(
      /\.stick\s*\{[^}]*box-shadow:[^;]*var\(--color-border\)/,
    );
    for (const ground of ["mat", "stick"]) {
      expect(contrast(color("color-border"), color(ground)), ground).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the riichi stick's dot at 3:1 on the stick", () => {
    expect(contrast(color("stick-dot"), color("stick"))).toBeGreaterThanOrEqual(3);
  });
});

describe("forced colors (Windows High Contrast)", () => {
  const FORCED = "@media (forced-colors: active)";

  /** A stylesheet's CSS inside its forced-colors blocks, and the rest of it. */
  function splitForced(css: string): { inside: string; outside: string } {
    let inside = "";
    let outside = "";
    let from = 0;
    for (let start = css.indexOf(FORCED); start >= 0; start = css.indexOf(FORCED, from)) {
      const body = blockAt(css, start);
      inside += body;
      outside += css.slice(from, start);
      from = css.indexOf("{", start) + body.length + 2;
    }
    return { inside, outside: outside + css.slice(from) };
  }
  const forcedBlock = (path: string) => splitForced(withoutComments(read(path))).inside;

  /** The tile primitives: table/styles.test.ts checks them with the table's own stylesheets. */
  const TILES = [
    "./TileImage.module.css",
    "./Pond.module.css",
    "./HandRow.module.css",
    "./MeldTiles.module.css",
  ];
  const aroundTable = SHEETS.filter(
    (path) => !path.startsWith("./table/") && !TILES.includes(path),
  );

  /**
   * Stylesheets whose only fills are grounds that lose nothing when the system removes the fill:
   * each keeps an edge that is a border, or needs none.
   */
  const GROUNDS_ONLY = [
    // A veil over the page, and a card with a dashed border.
    "./DropOverlay.module.css",
    // An alert with a border.
    "./ErrorMessage.module.css",
    // The panel's ground; its edge is a border of the viewer's, its sections are ruled off.
    "./panel/Panel.module.css",
    // The ground of the list's sticky heading, which rows scroll under.
    "./panel/RoundList.module.css",
    // A field with a border.
    "./shell/LoadForm.module.css",
  ];

  // A surface, a mark or a state drawn with a fill or a shadow alone disappears when the system
  // picks the colours.
  it("has a forced-colors block in every stylesheet that fills more than a ground", () => {
    expect(aroundTable.length).toBeGreaterThan(15);
    expect(aroundTable).toEqual(expect.arrayContaining(GROUNDS_ONLY));
    for (const path of aroundTable) {
      const { inside, outside } = splitForced(withoutComments(read(path)));
      const fills = /\b(background(-color)?|box-shadow)\s*:\s*(?!none\b|transparent\b)/.test(
        outside,
      );
      if (fills && !GROUNDS_ONLY.includes(path)) {
        expect(inside.trim(), path).not.toBe("");
      }
    }
  });

  it.each<[path: string, rule: RegExp]>([
    // The message of a round that could not be replayed, and the toast.
    ["./Viewer.module.css", /\.failed > p\s*\{[^}]*border-color:\s*CanvasText/],
    ["./controls/Toast.module.css", /\.toast\s*\{[^}]*border:[^;}]*CanvasText/],
    // The dealer's filled wind and the furiten word's plate.
    [
      "./panel/PlayerList.module.css",
      /\.wind\[data-dealer\],\s*\.furiten\s*\{[^}]*border:[^;}]*CanvasText/,
    ],
    // A key that is switched off is dimmed with the system's own colour for it.
    ["./settings/HelpDialog.module.css", /\.off,\s*\.off kbd\s*\{[^}]*color:\s*GrayText/],
    ["./shell/Dialog.module.css", /\.dialog\s*\{[^}]*border:[^;}]*CanvasText/],
    ["./shell/Landing.module.css", /\.card\s*\{[^}]*border:[^;}]*CanvasText/],
    // The download bar is a border already; it takes the text's colour.
    ["./shell/Shell.module.css", /\.line\s*\{[^}]*border-color:\s*CanvasText/],
  ])("draws what %s fills with a system colour", (path, rule) => {
    expect(forcedBlock(path)).toMatch(rule);
  });

  it("draws the scrubber's track and thumb in system colours", () => {
    const forced = forcedBlock("./controls/Scrubber.module.css");
    expect(forced).toMatch(/forced-color-adjust:\s*none/);
    expect(forced).toMatch(/track\s*\{[^}]*Highlight/);
    expect(forced).toMatch(/thumb\s*\{[^}]*ButtonText/);
  });
});

describe("buttons in forced colors", () => {
  const forced = blockAt(indexCss, indexCss.indexOf("@media (forced-colors: active)"));

  // The viewed player's row is a pressed toggle, and the shown round's row is the current one.
  it("marks a pressed toggle and the current row with Highlight", () => {
    expect(forced).toMatch(
      /button\[aria-pressed="true"\],\s*button\[aria-current="true"\]\s*\{[^}]*Highlight/,
    );
  });

  it("marks a disabled button with GrayText", () => {
    expect(forced).toMatch(/button\[aria-disabled="true"\]\s*\{[^}]*GrayText/);
  });

  it("styles no state that no button has any more", () => {
    // Nothing opens a popover now.
    expect(indexCss).not.toContain("aria-expanded");
  });
});

describe("arrangement query", () => {
  /**
   * The one question the UI asks about the viewport's shape: a landscape window with room for the
   * panel beside the table. Otherwise the panel goes under the table. Only CSS asks it.
   */
  const SIDE = "(min-aspect-ratio: 4 / 3) and (min-width: 640px)";

  const mediaQueries = (path: string) =>
    [...withoutComments(read(path)).matchAll(/@media ([^{]+)\{/g)].map((match) =>
      (match[1] ?? "").trim(),
    );
  const asksShape = (query: string) => /aspect-ratio|orientation/.test(query);

  it("puts the panel beside the table with one query, in Viewer.module.css", () => {
    expect(mediaQueries("./Viewer.module.css").filter(asksShape)).toEqual([SIDE]);
  });

  it("asks about the viewport's shape in no other stylesheet", () => {
    const others = ["../index.css", ...SHEETS].filter((path) => path !== "./Viewer.module.css");
    expect(others.length).toBeGreaterThan(20);
    for (const path of others) {
      expect(mediaQueries(path).filter(asksShape), path).toEqual([]);
    }
  });
});
