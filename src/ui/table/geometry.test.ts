import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Seat } from "../../core/model";
import type { Tile } from "../../core/tile";
import type { MeldView, SeatView } from "../../replay/types";
import { handRowWidth } from "../layout";
import type { Side } from "../viewer/types";
import {
  CAPTION_SLOTS,
  CAPTION_X,
  COACH_ANCHOR,
  CONSOLE_FREE_STRIPS,
  captionSlots,
  emptySide,
  frameHeightFactor,
  HAND_ROW_DEPTH,
  OPP_ROW_END,
  OPP_ROW_START,
  oppRowLayout,
  oppRowUnits,
  PLATE_ANCHORS,
  PLATE_MAX_WIDTH,
  PRESETS,
  platesFor,
  project,
  seatViewEqual,
  snapS,
  wallFaceX,
  wallLean,
  wallLength,
  wallLidDepth,
} from "./geometry";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

interface Block {
  selector: string;
  body: string;
  /** The enclosing at-rule's prelude, or "" at the top level. */
  at: string;
}

/** Flattens a stylesheet into rules, each with its enclosing at-rules' preludes. */
function rules(css: string, at = ""): Block[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Block[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) {
      break;
    }
    const selector = text.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === "{") {
        depth++;
      } else if (text[j] === "}") {
        depth--;
      }
      j++;
    }
    const body = text.slice(open + 1, j - 1);
    if (selector.startsWith("@")) {
      out.push(...rules(body, at === "" ? selector : `${at} ${selector}`));
    } else {
      out.push({ selector, body, at });
    }
    i = j;
  }
  return out;
}

/** A custom property's value in a rule body, as a number. */
function prop(body: string, name: string): number | undefined {
  const match = new RegExp(`${name}:\\s*([-\\d.]+)`).exec(body);
  return match ? Number(match[1]) : undefined;
}

