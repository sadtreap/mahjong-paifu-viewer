import { describe, expect, it } from "vitest";
import type { Seat } from "../../core/model";
import type { Tile } from "../../core/tile";
import type { MeldView, SeatView } from "../../replay/types";
import { handRowWidth } from "../layout";
import type { Arrangement, Side } from "../viewer/types";
import {
  CAMERAS,
  type Camera,
  CONSOLE,
  cameraFor,
  captionAnchor,
  cornerVars,
  DOCK_GAP,
  depthAt,
  dockStrip,
  emptySide,
  frameHeightFactor,
  HAND_ROW_DEPTH,
  OPP_ROW_END,
  OPP_ROW_START,
  OWN_HAND,
  OWN_HAND_TOP,
  oppRowLayout,
  oppRowUnits,
  POND,
  POND_FOOT,
  pondRow,
  pondRowEnds,
  pondScale,
  pondSlot,
  project,
  RAIL,
  railLip,
  STACK_TILT,
  seatToPlane,
  snapS,
  stackCamera,
  stageVars,
  TAG_STRIP,
  type TagPlace,
  tableSize,
  tagPlace,
  tagStrip,
  WALL_EDGE_GAP,
  wallFaceX,
  wallLean,
  wallLength,
  wallLidDepth,
} from "./geometry";

const ARRANGEMENTS: readonly Arrangement[] = ["wide", "short", "stack"];
const SIDES: readonly Side[] = ["bottom", "right", "top", "left"];
/**
 * Stack cameras fitted to a tall, a squarish and a squat stage: the flattest, one between, the
 * steepest.
 */
const FITTED = [
  { width: 390, height: 1200 },
  { width: 768, height: 720 },
  { width: 320, height: 234 },
].map((box) => cameraFor("stack", "3d", box));
const everyCamera: Camera[] = [
  ...ARRANGEMENTS.flatMap((arrangement) => [
    cameraFor(arrangement, "3d"),
    cameraFor(arrangement, "flat"),
  ]),
  ...FITTED,
];

const lying = (n: number, riichiAt = -1) =>
  Array.from({ length: n }, (_, i) => ({ riichi: i === riichiAt }));
const ROW = (4 / 3) * POND.tile;

