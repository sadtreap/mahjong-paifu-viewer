import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRAWN_GAP, KITA_WIDTH, MELD_GAP } from "../layout";
import type { Side } from "../viewer/types";
import { seatToTable, stageVars, TABLE_UNITS } from "./geometry";

const source = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const read = (name: string) =>
  source(name)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");

const FILES = readdirSync(new URL(".", import.meta.url));

/** The table's stylesheets, and the tile primitives' it is drawn with. */
const SHEETS = [
  ...FILES.filter((name) => name.endsWith(".module.css")),
  "../TileImage.module.css",
  "../Pond.module.css",
  "../HandRow.module.css",
  "../MeldTiles.module.css",
];

/** The table's components, which set a few custom properties inline. */
const COMPONENTS = FILES.filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"));

/** The CSS inside the first at-rule with this prelude, and the stylesheet without it. */
function split(css: string, prelude: string): { inside: string; outside: string } {
  const start = css.indexOf(prelude);
  if (start < 0) {
    return { inside: "", outside: css };
  }
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") {
      depth++;
    } else if (css[i] === "}" && --depth === 0) {
      return { inside: css.slice(open + 1, i), outside: css.slice(0, start) + css.slice(i + 1) };
    }
  }
  return { inside: "", outside: css };
}

/**
 * The declarations of the first rule whose selector list includes `selector` (or is `selector`,
 * for one with a comma of its own, as in `:is(a, b)`).
 */
function rule(css: string, selector: string): string {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1] ?? "";
    if (selectors.trim() === selector || selectors.split(",").some((s) => s.trim() === selector)) {
      return match[2] ?? "";
    }
  }
  return "";
}

/** A declaration's value in a rule's declarations, without its spaces ("" when it has none). */
function value(declarations: string, property: string): string {
  for (const declaration of declarations.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon >= 0 && declaration.slice(0, colon).trim() === property) {
      return declaration.slice(colon + 1).replace(/\s+/g, "");
    }
  }
  return "";
}

/** The declared value of `selector`'s `property` in a stylesheet, without its spaces. */
const declared = (name: string, selector: string, property: string) =>
  value(rule(read(name), selector), property);

/** The number a length is multiplied by: "calc(var(--tile-w)*0.4)" gives 0.4. */
function factor(calc: string, unit = "--tile-w"): number {
  const match = /^calc\(var\((--[\w-]+)\)\*([\d.]+)\)$/.exec(calc);
  return match !== null && match[1] === unit ? Number(match[2]) : Number.NaN;
}