/** Splits a declaration value on commas outside parentheses. */
function layersOf(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
    } else if (c === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

const stageCss = rules(read("TableStage.module.css"));
const find = (selector: string, at = "") =>
  stageCss.find((r) => r.selector === selector && r.at === at);
const PORTRAIT = "@media (orientation: portrait)";

describe("presets", () => {
  it("has sines and cosines that match the tilts", () => {
    for (const preset of Object.values(PRESETS)) {
      const radians = (preset.tilt * Math.PI) / 180;
      expect(Math.abs(Math.sin(radians) - preset.sin)).toBeLessThan(1e-5);
      expect(Math.abs(Math.cos(radians) - preset.cos)).toBeLessThan(1e-5);
    }
  });

  it("matches the CSS in every preset block", () => {
    const base = find(".stage");
    const portrait = find(".stage", PORTRAIT);
    const flat = find('.stage[data-view="flat"]');
    expect(base && portrait && flat).toBeTruthy();
    for (const [block, preset] of [
      [base, PRESETS.landscape],
      [portrait, PRESETS.portrait],
      [flat, PRESETS.flat],
    ] as const) {
      expect(prop(block?.body ?? "", "--tilt")).toBe(preset.tilt);
      expect(prop(block?.body ?? "", "--sin")).toBe(preset.sin);
      expect(prop(block?.body ?? "", "--cos")).toBe(preset.cos);
    }
    expect(prop(base?.body ?? "", "--k")).toBe(PRESETS.landscape.k);
    expect(prop(portrait?.body ?? "", "--k")).toBe(PRESETS.portrait.k);
    expect(prop(base?.body ?? "", "--below")).toBe(PRESETS.landscape.below);
    expect(prop(base?.body ?? "", "--ztop")).toBe(1);
    expect(prop(flat?.body ?? "", "--ztop")).toBe(PRESETS.flat.ztopWalls);
  });

  it("reserves the walls' far lids in the frame (CSS --ztop with walls)", () => {
    expect(prop(find(".stage[data-walls]")?.body ?? "", "--ztop")).toBe(
      PRESETS.landscape.ztopWalls,
    );
    expect(prop(find(".stage[data-walls]", PORTRAIT)?.body ?? "", "--ztop")).toBe(
      PRESETS.portrait.ztopWalls,
    );
    for (const preset of [PRESETS.landscape, PRESETS.portrait]) {
      const depth = wallLidDepth(preset);
      expect(preset.ztopWalls).toBeGreaterThanOrEqual(depth);
      expect(preset.ztopWalls - depth).toBeLessThan(0.01);
    }
  });

  it("keeps the flat rule after the walls rule, so flat wins", () => {
    const walls = stageCss.findIndex((r) => r.selector === ".stage[data-walls]" && r.at === "");
    const flat = stageCss.findIndex((r) => r.selector === '.stage[data-view="flat"]');
    expect(walls).toBeGreaterThanOrEqual(0);
    expect(flat).toBeGreaterThan(walls);
  });
});

describe("CSS layer rules", () => {
  it("ends the plane's background with a solid colour", () => {
    const plane = find(".plane");
    const background = /(?:^|;)\s*background:\s*([\s\S]*?);/.exec(plane?.body ?? "")?.[1] ?? "";
    const layers = layersOf(background);
    expect(layers.length).toBeGreaterThan(1);
    expect(layers.at(-1)).toMatch(/^(var\(--[\w-]+\)|#[0-9a-f]{3,8}|rgb\([^)]*\))$/i);
  });

  it("snaps S to an even pixel count", () => {
    for (const frame of stageCss.filter(
      (r) => r.selector === ".frame" && !r.at.startsWith("@supports"),
    )) {
      if (/--S:/.test(frame.body)) {
        expect(frame.body).toMatch(/--S:\s*round\(\s*down,[\s\S]*,\s*2px\s*\)/);
      }
    }
  });

  it("never sets a border or border width on the plane outside its base rule", () => {
    const tableCss = readdirSync(new URL(".", import.meta.url)).filter((name) =>
      name.endsWith(".module.css"),
    );
    for (const name of tableCss) {
      for (const rule of rules(read(name))) {
        const targetsPlane = rule.selector
          .split(",")
          .some((s) => /\.plane(?![\w-])(?!::)/.test(s.trim()));
        const base =
          name === "TableStage.module.css" && rule.selector === ".plane" && rule.at === "";
        if (!targetsPlane || base) {
          continue;
        }
        expect(rule.body, `${name} ${rule.at} ${rule.selector}`).not.toMatch(
          /(^|[;\s])border(-width)?\s*:/,
        );
      }
    }
  });

  it("keeps wall containers and flight proxies out of the pointer's way", () => {
    const walls = rules(read("WallLayer.module.css"));
    expect(walls.find((r) => r.selector === ".sprites")?.body).toMatch(/pointer-events:\s*none/);
    expect(walls.find((r) => r.selector === ".face")?.body).toMatch(/pointer-events:\s*auto/);
    const layers = rules(read("layers.module.css"));
    const fx = layers.find((r) => r.selector.includes(".layer.fx > *"));
    expect(fx?.body).toMatch(/pointer-events:\s*none/);
    const captions = rules(read("CallCaption.module.css"));
    expect(captions.find((r) => r.selector === ".caption")?.body).toMatch(/pointer-events:\s*none/);
  });

  it("uses no preserve-3d and no will-change", () => {
    for (const name of readdirSync(new URL(".", import.meta.url)).filter((n) =>
      n.endsWith(".css"),
    )) {
      const css = read(name).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, name).not.toMatch(/preserve-3d|will-change/);
    }
  });
});

describe("project", () => {
  it("puts the near edge's centre on the frame's centre line, `below` above its bottom", () => {
    const p = project(10, 20, PRESETS.landscape);
    expect(p.leftFraction).toBeCloseTo(0.5);
    expect(p.bottomOfS).toBeCloseTo(PRESETS.landscape.below);
    expect(p.scale).toBeCloseTo(1);
  });

  it("foreshortens the far edge by k / (k + sin)", () => {
    for (const preset of [PRESETS.landscape, PRESETS.portrait]) {
      const far = project(0, 0, preset);
      const r = preset.k / (preset.k + preset.sin);
      expect(far.scale).toBeCloseTo(r);
      expect(far.leftFraction).toBeCloseTo(0.5 - 0.5 * r);
      expect(far.bottomOfS).toBeCloseTo(preset.below + preset.cos * r);
    }
    expect(project(0, 0, PRESETS.landscape).scale).toBeCloseTo(0.673, 3);
    expect(project(0, 0, PRESETS.portrait).scale).toBeCloseTo(0.827, 3);
  });

  it("is the identity in flat mode (plus the strip below)", () => {
    for (const [x, y] of [
      [0, 0],
      [4.4, 15.8],
      [20, 20],
    ] as const) {
      const p = project(x, y, PRESETS.flat);
      expect(p.leftFraction).toBeCloseTo(x / 20);
      expect(p.bottomOfS).toBeCloseTo(PRESETS.flat.below + (20 - y) / 20);
      expect(p.scale).toBe(1);
    }
  });

  it("keeps every anchor inside the frame", () => {
    const anchors = [
      ...Object.values(PLATE_ANCHORS),
      ...CAPTION_SLOTS.map((y) => [CAPTION_X, y] as const),
      COACH_ANCHOR,
    ];
    for (const preset of Object.values(PRESETS)) {
      const hf = frameHeightFactor(preset, false);
      for (const [x, y] of anchors) {
        const p = project(x, y, preset);
        expect(p.leftFraction).toBeGreaterThan(0);
        expect(p.leftFraction).toBeLessThan(1);
        expect(p.bottomOfS).toBeGreaterThan(0);
        expect(p.bottomOfS).toBeLessThan(hf);
      }
    }
  });
});

describe("frameHeightFactor", () => {
  it("gives the frame's height for each preset", () => {
    expect(frameHeightFactor(PRESETS.landscape, false)).toBeCloseTo(0.643, 3);
    expect(frameHeightFactor(PRESETS.portrait, false)).toBeCloseTo(0.829, 3);
    expect(frameHeightFactor(PRESETS.flat, false)).toBeCloseTo(1.085, 3);
    expect(frameHeightFactor(PRESETS.flat, true)).toBeCloseTo(1.085, 3);
  });

  it("reserves more with standing walls, enough for their far lids", () => {
    expect(frameHeightFactor(PRESETS.landscape, true)).toBeCloseTo(0.681, 3);
    expect(frameHeightFactor(PRESETS.portrait, true)).toBeCloseTo(0.862, 3);
  });
});

describe("snapS", () => {
  it("floors to an even pixel count", () => {
    expect(snapS(1033)).toBe(1032);
    expect(snapS(1033.9)).toBe(1032);
    expect(snapS(1034)).toBe(1034);
    expect(snapS(1.5)).toBe(0);
    expect(snapS(-3)).toBe(0);
  });
});

describe("emptySide", () => {
  it("moves the sanma empty chair with the point of view", () => {
    expect(emptySide(3, 0)).toBe("left");
    expect(emptySide(3, 1)).toBe("top");
    expect(emptySide(3, 2)).toBe("right");
  });

  it("has no empty chair with four players", () => {
    for (const pov of [0, 1, 2, 3] as Seat[]) {
      expect(emptySide(4, pov)).toBeNull();
    }
  });
});

describe("wallFaceX", () => {
  it("runs side walls from their row's start (0.4, the right one from 1.4)", () => {
    expect(wallFaceX(0, 13, false, "right")).toBeCloseTo(1.9);
    expect(wallFaceX(12, 13, false, "left")).toBeCloseTo(12.9);
  });

  it("runs the far wall leftward from x 19.6", () => {
    expect(wallFaceX(0, 13, false, "top")).toBeCloseTo(19.1);
    expect(wallFaceX(12, 13, false, "top")).toBeCloseTo(7.1);
  });

  it("sets the drawn tile apart by 0.4 tiles", () => {
    expect(wallFaceX(13, 13, true, "left")).toBeCloseTo(14.3);
    expect(wallFaceX(13, 13, true, "top")).toBeCloseTo(5.7);
    // The gap applies to the drawn tile only.
    expect(wallFaceX(12, 13, true, "left")).toBeCloseTo(12.9);
  });

  it("scales with the seat's tile scale", () => {
    expect(wallFaceX(2, 10, false, "left", 0.8)).toBeCloseTo(0.4 + 2.5 * 0.8);
  });

  it("measures a wall's length in tiles", () => {
    expect(wallLength({ hand: Array(13).fill("1m"), drawn: null })).toBe(13);
    expect(wallLength({ hand: Array(10).fill("1m"), drawn: "2m" })).toBeCloseTo(11.4);
  });
});

function seat(view: Partial<SeatView> = {}): SeatView {
  return {
    hand: ["1m", "2m", "3m"],
    drawn: null,
    melds: [{ type: "pon", tiles: ["5p", "5p"], from: 1, calledTile: "0p" }],
    kita: [],
    discards: [{ tile: "9s", tsumogiri: true, riichi: false, called: false }],
    score: 25000,
    riichi: false,
    ...view,
  };
}

describe("seatViewEqual", () => {
  it("compares snapshots by content, not identity", () => {
    expect(seatViewEqual(seat(), seat())).toBe(true);
  });

  it("sees every drawn difference", () => {
    const base = seat();
    const changes: Partial<SeatView>[] = [
      { hand: ["1m", "2m", "4m"] },
      { drawn: "7z" },
      { melds: [{ type: "pon", tiles: ["5p", "5p"], from: 2, calledTile: "0p" }] },
      { melds: [] },
      { kita: ["4z"] },
      { discards: [{ tile: "9s", tsumogiri: true, riichi: false, called: true }] },
      { discards: [] },
      { score: 24000 },
      { riichi: true },
    ];
    for (const change of changes) {
      expect(seatViewEqual(base, seat(change)), JSON.stringify(change)).toBe(false);
    }
  });
});

describe("platesFor", () => {
  const seats = [seat({ score: 1 }), seat({ score: 2 }), seat({ score: 3 }), seat({ score: 4 })];
  const names = ["A", "B", "C", "D"];

  it("lists the four seats in side order from the point of view", () => {
    const plates = platesFor({ playerCount: 4, dealer: 2, seats, names, pov: 1, aid: () => null });
    expect(plates.map((p) => [p.seat, p.side, p.wind, p.dealer])).toEqual([
      [1, "bottom", 3, false],
      [2, "right", 0, true],
      [3, "top", 1, false],
      [0, "left", 2, false],
    ]);
  });

  it("leaves out the sanma empty chair and gives East, South and West", () => {
    const kita = [seat({ kita: ["4z", "4z"] }), seat(), seat(), seat()];
    for (const pov of [0, 1, 2] as Seat[]) {
      const plates = platesFor({
        playerCount: 3,
        dealer: 1,
        seats: kita,
        names,
        pov,
        aid: (s) => (s === pov ? { kind: "shanten", value: 2 } : null),
      });
      expect(plates.map((p) => p.seat).sort()).toEqual([0, 1, 2]);
      expect(plates.map((p) => p.wind).sort()).toEqual([0, 1, 2]);
      const sides = plates.map((p) => p.side);
      expect(sides).not.toContain(emptySide(3, pov) as Side);
      expect(plates.find((p) => p.seat === 0)?.kita).toBe(2);
      expect(plates.find((p) => p.seat === pov)?.aid).toEqual({ kind: "shanten", value: 2 });
    }
  });
});

describe("opponent hand rows", () => {
  it("stop short of the next seat's row in the far corners", () => {
    // A row's last tile lies along the next edge's corner square; the next seat's first tiles lie
    // HAND_ROW_DEPTH deep along that edge.
    expect(20 - OPP_ROW_END).toBeGreaterThanOrEqual(HAND_ROW_DEPTH + 0.1);
    for (const side of ["right", "top", "left"] as const) {
      expect(OPP_ROW_START[side] + oppRowUnits(side)).toBeCloseTo(OPP_ROW_END);
    }
  });

  it("leave the near-right corner to the own hand's melds (a kakan stack, 2.6 units tall)", () => {
    const kakanTop = 2 * 1.3 + 0.05;
    for (const preset of Object.values(PRESETS)) {
      // The right row's first tile and its drawn thickness (toward the near edge).
      const nearest = project(19, 20 - OPP_ROW_START.right + 0.16, preset);
      expect(nearest.bottomOfS * 20, `tilt ${preset.tilt}`).toBeGreaterThan(kakanTop);
    }
  });

  it("match the CSS: --row0 per layer and the row's end", () => {
    const layersCss = rules(read("layers.module.css"));
    expect(prop(layersCss.find((r) => r.selector === ".layer")?.body ?? "", "--row0")).toBe(
      OPP_ROW_START.top,
    );
    expect(prop(layersCss.find((r) => r.selector === ".right")?.body ?? "", "--row0")).toBe(
      OPP_ROW_START.right,
    );
    expect(OPP_ROW_START.left).toBe(OPP_ROW_START.top);
    const opp = rules(read("SeatZone.module.css")).find((r) => r.selector === ".opp");
    expect(opp?.body).toMatch(
      new RegExp(`width:\\s*calc\\(var\\(--u\\) \\* \\(${OPP_ROW_END} - var\\(--row0\\)\\)\\)`),
    );
    expect(opp?.body).toMatch(/left:\s*calc\(var\(--u\) \* var\(--row0\)\)/);
  });
});

describe("wallLean and oppRowLayout", () => {
  const tiles = (n: number): Tile[] => Array(n).fill("1m");
  const pon: MeldView = { type: "pon", tiles: ["5p", "5p"], from: 2, calledTile: "5p" };
  type RowView = Pick<SeatView, "hand" | "drawn" | "melds" | "kita">;
  const view = (patch: Partial<RowView> = {}): RowView => ({
    hand: tiles(13),
    drawn: "2m",
    melds: [],
    kita: [],
    ...patch,
  });

  it("leans the right wall toward its row's end, the far wall outward, the left wall back", () => {
    expect(wallLean("right", 15.8, 1)).toBeCloseTo(2.16, 1);
    expect(wallLean("right", 15.8, 1, PRESETS.portrait)).toBeLessThan(wallLean("right", 15.8, 1));
    expect(wallLean("top", 14.8, 1)).toBeCloseTo(0.36, 1);
    expect(wallLean("top", 6, 1)).toBe(0);
    expect(wallLean("left", 15, 1)).toBe(0);
  });

  it("keeps the kita and melds after a standing wall clear of its lean", () => {
    for (const patch of [
      {},
      { kita: ["4z", "4z"] },
      { hand: tiles(10), melds: [pon] },
      { hand: tiles(7), melds: [pon, pon], kita: ["4z"] },
      { hand: tiles(1), melds: [pon, pon, pon, pon], kita: ["4z"] },
    ]) {
      const v = view(patch as Partial<RowView>);
      for (const side of ["right", "top", "left"] as const) {
        const row = oppRowLayout(v, 1, side, true);
        const wallEnd = row.start + wallLength(v) * row.hs;
        const follow = v.kita.length > 0 ? 0.4 : v.melds.length > 0 ? 0.25 : 0;
        // The next lying tile starts after the gap and its own margin, past the lean (less 0.15).
        const next = wallEnd + row.gap + follow * row.hs;
        expect(next, `${side} ${JSON.stringify(patch)}`).toBeGreaterThanOrEqual(
          wallEnd + wallLean(side, wallEnd, row.hs) - 0.15 - 1e-9,
        );
        // Everything still fits the row.
        expect(handRowWidth(v, 1) * row.hs + row.gap).toBeLessThanOrEqual(oppRowUnits(side) + 1e-9);
      }
    }
  });

  it("needs no gap without a wall, and scales a long row down", () => {
    const long = view({ hand: tiles(1), melds: [pon, pon, pon, pon], kita: ["4z"] });
    expect(oppRowLayout(long, 1, "top", false)).toEqual({
      start: 0.4,
      hs: oppRowUnits("top") / handRowWidth(long, 1),
      gap: 0,
    });
    expect(oppRowLayout(view(), 1, "right", false)).toEqual({ start: 1.4, hs: 1, gap: 0 });
  });
});

describe("plate anchors", () => {
  // The free squares' sides across the plate (X in plane units), from the hand rows (a kakan stack
  // where melds lie), the ponds (up to four rows, riichi tiles sideways) and the console.
  const across: Record<Side, readonly [number, number]> = {
    bottom: [2.45, 7.1],
    right: [12.8, 18.22],
    top: [12.9, 17.55],
    left: [1.78, 7.2],
  };

  it("sit in the free squares, with room for the widest plate", () => {
    for (const side of ["bottom", "right", "top", "left"] as const) {
      const [x] = PLATE_ANCHORS[side];
      const [lo, hi] = across[side];
      expect(x - PLATE_MAX_WIDTH[side] / 2, side).toBeGreaterThanOrEqual(lo);
      expect(x + PLATE_MAX_WIDTH[side] / 2, side).toBeLessThanOrEqual(hi);
    }
  });
});

describe("call caption slots", () => {
  const sides = ["bottom", "right", "top", "left"] as const;
  // The band: line-height 1 plus its padding, in units of u (CallCaption.module.css).
  const css = read("CallCaption.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const font = Number(/clamp\(12px,\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/.exec(css)?.[1]);
  const pad = /padding:\s*([\d.]+)em\s+[\d.]+em\s+([\d.]+)em/.exec(css);
  const band = font * (1 + Number(pad?.[1]) + Number(pad?.[2]));

  it("puts one caption in its caller's slot, a far or left caller in the upper one", () => {
    expect(captionSlots(["top"])).toEqual([CAPTION_SLOTS[0]]);
    expect(captionSlots(["left"])).toEqual([CAPTION_SLOTS[0]]);
    expect(captionSlots(["right"])).toEqual([CAPTION_SLOTS[1]]);
    expect(captionSlots(["bottom"])).toEqual([CAPTION_SLOTS[1]]);
  });

  it("never stacks two captions of a step (a double ron) in one slot", () => {
    for (const a of sides) {
      for (const b of sides) {
        if (a !== b) {
          const [ya, yb] = captionSlots([a, b]);
          expect(ya, `${a}+${b}`).not.toBe(yb);
        }
      }
    }
  });

  it("keeps the band inside a strip of the console without text, at every tilt", () => {
    expect(band).toBeGreaterThan(0.5);
    CAPTION_SLOTS.forEach((y, index) => {
      const [top, bottom] = CONSOLE_FREE_STRIPS[index] ?? [0, 0];
      for (const preset of Object.values(PRESETS)) {
        // The band is flat DOM. A plane unit of depth is u · cos · scale² high on screen (the
        // derivative of project's bottomOfS), so the band spans band / (cos · scale²) of felt.
        const { scale } = project(CAPTION_X, y, preset);
        const depth = band / (preset.cos * scale * scale);
        expect(y - depth / 2, `${y}`).toBeGreaterThan(top);
        expect(y + depth / 2, `${y}`).toBeLessThan(bottom);
      }
    });
  });
});

describe("first-use coach mark", () => {
  it("is never wider than the felt between the side seats' rows at its depth", () => {
    const css = readFileSync(new URL("../shell/FirstUseHint.module.css", import.meta.url), "utf8");
    const caps = [
      ...css.matchAll(/max-width:\s*(?:min\()?calc\(var\(--S[^)]*\)\s*\*\s*([\d.]+)\)/g),
    ].map((m) => Number(m[1]));
    expect(caps.length).toBeGreaterThan(0);
    const [x, y] = COACH_ANCHOR;
    for (const cap of caps) {
      for (const preset of Object.values(PRESETS)) {
        // Half its width in plane units at its depth: (cap · S / 2) / (u · scale), u = S / 20.
        const half = (cap * 10) / project(x, y, preset).scale;
        expect(x + half, `${cap}`).toBeLessThan(20 - HAND_ROW_DEPTH);
        expect(x - half, `${cap}`).toBeGreaterThan(HAND_ROW_DEPTH);
      }
    }
  });
});