describe("cameras", () => {
  it("has sines and cosines that match the tilts", () => {
    for (const c of everyCamera) {
      const radians = (c.tilt * Math.PI) / 180;
      expect(c.sin).toBeCloseTo(Math.sin(radians), 9);
      expect(c.cos).toBeCloseTo(Math.cos(radians), 9);
    }
  });

  it("looks at the wide and the short arrangement from the same place", () => {
    const { wide, short } = CAMERAS;
    expect([wide.tilt, wide.k, wide.below]).toEqual([34, 1.15, 0.085]);
    expect([short.tilt, short.k, short.below, short.ztop]).toEqual([
      wide.tilt,
      wide.k,
      wide.below,
      wide.ztop,
    ]);
  });

  it("stands almost above the table in the stack arrangement, with a 4 px gutter", () => {
    const { stack } = CAMERAS;
    expect([stack.tilt, stack.k, stack.gutterX]).toEqual([20, 2.6, 4]);
    // The frame sits at the bottom of the stage; the others are centred.
    expect(stack.align).toBe(1);
    expect(CAMERAS.wide.align).toBe(0.5);
    expect(CAMERAS.short.align).toBe(0.5);
  });

  it("is flat with a tilt of 0 in every arrangement", () => {
    for (const arrangement of ARRANGEMENTS) {
      const flat = cameraFor(arrangement, "flat");
      expect([flat.tilt, flat.sin, flat.cos, flat.ztop]).toEqual([0, 0, 1, 1]);
      expect(flat.gutterX).toBe(CAMERAS[arrangement].gutterX);
      expect(cameraFor(arrangement, "3d")).toBe(CAMERAS[arrangement]);
    }
  });

  it("reserves the standing walls' far lids in every 3D frame", () => {
    for (const c of [...Object.values(CAMERAS), ...FITTED]) {
      const depth = wallLidDepth(c);
      expect(c.ztop).toBeGreaterThanOrEqual(depth);
      expect(c.ztop - depth).toBeLessThan(0.01);
    }
  });

  it("tilts the stack camera so that the frame fills the stage, as far as it can", () => {
    const [tall, square, squat] = FITTED as [Camera, Camera, Camera];
    // A tall stage has height to spare even seen from the flattest tilt; a squat one is short of
    // height even from the steepest.
    expect(tall.tilt).toBe(STACK_TILT.min);
    expect(squat.tilt).toBe(STACK_TILT.max);
    expect(square.tilt).toBeGreaterThan(STACK_TILT.min);
    expect(square.tilt).toBeLessThan(STACK_TILT.max);
    // Between the two, the frame fills the stage: all of its width and nearly all of its height.
    const box = { width: 768, height: 720 };
    const s = tableSize(box, square);
    expect(s * 2 * square.spread).toBeGreaterThan(box.width - 2 * square.gutterX - 2);
    expect(s * frameHeightFactor(square)).toBeLessThanOrEqual(box.height);
    expect(s * frameHeightFactor(square)).toBeGreaterThan(0.97 * box.height);
    // The same tilt is the same camera; an unknown stage gets the standard one.
    expect(stackCamera(box)).toBe(square);
    expect(cameraFor("stack", "3d", null)).toBe(CAMERAS.stack);
    expect(cameraFor("stack", "3d", { width: 0, height: 0 })).toBe(CAMERAS.stack);
    // A tablet in portrait is wide enough to be seen from the flattest tilt.
    expect(cameraFor("stack", "3d", { width: 768, height: 804 }).tilt).toBe(STACK_TILT.min);
    expect(CAMERAS.stack.tilt).toBe(STACK_TILT.standard);
    // Seen from above, the tilt does not matter.
    expect(cameraFor("stack", "flat", box)).toBe(cameraFor("stack", "flat"));
  });

  it("lets a stack stage cut off the table beside the side rows, but never a tile", () => {
    for (const c of [CAMERAS.stack, cameraFor("stack", "flat"), ...FITTED]) {
      expect(c.spread).toBeLessThan(0.5);
      // The rows' outer edges at their near ends are the widest tiles.
      const right = project(...seatToPlane("right", OPP_ROW_START.right, 20 - WALL_EDGE_GAP), c);
      const left = project(...seatToPlane("left", OPP_ROW_END, 20 - WALL_EDGE_GAP), c);
      expect(right.left - 0.5).toBeLessThanOrEqual(c.spread + 1e-9);
      expect(0.5 - left.left).toBeLessThanOrEqual(c.spread + 1e-9);
      // A standing wall's lids lean past them: they stay on the stage too.
      if (c.tilt > 0) {
        const kc = 20 * c.k * c.cos;
        const lid = 10 + (kc / (kc - 4 / 3)) * (10 - WALL_EDGE_GAP);
        expect(project(lid, 20 - OPP_ROW_START.right, c).left - 0.5).toBeLessThanOrEqual(
          c.spread + 1e-9,
        );
        expect(lid).toBeGreaterThan(20 - WALL_EDGE_GAP);
      }
      // The own hand may be as wide as they reach.
      expect(c.ownFit).toBeCloseTo(2 * c.spread);
    }
    for (const arrangement of ["wide", "short"] as const) {
      for (const view of ["3d", "flat"] as const) {
        expect(cameraFor(arrangement, view).spread).toBe(0.5);
        expect(cameraFor(arrangement, view).ownFit).toBe(OWN_HAND.fit);
      }
    }
  });
});

describe("project", () => {
  it("puts the near edge's centre on the frame's centre line, at scale 1", () => {
    for (const c of everyCamera) {
      const p = project(10, 20, c);
      expect(p.left).toBeCloseTo(0.5);
      expect(p.up).toBeCloseTo(0);
      expect(p.scale).toBeCloseTo(1);
    }
  });

  it("foreshortens the far edge by k / (k + sin)", () => {
    for (const c of Object.values(CAMERAS)) {
      const far = project(0, 0, c);
      const r = c.k / (c.k + c.sin);
      expect(far.scale).toBeCloseTo(r);
      expect(far.left).toBeCloseTo(0.5 - 0.5 * r);
      expect(far.up).toBeCloseTo(c.cos * r);
    }
    expect(project(0, 0, CAMERAS.wide).scale).toBeCloseTo(0.673, 3);
    expect(project(0, 0, CAMERAS.stack).scale).toBeCloseTo(0.884, 3);
  });

  it("is the identity seen from above", () => {
    const flat = cameraFor("wide", "flat");
    for (const [x, y] of [
      [0, 0],
      [4.4, 15.8],
      [20, 20],
    ] as const) {
      const p = project(x, y, flat);
      expect(p.left).toBeCloseTo(x / 20);
      expect(p.up).toBeCloseTo((20 - y) / 20);
      expect(p.scale).toBe(1);
    }
  });

  it("is undone by depthAt, also beyond the near edge", () => {
    for (const c of everyCamera) {
      for (const y of [0, 7.3, 18.05, 20, 21.4]) {
        expect(depthAt(project(10, y, c).up, c)).toBeCloseTo(y, 6);
      }
    }
  });

  it("turns a seat's own layer into plane coordinates", () => {
    expect(seatToPlane("bottom", 7.5, 12.75)).toEqual([7.5, 12.75]);
    expect(seatToPlane("right", 7.5, 12.75)).toEqual([12.75, 12.5]);
    expect(seatToPlane("top", 7.5, 12.75)).toEqual([12.5, 7.25]);
    expect(seatToPlane("left", 7.5, 12.75)).toEqual([7.25, 7.5]);
  });
});

