import { describe, expect, it } from "vitest";
import type { MeldView } from "../../replay/types";
import { tiles, win } from "../../test/round-builder";
import { handUnits } from "./handUnits";

const pon: MeldView = { type: "pon", tiles: ["5z", "5z"], from: 3, calledTile: "5z" };
const chi: MeldView = { type: "chi", tiles: ["2s", "3s"], from: 1, calledTile: "1s" };
const ankan: MeldView = { type: "ankan", tiles: ["7m", "7m", "7m", "7m"] };
const kakan: MeldView = {
  type: "kakan",
  tiles: ["3z", "3z"],
  from: 0,
  calledTile: "3z",
  addedTile: "3z",
};

describe("handUnits", () => {
  it("measures a closed hand: thirteen tiles, the gap and the winning tile", () => {
    const closed = win(1, 0, [-1000, 1000, 0, 0], {
      tile: "2z",
      hand: tiles("123m456p789s11222z"),
    });
    expect(handUnits(closed, [], [])).toEqual({ line: 14.35, all: 14.35 });
  });

  it("adds the margin before the calls to the hand, and each call with its gap", () => {
    const called = win(2, 3, [0, 0, 1000, -1000], { tile: "3p", hand: tiles("11555m403p") });
    const units = handUnits(called, [pon, chi], []);
    expect(units?.line).toBeCloseTo(7 + 1.35 + 0.45);
    // A pon and a chi: two upright tiles and a sideways one each.
    expect(units?.all).toBeCloseTo(8.8 + 2 * (0.3 + 2 + 4 / 3));
  });

  it("counts a closed kan as four upright tiles and a kakan's stack as one sideways tile", () => {
    const kans = win(2, 2, [0, 0, 0, 0], { tile: "1p", hand: tiles("11p") });
    const units = handUnits(kans, [ankan, kakan], []);
    expect(units?.line).toBeCloseTo(2.8);
    expect(units?.all).toBeCloseTo(2.8 + (0.3 + 4) + (0.3 + 2 + 4 / 3));
  });

  it("counts the kita as one more call of upright tiles", () => {
    const sanma = win(0, 0, [6000, -3000, -3000, 0], { tile: "9s", hand: tiles("12345678999s") });
    const units = handUnits(sanma, [], ["4z", "4z"]);
    expect(units?.line).toBeCloseTo(10 + 1.35 + 0.45);
    expect(units?.all).toBeCloseTo(11.8 + 0.3 + 2);
  });

  it("is nothing when the log has no hand", () => {
    expect(handUnits(win(1, 0, [-1000, 1000, 0, 0], { tile: "7z" }), [pon], [])).toBeNull();
  });
});
