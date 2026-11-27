import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");

/** The table's stylesheets, and the tile primitives' it is drawn with. */
const SHEETS = [
  ...readdirSync(new URL(".", import.meta.url)).filter((name) => name.endsWith(".module.css")),
  "../TileImage.module.css",
  "../Pond.module.css",
  "../HandRow.module.css",
  "../MeldTiles.module.css",
];

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

/** The declarations of the first rule whose selector list includes `selector`. */
function rule(css: string, selector: string): string {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? "").split(",").some((s) => s.trim() === selector)) {
      return match[2] ?? "";
    }
  }
  return "";
}

describe("tiles over the table", () => {
  it("keeps a called discard opaque (a filter, not opacity), so no farther edge shows through", () => {
    const called = rule(read("../TileImage.module.css"), "[data-thick] .called");
    expect(called).toMatch(/opacity:\s*1\s*;/);
    expect(called).toMatch(/filter:/);
  });

  it("paints the far seat's pond over its hand row's drawn thickness", () => {
    expect(rule(read("SeatZone.module.css"), '[data-side="top"] > .pond')).toMatch(
      /z-index:\s*[1-9]/,
    );
  });
});

describe("compositing", () => {
  it("uses no preserve-3d and no will-change", () => {
    for (const name of SHEETS) {
      expect(read(name), name).not.toMatch(/preserve-3d|will-change/);
    }
  });

  it("ends the plane's background with a solid colour", () => {
    const background = /background:([^;]*);/.exec(rule(read("TableStage.module.css"), ".plane"));
    expect(background?.[1]?.trim()).toMatch(/,\s*var\(--[\w-]+\)$/);
  });

  it("never sets a border on the plane outside its base rule, which holds the rails", () => {
    for (const name of SHEETS) {
      const css = read(name);
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) =>
        (match[1] ?? "").split(",").some((s) => /\.plane(?![\w-])(?!::)/.test(s)),
      );
      const offenders = rules.filter((match) =>
        /(^|[;\s])border(-width)?\s*:/.test(match[2] ?? ""),
      );
      expect(offenders.length, name).toBe(name === "TableStage.module.css" ? 1 : 0);
    }
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
      if (/\b(background|box-shadow)\s*:/.test(outside)) {
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
    expect(rule(forced("../TileImage.module.css"), "[data-thick] .highlighted")).toMatch(
      /outline:[^;]*Highlight/,
    );
  });

  it("outlines the console, the winds, the tags and the tiles", () => {
    expect(rule(forced("Console.module.css"), ".press")).toMatch(/border:[^;]*ButtonText/);
    expect(rule(forced("Console.module.css"), ".wind")).toMatch(/border:[^;]*CanvasText/);
    expect(rule(forced("SeatTags.module.css"), ".tag")).toMatch(/border-color:\s*CanvasText/);
    expect(rule(forced("../TileImage.module.css"), "[data-thick] .tile")).toMatch(
      /outline:[^;]*CanvasText/,
    );
    expect(rule(forced("WallLayer.module.css"), ".face")).toMatch(/outline:[^;]*CanvasText/);
  });

  it("hides the felt's apron and the wall shadows and outlines lids and caps", () => {
    expect(rule(forced("TableStage.module.css"), ".apron")).toMatch(/display:\s*none/);
    const walls = forced("WallLayer.module.css");
    expect(rule(walls, ".shadow")).toMatch(/display:\s*none/);
    expect(rule(walls, ".cap")).toMatch(/outline:\s*1px solid CanvasText/);
  });
});

describe("reduced motion", () => {
  const REDUCED = "@media (prefers-reduced-motion: reduce)";
  // What each animated stylesheet does there: the flight proxy is not drawn at all (the real tile
  // shows at once), the reveal and the leaving wall do not move, and a caption stands still.
  const STOPPED: Record<string, [selector: string, declaration: RegExp][]> = {
    "FlightLayer.module.css": [[".flight", /display:\s*none/]],
    "SeatZone.module.css": [
      [".revealIn", /animation:\s*none/],
      [".landing", /opacity:\s*1/],
    ],
    "WallLayer.module.css": [[".leaving", /animation:\s*none/]],
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

  it("covers every stylesheet that animates or transitions", () => {
    for (const name of SHEETS) {
      const { outside } = split(read(name), REDUCED);
      if (/\b(animation|transition)\s*:(?!\s*none\b)/.test(outside)) {
        expect(Object.keys(STOPPED), name).toContain(name);
      }
    }
  });
});