describe("the frame", () => {
  it("is about two thirds as tall as wide when tilted, and nearly square from above", () => {
    expect(frameHeightFactor(CAMERAS.wide)).toBeCloseTo(0.681, 3);
    expect(frameHeightFactor(CAMERAS.short)).toBeCloseTo(0.681, 3);
    expect(frameHeightFactor(CAMERAS.stack)).toBeCloseTo(0.926, 3);
    expect(frameHeightFactor(cameraFor("wide", "flat"))).toBeCloseTo(1.085, 3);
  });

  it("floors S to an even pixel count", () => {
    expect(snapS(1033)).toBe(1032);
    expect(snapS(1033.9)).toBe(1032);
    expect(snapS(1034)).toBe(1034);
    expect(snapS(1.5)).toBe(0);
    expect(snapS(-3)).toBe(0);
  });

  it("gives the stage every number its stylesheets read", () => {
    const vars = stageVars(CAMERAS.wide) as Record<string, string>;
    expect(vars["--tilt"]).toBe("34deg");
    expect(vars["--k"]).toBe("1.15");
    expect(vars["--below"]).toBe("0.085");
    expect(Number(vars["--hf"])).toBeCloseTo(frameHeightFactor(CAMERAS.wide), 5);
    expect(vars["--gx"]).toBe("12px");
    expect(vars["--console-from"]).toBe(String(CONSOLE.from));
    expect(vars["--console-size"]).toBe(String(CONSOLE.size));
    expect(vars["--pond-x"]).toBe(String(POND.x));
    expect(vars["--pond-y"]).toBe(String(POND.y));
    expect(vars["--pond-tile"]).toBe(String(POND.tile));
    expect(vars["--row-end"]).toBe(String(OPP_ROW_END));
    expect(vars["--own-tile"]).toBe(String(OWN_HAND.tile));
    expect(vars["--own-lid"]).toBe(String(OWN_HAND.lid));
    expect(vars["--tile-thick"]).toBe("0.16");
    expect(Number(vars["--strip"])).toBeCloseTo(dockStrip(CAMERAS.wide), 5);
    expect(vars["--spread"]).toBe("0.5");
    expect(vars["--own-fit"]).toBe(String(OWN_HAND.fit));
    expect(vars["--rail-side-w"]).toBe(String(RAIL.side));
    expect(vars["--rail-far-w"]).toBe(String(RAIL.far));
    expect(vars["--rail-edge-w"]).toBe(String(RAIL.edge));
    expect(vars["--rail-top-w"]).toBe(String(RAIL.top));
    expect(Number(vars["--rail-lip-w"])).toBeCloseTo(railLip(CAMERAS.wide).side, 5);
    expect(Number(vars["--rail-far-lip-w"])).toBeCloseTo(railLip(CAMERAS.wide).far, 5);
    expect(stageVars(CAMERAS.stack)).toMatchObject({
      "--spread": String(Number(CAMERAS.stack.spread.toFixed(6))),
    });
    expect(stageVars(cameraFor("stack", "flat"))).toMatchObject({ "--tilt": "0deg", "--sin": "0" });
    // Only custom properties, every one a string.
    for (const [name, value] of Object.entries(vars)) {
      expect(name.startsWith("--"), name).toBe(true);
      expect(typeof value, name).toBe("string");
    }
  });
});