describe("a flat table", () => {
  it("uses no 3D transform, no preserve-3d and no will-change", () => {
    const depth =
      /preserve-3d|will-change|perspective|backface-visibility|\b(rotate[XY]|rotate3d|translateZ|translate3d|scaleZ|scale3d|matrix3d)\(/;
    for (const name of SHEETS) {
      expect(read(name), name).not.toMatch(depth);
    }
  });

  it("paints the mat in one solid colour", () => {
    expect(declared("TableStage.module.css", ".table", "background")).toBe("var(--mat)");
  });

  it("measures the table in the stage's own box, as a square", () => {
    const table = rule(read("TableStage.module.css"), ".table");
    expect(declared("TableStage.module.css", ".stage", "container")).toBe("stage/size");
    expect(value(table, "--S")).toMatch(/^calc\(min\(100cqw,100cqh\)-/);
    expect(value(table, "width")).toBe("var(--S)");
    expect(value(table, "height")).toBe("var(--S)");
    // u, a tile's width: the side over the table's units.
    expect(value(table, "--u")).toBe("calc(var(--S)/var(--units))");
  });
});

describe("the seat layers", () => {
  const layers = read("layers.module.css");
  /** The degrees a rule turns its box by, clockwise (0 without a rotate). */
  const turnOf = (css: string, selector: string) => {
    const rotate = value(rule(css, selector), "rotate");
    return rotate === "" ? 0 : Number(/^(-?\d+)deg$/.exec(rotate)?.[1]);
  };
  /** A point turned about the middle of the table as CSS `rotate` turns it (y grows downward). */
  const turned = (degrees: number, x: number, y: number): [number, number] => {
    const c = TABLE_UNITS / 2;
    const angle = (degrees * Math.PI) / 180;
    const [dx, dy] = [x - c, y - c];
    return [
      c + dx * Math.cos(angle) - dy * Math.sin(angle),
      c + dx * Math.sin(angle) + dy * Math.cos(angle),
    ];
  };
  const SIDES: readonly Side[] = ["bottom", "right", "top", "left"];

  it("cover the table and turn about its middle", () => {
    const layer = rule(layers, ".layer");
    expect(value(layer, "position")).toBe("absolute");
    expect(value(layer, "inset")).toBe("0");
    expect(layers).not.toMatch(/transform-origin|transform\s*:/);
    expect(turnOf(layers, ".layer")).toBe(0);
    expect(turnOf(layers, ".bottom")).toBe(0);
  });

  it("are turned the way geometry.ts turns their coordinates", () => {
    for (const side of SIDES) {
      const degrees = turnOf(layers, `.${side}`);
      expect(Number.isFinite(degrees), side).toBe(true);
      for (const [x, y] of [
        [0, 0],
        [3, 16],
        [TABLE_UNITS / 2, TABLE_UNITS],
      ] as const) {
        const [cx, cy] = turned(degrees, x, y);
        const [tx, ty] = seatToTable(side, x, y);
        expect(tx, `${side} x of ${x}, ${y}`).toBeCloseTo(cx);
        expect(ty, `${side} y of ${x}, ${y}`).toBeCloseTo(cy);
      }
    }
  });

  it("let through the pointer where they are empty, so no layer covers another's tiles", () => {
    expect(value(rule(layers, ".layer"), "pointer-events")).toBe("none");
    expect(value(rule(layers, ".layer > *"), "pointer-events")).toBe("auto");
  });

  it("tell what stands on them how to read upright", () => {
    for (const side of ["right", "top", "left"] as const) {
      const upright = Number(
        /^(-?\d+)deg$/.exec(declared("layers.module.css", `.${side}`, "--upright"))?.[1],
      );
      // The two turns cancel out: together a whole number of turns.
      expect(Math.abs((upright + turnOf(layers, `.${side}`)) % 360), side).toBe(0);
    }
    // The kita count is the one thing on a layer that is text.
    expect(declared("KitaTiles.module.css", ".count", "rotate")).toBe("var(--upright,0deg)");
  });

  it("turn the console's cells the same way, the far one reading upright", () => {
    const consoleCss = read("Console.module.css");
    for (const side of ["right", "top", "left"] as const) {
      expect(turnOf(consoleCss, `.edge[data-edge="${side}"]`), side).toBe(
        turnOf(layers, `.${side}`),
      );
    }
    expect(turnOf(consoleCss, ".edge")).toBe(0);
    expect(turnOf(consoleCss, '.edge[data-edge="top"] > .cell')).toBe(180);
  });
});

describe("the numbers from geometry.ts", () => {
  const stage = Object.keys(stageVars());
  /** Custom properties the components write inline: `"--name":` in a style object. */
  const inline = COMPONENTS.flatMap((name) =>
    [...source(name).matchAll(/"(--[\w-]+)"\s*:/g)].map((match) => match[1] as string),
  );
  const reads = (css: string) =>
    [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] as string);
  const definitions = (css: string) =>
    [...css.matchAll(/(?:^|[{;\s])(--[\w-]+)\s*:/g)].map((m) => m[1] as string);

  it("reach the stylesheets as custom properties, every one of them read", () => {
    const used = new Set(SHEETS.flatMap((name) => reads(read(name))));
    for (const name of stage) {
      expect(used.has(name), name).toBe(true);
    }
    // So is what a component computes from them for one seat or one caption.
    expect(inline.length).toBeGreaterThan(0);
    for (const name of inline) {
      expect(used.has(name), name).toBe(true);
    }
  });

  it("live only in geometry.ts: no stylesheet defines them again", () => {
    for (const name of SHEETS) {
      for (const defined of definitions(read(name))) {
        expect([...stage, ...inline], `${name} ${defined}`).not.toContain(defined);
      }
    }
  });

  it("are all a stylesheet reads, besides tokens and what a rule or a component sets", () => {
    const defined = new Set([
      ...stage,
      ...inline,
      ...definitions(read("../../index.css")),
      ...SHEETS.flatMap((name) => definitions(read(name))),
    ]);
    for (const name of SHEETS) {
      for (const used of reads(read(name))) {
        expect(defined.has(used), `${name} ${used}`).toBe(true);
      }
    }
  });

  it("place the console, the ponds and the hand rows in tile widths", () => {
    const consoleCss = rule(read("Console.module.css"), ".console");
    expect(value(consoleCss, "--from")).toBe("calc((var(--units)-var(--console-size))/2)");
    for (const property of ["left", "top"]) {
      expect(value(consoleCss, property), property).toBe("calc(var(--u)*var(--from))");
    }
    for (const property of ["width", "height"]) {
      expect(value(consoleCss, property), property).toBe("calc(var(--u)*var(--console-size))");
    }
    const pond = rule(read("SeatZone.module.css"), ".pond");
    expect(value(pond, "left")).toBe("calc(var(--u)*var(--pond-x))");
    expect(value(pond, "top")).toBe("calc(var(--u)*var(--pond-y))");
    const hand = rule(read("SeatZone.module.css"), ".hand");
    expect(value(hand, "left")).toBe("calc(var(--u)*var(--hand-start))");
    expect(value(hand, "bottom")).toBe("calc(var(--u)*var(--hand-edge))");
    expect(value(hand, "width")).toBe("calc(var(--u)*(var(--hand-end)-var(--hand-start)))");
  });

  it("size a pond's and a hand row's tiles by the seat's own scale, 1 without one", () => {
    expect(declared("SeatZone.module.css", ".pond", "--tile-w")).toBe("calc(var(--u)*var(--ps,1))");
    expect(declared("SeatZone.module.css", ".hand", "--tile-w")).toBe("calc(var(--u)*var(--hs,1))");
  });

  it("centre a caption on its anchor, a share of the table's side", () => {
    const caption = rule(read("CallCaption.module.css"), ".caption");
    expect(value(caption, "left")).toBe("calc(var(--S)*var(--ax))");
    expect(value(caption, "top")).toBe("calc(var(--S)*var(--ay))");
    expect(value(caption, "translate")).toBe("-50%-50%");
    expect(value(rule(read("CallCaption.module.css"), ".captions"), "inset")).toBe("0");
  });
});

describe("what layout.ts and geometry.ts count on", () => {
  it("draws a tile three wide and four long, and a sideways tile in the turned box", () => {
    const tile = rule(read("../TileImage.module.css"), ".tile");
    expect(value(tile, "--w")).toBe("var(--tile-w,2rem)");
    expect(value(tile, "width")).toBe("var(--w)");
    expect(value(tile, "height")).toBe("calc(var(--w)*4/3)");
    // The hairline is drawn inside the box, so tiles lie edge to edge.
    expect(value(tile, "box-sizing")).toBe("border-box");
    const sideways = rule(read("../TileImage.module.css"), ".sideways");
    expect(value(sideways, "width")).toBe("calc(var(--tile-w,2rem)*4/3)");
    expect(value(sideways, "height")).toBe("var(--tile-w,2rem)");
  });

  it("keeps every pond row a tile long tall, with or without a sideways tile in it", () => {
    expect(declared("../Pond.module.css", ".row", "height")).toBe("calc(var(--tile-w)*4/3)");
    expect(declared("../Pond.module.css", ".pond", "flex-direction")).toBe("column");
  });

  it("sets the drawn tile and the melds apart by layout.ts's gaps", () => {
    expect(factor(declared("../HandRow.module.css", ".drawn", "margin-left"))).toBe(DRAWN_GAP);
    expect(factor(declared("../HandRow.module.css", ".melds", "gap"))).toBe(MELD_GAP);
    expect(factor(declared("../HandRow.module.css", ".melds", "padding-left"))).toBe(MELD_GAP);
  });

  it("gives the kita group the width layout.ts counts: a tile and its two margins", () => {
    const before = factor(declared("KitaTiles.module.css", ".kita", "margin-left"));
    const after = factor(declared("KitaTiles.module.css", ".kita", "margin-right"));
    expect(before + 1 + after).toBeCloseTo(KITA_WIDTH);
    // The count hangs over the group's right margin and never past it.
    const reach = /^calc\(var\(--tile-w\)\*-([\d.]+)\)$/.exec(
      declared("KitaTiles.module.css", ".count", "right"),
    );
    expect(Number(reach?.[1])).toBeLessThanOrEqual(after);
  });

  it("lays the melds from the row's right end, the first call rightmost", () => {
    const melds = rule(read("../HandRow.module.css"), ".melds");
    expect(value(melds, "flex-direction")).toBe("row-reverse");
    expect(value(melds, "margin-left")).toBe("auto");
    expect(declared("../HandRow.module.css", ".row", "width")).toBe("100%");
  });

  it("fits a kakan's low stack into the place of one sideways tile", () => {
    const stack = rule(read("../MeldTiles.module.css"), ".low > .stack");
    expect(declared("../MeldTiles.module.css", ".low", "--meld-w")).toBe("var(--tile-w,2rem)");
    expect(value(stack, "width")).toBe("calc(var(--meld-w)*4/3)");
    // Two sideways tiles of two thirds the size are as tall as one upright tile.
    expect(value(stack, "--tile-w")).toBe("calc(var(--meld-w)*2/3)");
  });
});

describe("the console's two wordings", () => {
  const SMALL = "@container stage";
  const css = read("Console.module.css");

  it("shows the short words only on a small table, in place of the full ones", () => {
    const { inside, outside } = split(css, SMALL);
    expect(value(rule(outside, ".short"), "display")).toBe("none");
    expect(rule(outside, ".full")).toBe("");
    expect(value(rule(inside, ".full"), "display")).toBe("none");
    expect(value(rule(inside, ".doraLabel"), "display")).toBe("none");
    expect(value(rule(inside, ".short"), "display")).not.toBe("none");
    expect(value(rule(inside, ".short"), "display")).not.toBe("");
  });

  it("asks the stage, the container the table is sized in", () => {
    expect(css).toMatch(/@container stage \((max-width|max-height): \d+px\)/);
  });

  it("drops the label of four or five dora indicators, which fill the middle", () => {
    expect(
      value(rule(css, '.dora:is([data-count="4"], [data-count="5"]) > .doraLabel'), "display"),
    ).toBe("none");
  });
});

describe("Korean line breaks", () => {
  it("breaks Korean between words, not inside them", () => {
    expect(rule(read("../../index.css"), "html:lang(ko)")).toMatch(/word-break:\s*keep-all/);
  });
});

describe("forced colours", () => {
  const FORCED = "@media (forced-colors: active)";
  const forced = (name: string) => split(read(name), FORCED).inside;

  it("has a block in every stylesheet that draws with a background or a shadow", () => {
    for (const name of SHEETS) {
      const { inside, outside } = split(read(name), FORCED);
      if (/\b(background(-color)?|box-shadow)\s*:/.test(outside)) {
        expect(inside, name).not.toBe("");
      }
    }
  });

  it("keeps the riichi stick's colours and outlines it", () => {
    const stick = rule(forced("SeatZone.module.css"), ".stick");
    expect(stick).toMatch(/forced-color-adjust:\s*none/);
    expect(stick).toMatch(/outline:[^;]*Highlight/);
  });

  it("draws the turn bar and the last discard's outline in the highlight colour", () => {
    const turn = rule(forced("Console.module.css"), ".turn");
    expect(turn).toMatch(/forced-color-adjust:\s*none/);
    expect(turn).toMatch(/background:\s*Highlight/);
    expect(rule(forced("../TileImage.module.css"), ".highlighted")).toMatch(
      /outline:[^;]*Highlight/,
    );
  });

  it("outlines the mat, the console, the winds, the tiles, the kita count and the captions", () => {
    expect(rule(forced("TableStage.module.css"), ".table")).toMatch(/border:[^;]*CanvasText/);
    expect(rule(forced("Console.module.css"), ".press")).toMatch(/border:[^;]*ButtonText/);
    expect(rule(forced("Console.module.css"), ".wind")).toMatch(/border:[^;]*CanvasText/);
    expect(rule(forced("../TileImage.module.css"), ".tile")).toMatch(/outline:[^;]*CanvasText/);
    expect(rule(forced("KitaTiles.module.css"), ".count")).toMatch(/border:[^;]*CanvasText/);
    expect(rule(forced("CallCaption.module.css"), ".caption")).toMatch(/border:[^;]*CanvasText/);
  });

  it("marks the dealer's wind, which is filled, with a thicker border", () => {
    expect(rule(read("Console.module.css"), ".dealer")).toMatch(/background:/);
    expect(rule(forced("Console.module.css"), ".dealer")).toMatch(/border-width:\s*2px/);
  });

  // The faces are dark artwork made for a white tile: on a dark system theme a tile whose body
  // the system repainted would show black ink on black.
  it("lets a tile keep its own colours, and outlines it", () => {
    const tile = rule(forced("../TileImage.module.css"), ".tile");
    expect(tile).toMatch(/forced-color-adjust:\s*none/);
    expect(tile).toMatch(/outline:[^;]*CanvasText/);
  });

  it("tells a face-down tile from a face, which differ only by their fill", () => {
    const sheet = forced("../TileImage.module.css");
    expect(rule(read("../TileImage.module.css"), ".back")).toMatch(/background-color:/);
    // The fill stays where the tiles keep their own colours; else the back needs a rule of its own.
    const kept = /forced-color-adjust:\s*none/.test(rule(sheet, ".tile"))
      ? "the tiles keep their colours"
      : rule(sheet, ".back");
    expect(kept, "nothing marks a face-down tile in forced colours").not.toBe("");
  });

  it("tells a tsumogiri discard from the others, which differs only by its fill", () => {
    const sheet = forced("../TileImage.module.css");
    expect(rule(read("../TileImage.module.css"), ".dimmed")).toMatch(/background-color:/);
    // The system replaces a background colour, so the dimmer face needs something that stays:
    // the tiles keeping their own colours, or a rule of its own for the dimmed tile.
    const kept = /forced-color-adjust:\s*none/.test(rule(sheet, ".tile"))
      ? "the tiles keep their colours"
      : rule(sheet, ".dimmed");
    expect(kept, "nothing marks a tsumogiri discard in forced colours").not.toBe("");
  });

  it("draws the stage's focus ring in the highlight colour", () => {
    expect(rule(forced("TableStage.module.css"), ".stage:focus-visible::after")).toMatch(
      /outline-color:\s*Highlight/,
    );
  });
});

describe("reduced motion", () => {
  const REDUCED = "@media (prefers-reduced-motion: reduce)";
  // What each animated stylesheet does there: the discard just made is in its place at once, and
  // a caption stands still (a timer removes it).
  const STOPPED: Record<string, [selector: string, declaration: RegExp][]> = {
    "SeatZone.module.css": [[".landing", /animation:\s*none/]],
    "CallCaption.module.css": [[".caption", /animation:\s*none/]],
  };

  it("stops every table animation", () => {
    for (const [name, rules] of Object.entries(STOPPED)) {
      const { inside } = split(read(name), REDUCED);
      for (const [selector, declaration] of rules) {
        expect(rule(inside, selector), `${name} ${selector}`).toMatch(declaration);
      }
    }
  });

  it("stops each of them where it is started", () => {
    for (const [name, rules] of Object.entries(STOPPED)) {
      const { outside } = split(read(name), REDUCED);
      for (const [selector] of rules) {
        expect(rule(outside, selector), `${name} ${selector}`).toMatch(/animation:(?!\s*none)/);
      }
    }
  });

  it("covers every stylesheet that animates or transitions", () => {
    for (const name of SHEETS) {
      const { outside } = split(read(name), REDUCED);
      if (/\b(animation|transition)\s*:(?!\s*none\b)/.test(outside)) {
        expect(Object.keys(STOPPED), name).toContain(name);
      }
    }
  });

  it("leaves a landing discard as it lies, so one without the animation is in its place", () => {
    // The keyframes only say where the tile comes from: its resting look is the tile's own.
    const { outside } = split(read("SeatZone.module.css"), REDUCED);
    expect(outside).toMatch(/@keyframes land \{ from \{[^}]*\} \}/);
    expect(rule(outside, ".landing")).not.toMatch(/opacity|scale|visibility/);
  });
});
