import { describe, expect, it } from "vitest";
import type { Seat } from "../../core/model";
import type { MeldView, SeatView } from "../../replay/types";
import { DISCARDS_PER_ROW, DRAWN_GAP, handRowWidth, POND_ROWS } from "../layout";
import type { Side } from "../viewer/types";
import {
  CONSOLE_SIZE,
  captionAnchor,
  emptySide,
  HAND,
  handScale,
  POND,
  pondRow,
  pondScale,
  STICK_GAP,
  seatToTable,
  stageVars,
  TABLE_UNITS,
} from "./geometry";

const SIDES: readonly Side[] = ["bottom", "right", "top", "left"];
/** A tile's length, and a sideways tile's width, in tile widths (tiles are 3:4). */
const LENGTH = 4 / 3;
/** The console's edges, from the table's left or top edge. */
const CONSOLE = { from: (TABLE_UNITS - CONSOLE_SIZE) / 2, to: (TABLE_UNITS + CONSOLE_SIZE) / 2 };
/** A hand row in its seat's layer: its edge toward the middle of the table, and its outer edge. */
const ROW = { inner: TABLE_UNITS - HAND.edge - LENGTH, outer: TABLE_UNITS - HAND.edge };
/** The room a pond's last row has, and a hand row's. */
const POND_ROOM = POND.xEnd - POND.x;
const HAND_ROOM = HAND.end - HAND.start;

/** A pond of `n` discards, the one at `riichiAt` lying sideways. */
const lying = (n: number, riichiAt = -1) =>
  Array.from({ length: n }, (_, i) => ({ riichi: i === riichiAt }));

/** Width of a pond's last row at full size, in tile widths. */
const lastRowWidth = (discards: readonly { riichi: boolean }[]) =>
  discards
    .slice((POND_ROWS - 1) * DISCARDS_PER_ROW)
    .reduce((width, discard) => width + (discard.riichi ? LENGTH : 1), 0);

type Row = Pick<SeatView, "hand" | "drawn" | "melds" | "kita">;
const row = (view: Partial<Row> = {}): Row => ({
  hand: [],
  drawn: null,
  melds: [],
  kita: [],
  ...view,
});
const concealed = (n: number) => Array.from({ length: n }, () => "1m" as const);
const pon: MeldView = { type: "pon", tiles: ["5p", "5p"], from: 2, calledTile: "5p" };
const kan: MeldView = { type: "daiminkan", tiles: ["7z", "7z", "7z"], from: 2, calledTile: "7z" };