describe("the table's size in a stage box", () => {
  /** On-screen width of the third tile of a pond's first row: its near edge, the wider one. */
  const pondTile = (side: "bottom" | "top", s: number, c: Camera) => {
    const [, y] = seatToPlane(side, POND.x, side === "bottom" ? POND.y + ROW : POND.y);
    return POND.tile * (s / 20) * project(10, y, c).scale;
  };

  // The stage boxes of the page's arrangements and the pond tile widths to reach in them.
  const cases: [string, Arrangement, number, number, number, number, number][] = [
    ["1920 x 950", "wide", 1920, 950, 56, 76, 66],
    ["1440 x 790", "wide", 1440, 790, 56, 62, 54],
    ["1366 x 650", "wide", 1366, 650, 56, 50, 44],
    ["1024 x 700, a touch screen", "wide", 1024, 700, 72, 50, 43],
    ["844 x 340", "short", 628, 340, 0, 27, 23],
    ["768 x 1024", "stack", 768, 804, 0, 46, 44],
    ["390 x 664", "stack", 390, 444, 0, 24, 22],
    ["320 x 454", "stack", 320, 234, 0, 16, 15],
  ];

  it.each(cases)(
    "reaches the pond tile sizes at %s",
    (_, arrangement, width, height, dock, near, far) => {
      const box = { width, height };
      const c = cameraFor(arrangement, "3d", box);
      const s = tableSize(box, c, dock);
      expect(pondTile("bottom", s, c)).toBeGreaterThanOrEqual(near);
      expect(pondTile("top", s, c)).toBeGreaterThanOrEqual(far);
      // The own hand's tiles are close to the pond's in size (on the wide screens), and thirteen
      // tiles and a draw fit on the stage.
      const own = Math.min(OWN_HAND.tile * (s / 20), (c.ownFit * s) / 14.4);
      if (arrangement === "wide") {
        expect(own).toBeLessThanOrEqual(1.2 * pondTile("bottom", s, c));
      }
      expect(own * 14.4).toBeLessThanOrEqual(width - 2 * c.gutterX + 1e-9);
    },
  );

  it("fits the frame into the box inside the gutters, in both views", () => {
    for (const [, arrangement, width, height, dock] of cases) {
      for (const view of ["3d", "flat"] as const) {
        const c = cameraFor(arrangement, view, { width, height });
        const s = tableSize({ width, height }, c, dock);
        const drop = Math.max(0, dock + 2 * DOCK_GAP - (dockStrip(c) * s) / 20);
        expect(s * 2 * c.spread).toBeLessThanOrEqual(width - 2 * c.gutterX + 1e-9);
        expect(s * frameHeightFactor(c) + drop).toBeLessThanOrEqual(height - 2 * c.gutterY + 1e-9);
        expect(s % 2).toBe(0);
      }
    }
  });
});

describe("the far corners", () => {
  const WIDE_CAMERAS = [CAMERAS.wide, cameraFor("wide", "flat")];
  const numbers = (c: Camera) => {
    const vars = cornerVars(c) as Record<string, string>;
    return {
      reach: Number(vars["--corner-reach"]),
      gx: Number.parseFloat(vars["--corner-gx"] ?? ""),
      gy: Number.parseFloat(vars["--corner-gy"] ?? ""),
      hf: Number(vars["--corner-hf"]),
    };
  };

  it("tells floating chrome how far the hand rows reach from the centre line there", () => {
    for (const c of WIDE_CAMERAS) {
      const { reach } = numbers(c);
      // The outer corners of the three rows that end in a far corner, in each row's own layer.
      const corners: [Side, number, number][] = [
        ["top", OPP_ROW_START.top, 20 - HAND_ROW_DEPTH],
        ["top", OPP_ROW_END, 20 - HAND_ROW_DEPTH],
        ["right", OPP_ROW_END, 20 - 0.45],
        ["left", OPP_ROW_START.left, 20 - 0.45],
      ];
      for (const [side, x, y] of corners) {
        const offset = Math.abs(project(...seatToPlane(side, x, y), c).left - 0.5);
        expect(offset, side).toBeLessThanOrEqual(reach + 1e-6);
      }
      // No wider than it has to be: the far row's first tile is the outermost.
      expect(reach).toBeLessThan(0.5);
      expect(reach).toBeGreaterThan(0.3);
    }
    // Seen from above the rows reach almost to the table's edge; the tilt pulls them in.
    expect(numbers(cameraFor("wide", "flat")).reach).toBeCloseTo(0.48, 5);
    expect(numbers(CAMERAS.wide).reach).toBeLessThan(0.34);
  });

  it("bounds the table's size by the stage's width and height", () => {
    for (const c of WIDE_CAMERAS) {
      const { gx, gy, hf } = numbers(c);
      for (const [width, height] of [
        [1920, 950],
        [1440, 790],
        [1100, 846],
        [640, 490],
      ] as const) {
        for (const dock of [0, 56, 72]) {
          const bound = Math.min(width - gx, (height - gy) / hf);
          expect(tableSize({ width, height }, c, dock)).toBeLessThanOrEqual(bound);
        }
      }
    }
  });
});

