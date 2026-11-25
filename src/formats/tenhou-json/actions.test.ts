import { describe, expect, it } from "vitest";
import { LogParseError } from "../errors";
import { parseSeatActions, tileFromTenhou } from "./actions";

describe("tileFromTenhou", () => {
  it("maps Tenhou tile ids to mpsz", () => {
    expect([11, 19, 21, 25, 29, 31, 39].map(tileFromTenhou)).toEqual([
      "1m",
      "9m",
      "1p",
      "5p",
      "9p",
      "1s",
      "9s",
    ]);
    expect([41, 44, 45, 47].map(tileFromTenhou)).toEqual(["1z", "4z", "5z", "7z"]);
    expect([51, 52, 53].map(tileFromTenhou)).toEqual(["0m", "0p", "0s"]);
  });

  it("rejects ids that are not tiles", () => {
    for (const id of [0, 10, 20, 40, 48, 50, 54, 60, 1.5, "11", null]) {
      expect(() => tileFromTenhou(id)).toThrow(LogParseError);
    }
  });
});

describe("parseSeatActions", () => {
  it("reads chi, pon and open kan with the seat they come from", () => {
    // Seat 1: kamicha is seat 0, toimen seat 3, shimocha seat 2.
    const { takes } = parseSeatActions(
      1,
      ["c275226", "p252525", "12p1212", "3737p37", "m39393939", "26m262626", "131313m13"],
      [],
    );
    expect(takes).toEqual([
      { kind: "chi", from: 0, tile: "7p", consumed: ["0p", "6p"] },
      { kind: "pon", from: 0, tile: "5p", consumed: ["5p", "5p"] },
      { kind: "pon", from: 3, tile: "2m", consumed: ["2m", "2m"] },
      { kind: "pon", from: 2, tile: "7s", consumed: ["7s", "7s"] },
      { kind: "daiminkan", from: 0, tile: "9s", consumed: ["9s", "9s", "9s"] },
      { kind: "daiminkan", from: 3, tile: "6p", consumed: ["6p", "6p", "6p"] },
      { kind: "daiminkan", from: 2, tile: "3m", consumed: ["3m", "3m", "3m"] },
    ]);
  });

  it("reads discards, tsumogiri, riichi, kans and the open kan placeholder", () => {
    const { discards } = parseSeatActions(
      0,
      [11, 12, 13, 14, 15, "m16161616", 17, 18],
      [11, 60, "r13", "r60", "k51151515", 0, "171717a17", "4646k4646"],
    );
    expect(discards).toEqual([
      { kind: "discard", tile: "1m", tsumogiri: false, riichi: false },
      { kind: "discard", tile: "2m", tsumogiri: true, riichi: false },
      { kind: "discard", tile: "3m", tsumogiri: false, riichi: true },
      { kind: "discard", tile: "4m", tsumogiri: true, riichi: true },
      { kind: "kakan", tile: "0m" },
      { kind: "kanSlot" },
      { kind: "ankan", tiles: ["7m", "7m", "7m", "7m"] },
      { kind: "kakan", tile: "6z" },
    ]);
  });

  it("rejects malformed call strings", () => {
    const bad = [
      [["c111214"], []], // a chi needs a sequence
      [["c2752"], []],
      [["p252526"], []], // a pon needs three of a kind
      [["2p52525"], []], // the letter must start a tile
      [["2525m2525"], []], // an open kan cannot come from this position
      [["x252525"], []],
      [[11], ["r1"]],
      [[11], ["k1111"]],
      [["p252525"], [60]], // no drawn tile to discard after a call
      [[11], [{}]],
    ];
    for (const [takes, discards] of bad) {
      expect(() => parseSeatActions(0, takes, discards), JSON.stringify(takes)).toThrow(
        LogParseError,
      );
    }
    expect(() => parseSeatActions(0, null, [])).toThrow(LogParseError);
  });
});
