import { describe, expect, it } from "vitest";
import type { MeldView } from "../../replay/types";
import { tiles, win } from "../../test/round-builder";
import { handLineUnits } from "./handUnits";

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

describe("handLineUnits", () => {
  it("measures a closed hand: thirteen tiles, the gap and the winning tile", () => {
    const closed = win(1, 0, [-1000, 1000, 0, 0], {
      tile: "2z",
      hand: tiles("123m456p789s11222z"),
    });
    expect(handLineUnits(closed, [], [])).toBeCloseTo(14.35);
  });

  it("adds the margin before the calls, however many follow", () => {
    const called = win(2, 3, [0, 0, 1000, -1000], { tile: "3p", hand: tiles("11555m403p") });
    expect(handLineUnits(called, [pon], [])).toBeCloseTo(7 + 1.35 + 0.45);
    expect(handLineUnits(called, [pon, chi], [])).toBeCloseTo(7 + 1.35 + 0.45);
  });

  it("does not count the calls themselves, which go after the line", () => {
    const kans = win(2, 2, [0, 0, 0, 0], { tile: "1p", hand: tiles("11p") });
    expect(handLineUnits(kans, [ankan, kakan], [])).toBeCloseTo(2.8);
  });

  it("counts the kita as a call after the line", () => {
    const sanma = win(0, 0, [6000, -3000, -3000, 0], { tile: "9s", hand: tiles("12345678999s") });
    expect(handLineUnits(sanma, [], ["4z", "4z"])).toBeCloseTo(10 + 1.35 + 0.45);
  });

  it("is nothing when the log has no hand", () => {
    expect(handLineUnits(win(1, 0, [-1000, 1000, 0, 0], { tile: "7z" }), [pon], [])).toBeNull();
  });
});