describe("the dock band", () => {
  it("is the felt between a full pond and the own hand", () => {
    expect(POND_FOOT).toBeGreaterThan(POND.y + 3 * ROW + 0.16 * POND.tile);
    expect(POND_FOOT).toBeLessThan(18.5);
    for (const c of everyCamera) {
      expect(dockStrip(c)).toBeGreaterThan(0.8);
      // The strip's top is the pond's foot; its bottom the top of the own hand.
      expect((c.below + project(10, POND_FOOT, c).up) * 20 - dockStrip(c)).toBeCloseTo(
        OWN_HAND_TOP,
      );
    }
  });

  it("holds no tile across the whole table", () => {
    // The right seat's first hand tile, with its thickness toward the viewer.
    expect(20 - OPP_ROW_START.right + 0.16).toBeLessThan(POND_FOOT);
    // The left seat's row ends on that side; its last tile's thickness points the same way.
    expect(OPP_ROW_END + 0.16).toBeLessThan(POND_FOOT);
    // The left seat's pond runs toward the viewer as far as its last row may grow.
    expect(POND.xEnd + 0.16 * POND.tile).toBeLessThan(POND_FOOT);
  });

  it("makes room for a bar taller than the strip by making the table smaller", () => {
    const c = CAMERAS.wide;
    const box = { width: 1366, height: 650 };
    const free = tableSize(box, c);
    const docked = tableSize(box, c, 48);
    expect(docked).toBeLessThan(free);
    // The band between the pond and the own hand is at least the bar and its two gaps.
    const u = docked / 20;
    const band = Math.max(dockStrip(c) * u, 48 + 2 * DOCK_GAP);
    expect(band).toBeGreaterThanOrEqual(48 + 2 * DOCK_GAP);
    expect(docked * frameHeightFactor(c) + band - dockStrip(c) * u).toBeLessThanOrEqual(
      box.height - 2 * c.gutterY,
    );
    // A large table has the room already: the bar costs nothing.
    const large = { width: 1920, height: 950 };
    expect(tableSize(large, c, 48)).toBe(tableSize(large, c));
  });
});

describe("console and ponds", () => {
  it("puts the console in the middle, five units wide", () => {
    expect(CONSOLE.from).toBe(7.5);
    expect(CONSOLE.from + CONSOLE.size).toBe(12.5);
    expect(CONSOLE.from + CONSOLE.size / 2).toBe(10);
  });

  it("starts each pond under the console's left corner, a quarter unit from it", () => {
    expect(POND.x).toBe(CONSOLE.from);
    expect(POND.y - (CONSOLE.from + CONSOLE.size)).toBeCloseTo(0.25);
    expect(POND.tile).toBe(1.33);
  });

  it("lays six tiles in each of the first two rows and the rest in the third", () => {
    expect([0, 5, 6, 11, 12, 17, 18, 23].map(pondRow)).toEqual([0, 0, 1, 1, 2, 2, 2, 2]);
    const first = pondSlot(0);
    expect(first.x).toBeCloseTo(POND.x + POND.tile / 2);
    expect(first.y).toBeCloseTo(POND.y + ROW / 2);
    expect(first.tile).toBe(POND.tile);
    expect(pondSlot(5).x).toBeCloseTo(POND.x + 5.5 * POND.tile);
    expect(pondSlot(6).x).toBeCloseTo(first.x);
    expect(pondSlot(6).y).toBeCloseTo(POND.y + 1.5 * ROW);
    expect(pondSlot(17).y).toBeCloseTo(POND.y + 2.5 * ROW);
  });

  it("widens the row after a sideways riichi tile", () => {
    const discards = lying(3, 1);
    expect(pondSlot(1, discards).x).toBeCloseTo(POND.x + POND.tile + ROW / 2);
    expect(pondSlot(2, discards).x).toBeCloseTo(POND.x + POND.tile + ROW + POND.tile / 2);
    expect(pondRowEnds(discards)[0]).toBeCloseTo(POND.x + 2 * POND.tile + ROW);
  });

  it("keeps extending the third row to the right while it fits", () => {
    for (const n of [0, 13, 18, 19]) {
      expect(pondScale(lying(n)), `${n} discards`).toBe(1);
    }
    const seventh = pondSlot(18, lying(19));
    expect(seventh.y).toBeCloseTo(POND.y + 2.5 * ROW);
    expect(seventh.x).toBeCloseTo(POND.x + 6.5 * POND.tile);
    // An eighth tile fits but for a hair.
    expect(pondScale(lying(20))).toBeGreaterThan(0.98);
  });

  it("shrinks only the tiles of a pond whose third row still overflows", () => {
    const long = lying(24, 13);
    const scale = pondScale(long);
    expect(scale).toBeLessThan(0.7);
    expect(pondSlot(0, long).tile).toBeCloseTo(POND.tile * scale);
    // Every row of every pond ends inside the pond's box.
    for (const n of [18, 20, 21, 24, 30]) {
      for (const riichiAt of [-1, 2, 14, n - 1]) {
        const discards = lying(n, riichiAt);
        for (const end of pondRowEnds(discards)) {
          expect(end, `${n} discards`).toBeLessThanOrEqual(POND.xEnd + 1e-9);
        }
        const last = pondSlot(n - 1, discards);
        expect(last.y + (2 / 3) * last.tile).toBeLessThanOrEqual(POND.y + 3 * ROW + 1e-9);
      }
    }
    // Another pond keeps its own size.
    expect(pondScale(lying(18))).toBe(1);
  });

  it("keeps ponds, hand rows and the console clear of each other, with every pond full", () => {
    type Box = { name: string; x0: number; y0: number; x1: number; y1: number };
    /** A box of a seat's own layer, in plane coordinates. */
    const box = (name: string, side: Side, x0: number, y0: number, x1: number, y1: number): Box => {
      const [ax, ay] = seatToPlane(side, x0, y0);
      const [bx, by] = seatToPlane(side, x1, y1);
      return {
        name: `${side} ${name}`,
        x0: Math.min(ax, bx),
        y0: Math.min(ay, by),
        x1: Math.max(ax, bx),
        y1: Math.max(ay, by),
      };
    };
    const boxes: Box[] = [
      {
        name: "console",
        x0: CONSOLE.from,
        y0: CONSOLE.from,
        x1: CONSOLE.from + CONSOLE.size,
        y1: CONSOLE.from + CONSOLE.size,
      },
    ];
    for (const side of SIDES) {
      // Two rows of six with a sideways riichi tile, and a last row grown as far as it may.
      boxes.push(
        box("pond rows", side, POND.x, POND.y, POND.x + 5 * POND.tile + ROW, POND.y + 2 * ROW),
      );
      boxes.push(box("pond last row", side, POND.x, POND.y + 2 * ROW, POND.xEnd, POND.y + 3 * ROW));
      if (side !== "bottom") {
        const inner = 20 - HAND_ROW_DEPTH + 0.16;
        boxes.push(box("hand row", side, OPP_ROW_START[side], inner, OPP_ROW_END, 20 - 0.45));
      }
    }
    for (const a of boxes) {
      for (const b of boxes) {
        const sameSeat = a.name.split(" ")[0] === b.name.split(" ")[0];
        if (a === b || (sameSeat && a.name !== "console")) {
          continue;
        }
        const overlap =
          Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-9 &&
          Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1e-9;
        expect(overlap, `${a.name} / ${b.name}`).toBe(false);
      }
    }
    // A seat's own pond ends before its own hand row.
    expect(POND.y + 3 * ROW).toBeLessThan(20 - HAND_ROW_DEPTH + 0.16);
  });

  it("centres a call caption on its caller's pond", () => {
    const c = CAMERAS.wide;
    const centre = project(POND.x + 3 * POND.tile, POND.y + 1.5 * ROW, c);
    expect(captionAnchor("bottom", c)).toEqual({ x: centre.left, y: centre.up });
    const far = captionAnchor("top", c);
    expect(far.x).toBeCloseTo(1 - centre.left + 2 * (project(10, 0, c).left - 0.5), 1);
    expect(far.y).toBeGreaterThan(centre.up);
    // The side players' captions sit left and right of the console.
    expect(captionAnchor("left", c).x).toBeLessThan(0.5);
    expect(captionAnchor("right", c).x).toBeGreaterThan(0.5);
  });
});