describe("the table's numbers", () => {
  it("puts the console in the middle, as wide as a pond row", () => {
    expect(CONSOLE_SIZE).toBe(DISCARDS_PER_ROW);
    expect(CONSOLE.from).toBeGreaterThan(0);
    expect(CONSOLE.from + CONSOLE_SIZE / 2).toBeCloseTo(TABLE_UNITS / 2);
  });

  it("starts each pond under the console's left corner, the stick's gap from it", () => {
    expect(POND.x).toBeCloseTo(CONSOLE.from);
    // Six upright tiles end under the console's right corner.
    expect(POND.x + DISCARDS_PER_ROW).toBeCloseTo(CONSOLE.to);
    expect(STICK_GAP).toBeGreaterThan(0);
    expect(POND.y - CONSOLE.to).toBeCloseTo(STICK_GAP);
  });

  it("ends a pond's rows before the seat's own hand row", () => {
    expect(POND.y + POND_ROWS * LENGTH).toBeLessThan(ROW.inner);
  });

  it("lets a pond's last row grow past the console, up to the next seat's hand row", () => {
    expect(POND.xEnd).toBeGreaterThan(CONSOLE.to);
    // The next seat's row lies along the right edge, as deep as a tile is long.
    expect(POND.xEnd).toBeLessThan(ROW.inner);
    // Three full rows never shrink, even with the riichi tile in the last one.
    expect(POND_ROOM).toBeGreaterThanOrEqual(DISCARDS_PER_ROW - 1 + LENGTH);
  });

  it("holds a hand of thirteen tiles and a draw at full size", () => {
    expect(HAND_ROOM).toBeGreaterThanOrEqual(13 + DRAWN_GAP + 1);
  });

  it("starts a hand row past the row along the edge on its left, and keeps it on the table", () => {
    // The seat on the left lays its row along that edge, a tile deep.
    expect(HAND.start).toBeGreaterThanOrEqual(HAND.edge + LENGTH);
    expect(HAND.end).toBeGreaterThan(HAND.start);
    expect(HAND.end).toBeLessThanOrEqual(TABLE_UNITS);
    expect(HAND.edge).toBeGreaterThanOrEqual(0);
  });

  it("keeps the console, the ponds and the hand rows of all four seats clear of each other", () => {
    interface Box {
      name: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }
    /** A box of a seat's own layer, in the table's coordinates. */
    const box = (name: string, side: Side, x0: number, y0: number, x1: number, y1: number): Box => {
      const [ax, ay] = seatToTable(side, x0, y0);
      const [bx, by] = seatToTable(side, x1, y1);
      return {
        name: `${side} ${name}`,
        x0: Math.min(ax, bx),
        y0: Math.min(ay, by),
        x1: Math.max(ax, bx),
        y1: Math.max(ay, by),
      };
    };
    const boxes: Box[] = [
      { name: "console", x0: CONSOLE.from, y0: CONSOLE.from, x1: CONSOLE.to, y1: CONSOLE.to },
    ];
    const lastRow = POND.y + (POND_ROWS - 1) * LENGTH;
    for (const side of SIDES) {
      // The first rows at their widest (a sideways riichi tile among six), the last row grown as
      // far as it may, and the whole length of the hand row.
      boxes.push(
        box("pond rows", side, POND.x, POND.y, POND.x + DISCARDS_PER_ROW - 1 + LENGTH, lastRow),
        box("pond last row", side, POND.x, lastRow, POND.xEnd, lastRow + LENGTH),
        box("hand row", side, HAND.start, ROW.inner, HAND.end, ROW.outer),
      );
    }
    expect(boxes).toHaveLength(13);
    for (const a of boxes) {
      expect(Math.min(a.x0, a.y0), a.name).toBeGreaterThanOrEqual(0);
      expect(Math.max(a.x1, a.y1), a.name).toBeLessThanOrEqual(TABLE_UNITS);
      for (const b of boxes) {
        if (a === b) {
          continue;
        }
        const overlap =
          Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-9 &&
          Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1e-9;
        expect(overlap, `${a.name} / ${b.name}`).toBe(false);
      }
    }
  });
});

describe("pondRow", () => {
  it("lays six discards in each of the first rows and every later one in the last", () => {
    expect([0, 5, 6, 11, 12, 17, 18, 23, 40].map(pondRow)).toEqual([0, 0, 1, 1, 2, 2, 2, 2, 2]);
  });
});

describe("pondScale", () => {
  it("is 1 while the last row fits", () => {
    for (const n of [0, 1, 6, 13, 18]) {
      expect(pondScale(lying(n)), `${n} discards`).toBe(1);
    }
    // Three full rows, wherever the riichi tile lies.
    for (const riichiAt of [0, 7, 12, 17]) {
      expect(pondScale(lying(18, riichiAt)), `riichi at ${riichiAt}`).toBe(1);
    }
    // As many upright tiles as the last row has room for.
    const most = (POND_ROWS - 1) * DISCARDS_PER_ROW + Math.floor(POND_ROOM);
    expect(pondScale(lying(most))).toBe(1);
    expect(pondScale(lying(most + 1))).toBeLessThan(1);
  });

  it("shrinks a pond whose last row has grown too long, just enough to end at its limit", () => {
    let shrunk = 0;
    for (let n = 18; n <= 36; n++) {
      for (const riichiAt of [-1, 2, 14, n - 1]) {
        const discards = lying(n, riichiAt);
        const scale = pondScale(discards);
        const end = scale * lastRowWidth(discards);
        expect(scale, `${n} discards`).toBeGreaterThan(0);
        expect(scale, `${n} discards`).toBeLessThanOrEqual(1);
        expect(end, `${n} discards`).toBeLessThanOrEqual(POND_ROOM + 1e-9);
        if (scale < 1) {
          shrunk++;
          expect(end, `${n} discards`).toBeCloseTo(POND_ROOM);
        }
      }
    }
    expect(shrunk).toBeGreaterThan(0);
  });

  it("counts a sideways riichi tile only where it lengthens the last row", () => {
    const plain = pondScale(lying(30));
    expect(plain).toBeLessThan(1);
    // In the first rows it changes nothing: they hold six tiles and always fit.
    expect(pondScale(lying(30, 2))).toBe(plain);
    expect(pondScale(lying(30, 11))).toBe(plain);
    expect(pondScale(lying(30, 12))).toBeLessThan(plain);
    expect(pondScale(lying(30, 29))).toBeCloseTo(POND_ROOM / (17 + LENGTH));
  });
});

