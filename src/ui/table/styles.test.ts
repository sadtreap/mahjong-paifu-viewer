import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");
const PHONES =
  "@media (orientation: portrait) and (max-width: 599px), (orientation: landscape) and (max-height: 500px)";

/** The CSS inside the first at-rule with this prelude. */
function block(css: string, prelude: string): string {
  const start = css.indexOf(prelude);
  if (start < 0) {
    return "";
  }
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") {
      depth++;
    } else if (css[i] === "}" && --depth === 0) {
      return css.slice(css.indexOf("{", start) + 1, i);
    }
  }
  return "";
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

describe("seat plates on phones (compact chip)", () => {
  const compact = block(read("SeatPlates.module.css"), PHONES);

  it("keeps the name as screen-reader text, never display: none", () => {
    const name = rule(compact, ".n");
    expect(name).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(name).not.toMatch(/display:\s*none/);
  });

  it("keeps the seat-colour disc with the initial and the wind badge (amendment 1)", () => {
    expect(compact).not.toMatch(/\.(ini|av|w)\s*\{[^}]*display:\s*(none|contents)/);
    expect(rule(read("SeatPlates.module.css"), ".av")).toMatch(/var\(--seatc\)/);
    expect(rule(compact, ".plate")).toMatch(/var\(--seatc\)/);
  });

  it("keeps the score as screen-reader text too (it is on the console's edge as well)", () => {
    const score = rule(compact, ".p");
    expect(score).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(score).not.toMatch(/display:\s*none/);
  });

  it("keeps wait tiles at least 16 px wide and a short label at every size", () => {
    const css = read("SeatPlates.module.css");
    expect(rule(css, ".wt")).toMatch(/--tile-w:\s*max\(16px/);
    const hidden = [...compact.matchAll(/([^{}]+)\{[^}]*display:\s*none/g)].flatMap((m) =>
      (m[1] ?? "").split(",").map((s) => s.trim()),
    );
    // Only a furiten chip hides "Wait": its red "Furiten" label (never hidden) stands in for it.
    expect(hidden.filter((s) => /\.(lbl|wt)\b/.test(s))).toEqual([".xfu .lbl"]);
    expect(hidden.filter((s) => /\.fu\b/.test(s))).toEqual([]);
  });

  it("keeps the wind badge's corner of the disc free, so it never prints over the aid", () => {
    const css = read("SeatPlates.module.css");
    const badge = rule(compact, ".w");
    const em = (prop: string) => Number(new RegExp(`${prop}:\\s*-([\\d.]+)em`).exec(badge)?.[1]);
    const size = Number(/font-size:\s*([\d.]+)em/.exec(badge)?.[1]);
    const ring = Number(/box-shadow:\s*0 0 0 ([\d.]+)px/.exec(rule(css, ".w"))?.[1]);
    const margin =
      /margin:\s*0 calc\(([\d.]+)em \+ ([\d.]+)px\) calc\(([\d.]+)em \+ ([\d.]+)px\) 0/.exec(
        rule(compact, ".av"),
      );
    expect(margin).not.toBeNull();
    // The disc's font size is the chip's (1em), the badge's is `size` of it.
    expect(Number(margin?.[1])).toBeGreaterThanOrEqual(em("right") * size - 1e-9);
    expect(Number(margin?.[2])).toBeGreaterThanOrEqual(ring);
    expect(Number(margin?.[3])).toBeGreaterThanOrEqual(em("bottom") * size - 1e-9);
    expect(Number(margin?.[4])).toBeGreaterThanOrEqual(ring);
  });

  it("stays two lines tall with 1 px of padding, so it clears the pond rows by its square", () => {
    expect(rule(compact, ".plate")).toMatch(/padding:\s*1px \d+px 1px 2px/);
    expect(rule(compact, ".x")).toMatch(/line-height:\s*1\.1\b/);
  });
});

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

  it("keeps a winning hand's second row clear of the first row's thickness and its shadow", () => {
    const tiles = rule(read("../ResultPanel.module.css"), ".tiles");
    const rowGap = Number(/gap:\s*calc\(var\(--tile-w\)\s*\*\s*([\d.]+)\)/.exec(tiles)?.[1]);
    // TileImage.module.css: the edge is 0.16 tile deep, its drop shadow 1.4 times that.
    expect(rowGap).toBeGreaterThanOrEqual(0.16 * 1.4);
  });
});

describe("Korean line breaks", () => {
  it("breaks Korean between words, not inside them", () => {
    expect(rule(read("../../index.css"), "html:lang(ko)")).toMatch(/word-break:\s*keep-all/);
  });
});

describe("forced colours", () => {
  const forced = (name: string) => block(read(name), "@media (forced-colors: active)");

  it("keeps the sticks' colours with an outline in the HUD, plates and on the table", () => {
    for (const [name, selector] of [
      ["Hud.module.css", ".stick100"],
      ["SeatPlates.module.css", ".stick"],
      ["SeatZone.module.css", ".stick"],
    ] as const) {
      const css = forced(name);
      expect(css, name).toMatch(
        new RegExp(`\\${selector}[^{]*\\{[^}]*forced-color-adjust:\\s*none`),
      );
      expect(css, name).toMatch(
        new RegExp(`\\${selector}[^{]*\\{[^}]*outline:[^;]*(CanvasText|Highlight)`),
      );
    }
  });

  it("hides the room and the wall shadows and outlines lids and caps", () => {
    expect(forced("Room.module.css")).toMatch(/\.room\s*\{[^}]*display:\s*none/);
    const walls = forced("WallLayer.module.css");
    expect(walls).toMatch(/\.shadow\s*\{[^}]*display:\s*none/);
    expect(walls).toMatch(/\.cap\s*\{[^}]*outline:\s*1px solid CanvasText/);
  });
});

describe("reduced motion", () => {
  it("stops every table animation and shows landing tiles", () => {
    expect(
      block(read("FlightLayer.module.css"), "@media (prefers-reduced-motion: reduce)"),
    ).toMatch(/display:\s*none/);
    const zone = block(read("SeatZone.module.css"), "@media (prefers-reduced-motion: reduce)");
    expect(zone).toMatch(/\.revealIn\s*\{[^}]*animation:\s*none/);
    expect(zone).toMatch(/\.landing\s*\{[^}]*opacity:\s*1/);
    expect(block(read("WallLayer.module.css"), "@media (prefers-reduced-motion: reduce)")).toMatch(
      /animation:\s*none/,
    );
    expect(
      block(read("CallCaption.module.css"), "@media (prefers-reduced-motion: reduce)"),
    ).toMatch(/step-end/);
  });
});