describe("seat tags", () => {
  type Felt = Extract<TagPlace, { kind: "felt" }>;
  type Rim = Extract<TagPlace, { kind: "rim" }>;
  const felt = (at: TagPlace): Felt => {
    if (at.kind !== "felt") {
      throw new Error("not on the felt");
    }
    return at;
  };
  const rim = (at: TagPlace): Rim => {
    if (at.kind !== "rim") {
      throw new Error("not beside the table");
    }
    return at;
  };
  /** The plane point a point of the frame shows (the inverse of project). */
  const unproject = (left: number, up: number, c: Camera): [number, number] => {
    const y = depthAt(up, c);
    return [10 + ((left - 0.5) * 20) / project(10, y, c).scale, y];
  };
  const PONDS = [0, 4, 6, 12, 14, 18, 19, 24].flatMap((n) => [lying(n), lying(n, 3)]);

  it("keeps every tag on the felt upright, inside the free strip by its pond and its row", () => {
    for (const c of everyCamera) {
      for (const side of SIDES) {
        for (const pond of PONDS) {
          const at = felt(tagPlace(side, c, true, false, pond));
          expect(at.right).toBeGreaterThan(at.left);
          expect(at.top).toBeGreaterThan(at.bottom);
          const { reach, depth } = tagStrip(pond);
          const [ax, ay] = seatToPlane(side, TAG_STRIP.end - reach, TAG_STRIP.near - depth);
          const [bx, by] = seatToPlane(side, TAG_STRIP.end, TAG_STRIP.near);
          for (const left of [at.left, at.right]) {
            for (const up of [at.bottom, at.top]) {
              const [x, y] = unproject(left, up, c);
              expect(x).toBeGreaterThanOrEqual(Math.min(ax, bx) - 1e-6);
              expect(x).toBeLessThanOrEqual(Math.max(ax, bx) + 1e-6);
              expect(y).toBeGreaterThanOrEqual(Math.min(ay, by) - 1e-6);
              expect(y).toBeLessThanOrEqual(Math.max(ay, by) + 1e-6);
            }
          }
        }
      }
    }
    expect(TAG_STRIP.end).toBeLessThan(POND.x);
    expect(TAG_STRIP.near).toBeLessThan(20 - HAND_ROW_DEPTH);
  });

  it("puts each tag in the corner by its own pond's first tile and against its own row", () => {
    const corners = SIDES.map((side) => felt(tagPlace(side, CAMERAS.wide, true, false)).corner);
    expect(corners).toEqual(["bottom-right", "top-right", "top-left", "bottom-left"]);
  });

  it("keeps the viewed player's tag above the dock band, or right on the hand without a dock", () => {
    for (const c of everyCamera) {
      const docked = felt(tagPlace("bottom", c, true, false));
      expect(docked.bottom).toBeGreaterThan(project(10, POND_FOOT, c).up);
      const free = felt(tagPlace("bottom", c, false, false));
      expect((free.bottom + c.below) * 20).toBeCloseTo(OWN_HAND_TOP + 0.15);
      expect(free.top).toBeCloseTo(docked.top);
    }
  });

  it("gives the right player's tag the near right corner while the felt is wider there", () => {
    for (const c of [CAMERAS.stack, ...FITTED]) {
      // The viewed player's pond (the right seat's neighbour) has an empty or short last row.
      for (const n of [6, 12, 14]) {
        const at = felt(tagPlace("right", c, false, false, lying(n)));
        expect(at.corner, `${n} discards`).toBe("bottom-right");
        // It stands on the felt above the own hand, below the pond's second row.
        expect((at.bottom + c.below) * 20).toBeCloseTo(OWN_HAND_TOP + 0.15);
        const [, y] = unproject(at.left, at.top, c);
        expect(y).toBeGreaterThan(POND.y + 2 * ROW + 0.16 * POND.tile);
        // It is no wider than the felt between the last row and the right player's row.
        const [x] = unproject(at.left, at.bottom, c);
        expect(x).toBeGreaterThan((pondRowEnds(lying(n))[2] ?? 0) + 0.29);
      }
      // A last row longer than the others leaves the corner narrower than beside the pond.
      expect(felt(tagPlace("right", c, false, false, lying(19))).corner).toBe("top-right");
      // With a dock, the near right corner is the dock band's.
      expect(felt(tagPlace("right", c, true, false, lying(6))).corner).toBe("top-right");
    }
  });

  it("has less room as the neighbour's rows grow toward it", () => {
    for (const c of everyCamera) {
      for (const side of ["bottom", "top", "left"] as const) {
        // Across the strip: up the screen beside the near and the far row, along it at the side.
        const width = (n: number, riichiAt = -1) => {
          const at = felt(tagPlace(side, c, true, false, lying(n, riichiAt)));
          return side === "left" ? at.right - at.left : at.top - at.bottom;
        };
        expect(width(4)).toBeLessThan(width(0));
        expect(width(6)).toBeLessThan(width(4));
        expect(width(12)).toBeCloseTo(width(6));
        // A riichi tile in a full row takes a third of a tile more; some room is always left.
        expect(width(12, 3)).toBeLessThan(width(12));
        expect(width(12, 3)).toBeGreaterThan(0);
      }
    }
  });

  it("is at most 5.2 units long, and stops before a row that runs up to its hand row", () => {
    expect(tagStrip()).toEqual({
      reach: TAG_STRIP.reach,
      depth: TAG_STRIP.near - POND.x - TAG_STRIP.clear,
    });
    // Three rows of six, also with a riichi tile in the last: the tag lies over all of them.
    expect(tagStrip(lying(18)).reach).toBe(TAG_STRIP.reach);
    expect(tagStrip(lying(18, 14)).reach).toBe(TAG_STRIP.reach);
    expect(tagStrip(lying(18, 14)).depth).toBeCloseTo(
      TAG_STRIP.near - (POND.x + 5 * POND.tile + ROW) - TAG_STRIP.clear,
    );
    // A seventh tile in the last row: the tag ends before that row, over the first two.
    const tight = tagStrip(lying(19));
    expect(tight.reach).toBeCloseTo(TAG_STRIP.end - (20 - POND.y - 2 * ROW) - TAG_STRIP.gap);
    expect(tight.depth).toBeCloseTo(TAG_STRIP.near - (POND.x + 6 * POND.tile) - TAG_STRIP.clear);
  });

  it("stays off the rows of a pond that has shrunk its tiles", () => {
    for (const n of [21, 24, 30]) {
      const discards = lying(n);
      const { reach, depth } = tagStrip(discards);
      const rowHeight = ROW * pondScale(discards);
      const ends = pondRowEnds(discards);
      const tagStart = TAG_STRIP.end - reach;
      for (let row = 0; row < 3; row++) {
        const inner = 20 - POND.y - row * rowHeight;
        const overRow = tagStart < inner - 1e-9;
        if (overRow) {
          // Every row under the tag ends before the tag's strip begins.
          expect(TAG_STRIP.near - depth, `${n} discards, row ${row}`).toBeGreaterThan(
            ends[row] as number,
          );
        } else {
          expect(tagStart).toBeGreaterThanOrEqual(inner + TAG_STRIP.gap - 1e-9);
        }
      }
      expect(reach).toBeGreaterThan(0);
      expect(depth).toBeGreaterThanOrEqual(TAG_STRIP.minDepth);
    }
  });

  it("stands a side player's tag beside the table, level with the middle of its row", () => {
    for (const c of [CAMERAS.wide, CAMERAS.short, cameraFor("wide", "flat")]) {
      const right = rim(tagPlace("right", c, true, true));
      const left = rim(tagPlace("left", c, true, true));
      expect([right.side, left.side]).toEqual(["right", "left"]);
      // The two mirror each other about the centre line.
      expect(right.felt - 0.5).toBeCloseTo(0.5 - left.felt);
      expect(right.rail - 0.5).toBeCloseTo(0.5 - left.rail);
      expect([right.bottom, right.top]).toEqual([left.bottom, left.top]);
      // From the outermost tile out to the rail's outer edge.
      const edge = project(20, 10.5, c);
      expect(right.felt).toBeGreaterThanOrEqual(edge.left - 1e-9);
      expect(right.rail).toBeCloseTo(project(20 + RAIL.side, 10.5, c).left);
      expect(right.rail).toBeGreaterThan(right.felt);
      expect(right.bottom).toBeCloseTo(edge.up);
      expect(right.top).toBeGreaterThan(right.bottom);
    }
    // A standing wall's lids lean over the felt's edge; seen from above there are none.
    const lidded = rim(tagPlace("right", CAMERAS.wide, true, true));
    expect(lidded.felt).toBeGreaterThan(project(20, 10.5, CAMERAS.wide).left + 0.005);
    expect(rim(tagPlace("right", cameraFor("wide", "flat"), true, true)).felt).toBeCloseTo(1);
    // The viewed and the far player's tags stay on the felt.
    for (const side of ["bottom", "top"] as const) {
      expect(tagPlace(side, CAMERAS.wide, true, true).kind).toBe("felt");
    }
  });

  it("keeps every tag's box and every caption inside the frame", () => {
    for (const c of everyCamera) {
      const top = frameHeightFactor(c) - c.below;
      for (const side of SIDES) {
        for (const docked of [true, false]) {
          const at = felt(tagPlace(side, c, docked, false));
          expect(at.left).toBeGreaterThan(0);
          expect(at.right).toBeLessThan(1);
          expect(at.bottom).toBeGreaterThan(-c.below);
          expect(at.top).toBeLessThan(top);
        }
        const caption = captionAnchor(side, c);
        expect(caption.x).toBeGreaterThan(0);
        expect(caption.x).toBeLessThan(1);
        expect(caption.y).toBeGreaterThan(-c.below);
        expect(caption.y).toBeLessThan(top);
      }
    }
  });
});