describe("handScale", () => {
  it("is 1 for a row that fits: a closed hand with its draw, or a hand with a few calls", () => {
    expect(handScale(row({ hand: concealed(13), drawn: "2m" }), 0)).toBe(1);
    expect(handScale(row({ hand: concealed(7), drawn: "2m", melds: [pon, pon] }), 0)).toBe(1);
    expect(handScale(row({ hand: concealed(10), kita: ["4z", "4z"] }), 1)).toBe(1);
    // A short row is never enlarged.
    expect(handScale(row({ hand: concealed(1) }), 0)).toBe(1);
    expect(handScale(row(), 0)).toBe(1);
  });

  it("shrinks a row made too long by its calls, just enough to fit its length", () => {
    const long: Row[] = [
      row({ hand: concealed(1), drawn: "2m", melds: [pon, pon, pon, pon] }),
      row({ hand: concealed(1), drawn: "2m", melds: [kan, kan, kan, kan] }),
      row({ hand: concealed(1), drawn: "2m", melds: [kan, kan, kan, kan], kita: ["4z"] }),
    ];
    const scales = long.map((view) => handScale(view, 0));
    for (const [index, view] of long.entries()) {
      const scale = scales[index] as number;
      expect(scale).toBeLessThan(1);
      expect(scale * handRowWidth(view, 0)).toBeCloseTo(HAND_ROOM);
    }
    // The longer the row, the smaller its tiles.
    expect(scales[1]).toBeLessThan(scales[0] as number);
    expect(scales[2]).toBeLessThan(scales[1] as number);
  });

  it("never lets a row pass its end, whatever it holds", () => {
    for (const melds of [[], [pon], [pon, kan], [kan, pon, pon], [kan, kan, kan, kan]]) {
      for (const kita of [[], ["4z" as const]]) {
        // The row with its drawn tile is the longest it gets: that is what has to fit.
        const view = row({ hand: concealed(13 - 3 * melds.length), drawn: "2m", melds, kita });
        const scale = handScale(view, 0);
        const width = scale * handRowWidth(view, 0);
        expect(scale).toBeGreaterThan(0);
        expect(scale).toBeLessThanOrEqual(1);
        expect(width).toBeLessThanOrEqual(HAND_ROOM + 1e-9);
        if (scale < 1) {
          expect(width).toBeCloseTo(HAND_ROOM);
        }
      }
    }
  });

  // The drawn tile's place counts whether or not a tile is in it: a draw or a discard never
  // changes the size of the tiles, only a call does.
  it("keeps one tile size through a draw and a discard", () => {
    for (const melds of [[], [pon, pon, pon], [pon, pon, pon, pon], [kan, kan, kan, kan]]) {
      for (const kita of [[], ["4z" as const]]) {
        const hand = concealed(13 - 3 * melds.length);
        const waiting = handScale(row({ hand, melds, kita }), 0);
        const holding = handScale(row({ hand, drawn: "2m", melds, kita }), 0);
        expect(waiting).toBeCloseTo(holding, 9);
      }
    }
  });

  // A three-player hand with kita is the long row that comes up every turn.
  it("fits a closed hand with its draw and a kita almost at full size", () => {
    const sanma = row({ hand: concealed(13), drawn: "2m", kita: ["4z", "4z"] });
    expect(handScale(sanma, 0)).toBeGreaterThan(0.99);
  });
});

