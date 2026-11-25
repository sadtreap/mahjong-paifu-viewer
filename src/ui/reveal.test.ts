import { describe, expect, it } from "vitest";
import type { Quad, RyukyokuEvent, WinEvent } from "../core/model";
import type { Tile } from "../core/tile";
import type { SeatView } from "../replay/types";
import { tiles } from "../test/round-builder";
import { revealedSeats, withRevealedHands } from "./reveal";

const deltas: Quad<number> = [0, 0, 0, 0];

function view(hand: Tile[], drawn: Tile | null = null): SeatView {
  return { hand, drawn, melds: [], discards: [], score: 25000, riichi: false };
}

/** Seat 0 is the point of view (all tiles known); the others hold 13 unknown tiles. */
function table(drawn: Partial<Record<1 | 2 | 3, Tile>> = {}): Quad<SeatView> {
  const hidden = tiles("?????????????");
  return [
    view(tiles("123m456p22789s55z")),
    view(hidden, drawn[1] ?? null),
    view(hidden, drawn[2] ?? null),
    view(hidden, drawn[3] ?? null),
  ];
}

describe("revealedSeats", () => {
  it("reveals everyone when all hands are shown", () => {
    expect([...revealedSeats(2, true, [])].sort()).toEqual([0, 1, 2, 3]);
  });

  it("reveals the point of view, winners and tenpai hands only", () => {
    expect([...revealedSeats(0, false, [])]).toEqual([0]);
    expect(
      [...revealedSeats(0, false, [{ type: "win", seat: 2, from: 1, deltas }])].sort(),
    ).toEqual([0, 2]);
    const draw: RyukyokuEvent = { type: "ryukyoku", reason: "exhaustive", deltas, tenpai: [1, 3] };
    expect([...revealedSeats(0, false, [draw])].sort()).toEqual([0, 1, 3]);
  });

  it("reveals the hands a draw lists, e.g. the kyuushu kyuuhai declarer", () => {
    const draw: RyukyokuEvent = {
      type: "ryukyoku",
      reason: "kyuushuKyuuhai",
      deltas,
      hands: [null, null, tiles("19m19p19s12345z234m"), null],
    };
    expect([...revealedSeats(0, false, [draw])].sort()).toEqual([0, 2]);
  });

  it("reveals every winner of a multiple ron", () => {
    const wins: WinEvent[] = [
      { type: "win", seat: 1, from: 0, deltas },
      { type: "win", seat: 3, from: 0, deltas },
    ];
    expect([...revealedSeats(0, false, wins)].sort()).toEqual([0, 1, 3]);
  });
});

describe("withRevealedHands", () => {
  it("keeps the table as it is before the round ends", () => {
    const seats = table();
    expect(withRevealedHands(seats, [])).toBe(seats);
  });

  it("shows a ron winner's hand without the winning tile, which stays in the pond", () => {
    const seats = table();
    const win: WinEvent = {
      type: "win",
      seat: 2,
      from: 0,
      deltas,
      tile: "3s",
      hand: tiles("123456789p2245s3s"),
    };
    const filled = withRevealedHands(seats, [win]);
    expect(filled[2].hand).toEqual(tiles("123456789p2245s"));
    expect(filled[2].drawn).toBeNull();
    expect(filled[0]).toBe(seats[0]);
    expect(filled[1]).toBe(seats[1]);
  });

  it("keeps a tsumo winner's winning tile apart as the drawn tile", () => {
    const seats = table({ 1: "?" });
    const hand = tiles("4s123456789p225s3s");
    const filled = withRevealedHands(seats, [
      { type: "win", seat: 1, from: 1, deltas, tile: "3s", hand },
    ]);
    expect(filled[1].hand).toEqual(tiles("123456789p2245s"));
    expect(filled[1].drawn).toBe("3s");
  });

  it("fills in the hands a draw shows, sorted", () => {
    const seats = table();
    const draw: RyukyokuEvent = {
      type: "ryukyoku",
      reason: "exhaustive",
      deltas,
      tenpai: [3],
      hands: [null, null, null, tiles("55z987s22s654p321m")],
    };
    const filled = withRevealedHands(seats, [draw]);
    expect(filled[3].hand).toEqual(tiles("123m456p22789s55z"));
    expect(filled[2]).toBe(seats[2]);
  });

  it("shows a kyuushu kyuuhai hand whole when the drawn tile is unknown", () => {
    const seats = table({ 1: "?" });
    const hand = tiles("19m19p19s12345z234m");
    const filled = withRevealedHands(seats, [
      { type: "ryukyoku", reason: "kyuushuKyuuhai", deltas, hands: [null, hand, null, null] },
    ]);
    expect(filled[1].hand).toEqual(tiles("12349m19p19s12345z"));
    expect(filled[1].drawn).toBeNull();
  });

  it("keeps a known drawn tile apart in a hand a draw shows", () => {
    const seats = table({ 1: "4m" });
    const hand = tiles("19m19p19s12345z234m");
    const filled = withRevealedHands(seats, [
      { type: "ryukyoku", reason: "kyuushuKyuuhai", deltas, hands: [null, hand, null, null] },
    ]);
    expect(filled[1].hand).toEqual(tiles("1239m19p19s12345z"));
    expect(filled[1].drawn).toBe("4m");
  });

  it("leaves hands the replay already knows and hands of the wrong size alone", () => {
    const seats = table();
    const filled = withRevealedHands(seats, [
      {
        type: "ryukyoku",
        reason: "exhaustive",
        deltas,
        hands: [tiles("123456789p2245s"), tiles("123456789p224s"), null, null],
      },
    ]);
    expect(filled[0]).toBe(seats[0]);
    expect(filled[1]).toBe(seats[1]);
  });
});