describe("emptySide", () => {
  it("moves the empty seat of a three-player game with the point of view", () => {
    expect(emptySide(3, 0)).toBe("left");
    expect(emptySide(3, 1)).toBe("top");
    expect(emptySide(3, 2)).toBe("right");
  });

  it("has no empty seat with four players", () => {
    for (const pov of [0, 1, 2, 3] as Seat[]) {
      expect(emptySide(4, pov)).toBeNull();
    }
  });
});

describe("wallFaceX", () => {
  it("runs side walls from their row's start", () => {
    expect(wallFaceX(0, 13, false, "right")).toBeCloseTo(OPP_ROW_START.right + 0.5);
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
    const kakanTop = 2 * OWN_HAND.tile + 0.05;
    for (const c of everyCamera) {
      // The right row's first tile and its drawn thickness (toward the near edge).
      const nearest = project(19, 20 - OPP_ROW_START.right + 0.16, c);
      expect((c.below + nearest.up) * 20, `tilt ${c.tilt}`).toBeGreaterThan(kakanTop);
    }
  });

  it("hold a hand of thirteen tiles and a draw at full size", () => {
    for (const side of ["right", "top", "left"] as const) {
      expect(oppRowUnits(side)).toBeGreaterThanOrEqual(14.4);
    }
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
    expect(wallLean("right", 15.8, 1, CAMERAS.stack)).toBeLessThan(wallLean("right", 15.8, 1));
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
    expect(oppRowLayout(view(), 1, "right", false)).toEqual({
      start: OPP_ROW_START.right,
      hs: 1,
      gap: 0,
    });
  });
});