describe("seatToTable", () => {
  const U = TABLE_UNITS;

  it("leaves the bottom seat's layer as it is", () => {
    expect(seatToTable("bottom", 3, 5)).toEqual([3, 5]);
    expect(seatToTable("bottom", 0, U)).toEqual([0, U]);
  });

  it("keeps the middle of the table in the middle for every seat", () => {
    for (const side of SIDES) {
      const [x, y] = seatToTable(side, U / 2, U / 2);
      expect(x, side).toBeCloseTo(U / 2);
      expect(y, side).toBeCloseTo(U / 2);
    }
  });

  it("turns each seat's own edge to its side of the table", () => {
    // The middle of the edge a seat sits at (the bottom one of its layer).
    const edge = (side: Side) => seatToTable(side, U / 2, U);
    expect(edge("bottom")).toEqual([U / 2, U]);
    expect(edge("right")).toEqual([U, U / 2]);
    expect(edge("top")).toEqual([U / 2, 0]);
    expect(edge("left")).toEqual([0, U / 2]);
  });

  it("puts each seat's left-hand corner one corner further round the table", () => {
    // The corner on a seat's left as it faces the table, counter-clockwise from the bottom left.
    const corner = (side: Side) => seatToTable(side, 0, U);
    expect(corner("bottom")).toEqual([0, U]);
    expect(corner("right")).toEqual([U, U]);
    expect(corner("top")).toEqual([U, 0]);
    expect(corner("left")).toEqual([0, 0]);
  });

  it("is a quarter turn per seat", () => {
    const turn = (point: [number, number], times: number) => {
      let turned = point;
      for (let i = 0; i < times; i++) {
        turned = seatToTable("right", turned[0], turned[1]);
      }
      return turned;
    };
    for (const point of [
      [0, 0],
      [3, 5],
      [POND.x, POND.y],
      [HAND.end, U - HAND.edge],
    ] as [number, number][]) {
      for (const [times, side] of SIDES.entries()) {
        const [x, y] = turn(point, times);
        const [sx, sy] = seatToTable(side, point[0], point[1]);
        expect(sx, side).toBeCloseTo(x);
        expect(sy, side).toBeCloseTo(y);
      }
      const [x, y] = turn(point, 4);
      expect(x).toBeCloseTo(point[0]);
      expect(y).toBeCloseTo(point[1]);
    }
  });
});

describe("captionAnchor", () => {
  /** How far below the middle of the table the middle of the bottom pond's three rows lies. */
  const reach = (POND.y + (POND_ROWS * LENGTH) / 2 - TABLE_UNITS / 2) / TABLE_UNITS;

  it("sits on the middle of the bottom seat's pond, under the middle of the console", () => {
    const at = captionAnchor("bottom");
    expect(at.x).toBeCloseTo(0.5);
    expect(at.y).toBeCloseTo(0.5 + reach);
    // Below the console, on the pond's second row.
    expect(at.y * TABLE_UNITS).toBeGreaterThan(POND.y + LENGTH);
    expect(at.y * TABLE_UNITS).toBeLessThan(POND.y + 2 * LENGTH);
  });

  it("sits as far from the middle on every side, toward that seat", () => {
    expect(captionAnchor("top").x).toBeCloseTo(0.5);
    expect(captionAnchor("top").y).toBeCloseTo(0.5 - reach);
    expect(captionAnchor("right").x).toBeCloseTo(0.5 + reach);
    expect(captionAnchor("right").y).toBeCloseTo(0.5);
    expect(captionAnchor("left").x).toBeCloseTo(0.5 - reach);
    expect(captionAnchor("left").y).toBeCloseTo(0.5);
  });

  it("is a share of the table's side, clear of the console", () => {
    for (const side of SIDES) {
      const { x, y } = captionAnchor(side);
      for (const share of [x, y]) {
        expect(share, side).toBeGreaterThan(0);
        expect(share, side).toBeLessThan(1);
      }
      const fromMiddle = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * TABLE_UNITS;
      expect(fromMiddle, side).toBeGreaterThan(CONSOLE_SIZE / 2);
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

describe("stageVars", () => {
  const numbers: Record<string, number> = {
    "--units": TABLE_UNITS,
    "--console-size": CONSOLE_SIZE,
    "--stick-gap": STICK_GAP,
    "--pond-x": POND.x,
    "--pond-y": POND.y,
    "--hand-start": HAND.start,
    "--hand-end": HAND.end,
    "--hand-edge": HAND.edge,
  };

  it("gives the stage the table's numbers as custom properties", () => {
    const vars = stageVars() as Record<string, string>;
    expect(Object.keys(vars).sort()).toEqual(Object.keys(numbers).sort());
    for (const [name, value] of Object.entries(numbers)) {
      expect(typeof vars[name], name).toBe("string");
      expect(Number(vars[name]), name).toBeCloseTo(value, 6);
    }
  });

  it("writes plain numbers of at most six decimals, without floating-point noise", () => {
    // (18.4 − 6) / 2 is 6.199999999999999 as a double: the stylesheets get "6.2".
    for (const [name, value] of Object.entries(stageVars())) {
      expect(value, name).toMatch(/^\d+(\.\d{1,6})?$/);
      expect(String(Number(value)), name).toBe(value);
    }
  });

  it("gives the same numbers every time", () => {
    expect(stageVars()).toEqual(stageVars());
  });
});
