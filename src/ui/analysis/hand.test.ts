import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GameLog, Quad } from "../../core/model";
import { activeSeats } from "../../core/players";
import { type Tile, tileFromKind, tileKind } from "../../core/tile";
import { parseMjlog } from "../../formats/mjlog/parse";
import { parseTenhouJson } from "../../formats/tenhou-json/parse";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState, SeatView } from "../../replay/types";
import {
  corpusFiles,
  MJLOG_CORPUS,
  SANMA_MJLOG_CORPUS,
  SANMA_TENHOU_JSON_CORPUS,
} from "../../test/corpus";
import { tiles } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { boardState } from "../__fixtures__/game";
import {
  concealedTiles,
  isDiscardFuriten,
  kindCounts,
  liveShanten,
  shanten,
  unseenCounts,
  visibleCounts,
  waits,
} from "./hand";

/** Wait kinds as mpsz tiles, for readable assertions. */
const waitTiles = (spec: string, melds = 0, playerCount: 3 | 4 = 4) =>
  waits(tiles(spec), melds, playerCount).map((kind) => tileFromKind(kind));

const sum = (counts: Uint8Array) => counts.reduce((total, n) => total + n, 0);

describe("waits", () => {
  it.each([
    ["ryanmen", "123m456p789s11z23s", ["1s", "4s"]],
    ["kanchan", "123m456p789s11z24s", ["3s"]],
    ["penchan", "123m456p789s11z12s", ["3s"]],
    ["shanpon", "123m456p789s11z22s", ["2s", "1z"]],
    ["tanki", "123m456p789s123s1z", ["1z"]],
    ["nobetan", "123m456p789s1234s", ["1s", "4s"]],
    ["three-sided (sanmenchan)", "123m456p11z34567s", ["2s", "5s", "8s"]],
    ["pure nine gates", "1112345678999m", tiles("123456789m")],
  ])("finds a %s wait", (_, spec, expected) => {
    expect(waitTiles(spec as string)).toEqual(expected);
  });

  it("finds the chiitoitsu wait", () => {
    expect(waitTiles("1133m55p77s11z22z3z")).toEqual(["3z"]);
    // 112233m is three pairs here; no standard shape completes the rest.
    expect(waitTiles("112233m44p55s66s7z")).toEqual(["7z"]);
  });

  it("finds a single kokushi wait and the 13-sided wait", () => {
    expect(waitTiles("19m19p19s1234567z")).toEqual(tiles("19m19p19s1234567z"));
    expect(waitTiles("119m19p19s123456z")).toEqual(["7z"]);
  });

  it("skips a kind the hand holds four of (karaten)", () => {
    // Only a fifth 1m (or 1z) would complete these hands.
    expect(waitTiles("1111m456p789s123s")).toEqual([]);
    expect(waitTiles("123m456p789s1111z")).toEqual([]);
    // 1111m23m: 1m is gone, 4m leaves the lone 1z; only 1z completes it.
    expect(waitTiles("1111m23m456p789s1z")).toEqual(["1z"]);
  });

  it("allows no chiitoitsu or kokushi with a call", () => {
    // Five pairs after a call can only become a standard hand, which they cannot.
    expect(waitTiles("1133m55p77s11z", 1)).toEqual([]);
    // Two pairs after three calls: a shanpon.
    expect(waitTiles("1133m", 3)).toEqual(["1m", "3m"]);
    expect(waitTiles("119m19p19s123456z", 1)).toEqual([]);
  });

  it("never returns 2m-8m with three players", () => {
    // 1m9m in sanma: no 23m, 78m exist, so 1m-?-? and ?-?-9m cannot be completed.
    expect(waitTiles("123p456p789s11z19m", 0, 3)).toEqual([]);
    expect(waitTiles("123p456p789s11z12m", 0, 4)).toEqual(["3m"]);
    expect(waitTiles("123p456p789s11z12m", 0, 3)).toEqual([]);
    expect(waitTiles("123p456p789s11z99m", 0, 3)).toEqual(["9m", "1z"]);
  });

  it("is empty for a hand of another size or with an unknown tile", () => {
    expect(waits(tiles("123m456p789s11z23s4s"), 0, 4)).toEqual([]);
    expect(waits([...tiles("123m456p789s11z2s"), "?"], 0, 4)).toEqual([]);
  });

  it("treats red fives as fives", () => {
    expect(waitTiles("123m406p789s11z34s")).toEqual(["2s", "5s"]);
  });
});

describe("shanten", () => {
  it.each([
    ["a complete hand", "123m456p789s11z234s", 0, -1],
    ["tenpai", "123m456p789s11z23s", 0, 0],
    ["1-shanten", "123m456p78s11z235s", 0, 1],
    ["2-shanten", "123m46p78s11z2358s", 0, 2],
    ["the worst standard hand", "147m258p369s12345z", 0, 6],
  ])("is right for %s", (_, spec, melds, expected) => {
    expect(shanten(tiles(spec as string), melds as number)).toBe(expected);
  });

  it("counts chiitoitsu", () => {
    expect(shanten(tiles("1133m55p77s11z22z3z3z"), 0)).toBe(-1);
    expect(shanten(tiles("1133m55p77s11z22z3z"), 0)).toBe(0);
    expect(shanten(tiles("1133m55p77s12345z"), 0)).toBe(2);
    // Four of a kind is one pair for chiitoitsu: 6 pairs minus the double counts one tile short.
    expect(shanten(tiles("1111m33m55p77s11z22z"), 0)).toBe(1);
  });

  it("counts kokushi", () => {
    expect(shanten(tiles("19m19p19s1234567z1m"), 0)).toBe(-1);
    expect(shanten(tiles("19m19p19s1234567z"), 0)).toBe(0);
    expect(shanten(tiles("19m19p19s123456z55m"), 0)).toBe(1);
  });

  it("caps partial sets at the free slots and needs a head", () => {
    // Three sets and two partial sets but no pair: 1-shanten, not tenpai.
    expect(shanten(tiles("123m456p789s23s56s"), 0)).toBe(1);
    // With calls: one call, three sets in hand and a lone tile is tenpai.
    expect(shanten(tiles("123m456p789s1z"), 1)).toBe(0);
    expect(shanten(tiles("123m45p1z2z"), 2)).toBe(1);
  });

  it("ignores the special shapes with calls", () => {
    expect(shanten(tiles("1133m55p77s1z"), 1)).toBeGreaterThan(0);
  });

  it("analyses 1000 random 14-tile hands in well under a second", () => {
    let state = 12345;
    const random = (n: number) => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state % n;
    };
    const hands: Tile[][] = [];
    for (let h = 0; h < 1000; h++) {
      const counts = new Array<number>(34).fill(0);
      const hand: Tile[] = [];
      while (hand.length < 14) {
        const kind = random(34);
        if ((counts[kind] ?? 0) < 4) {
          counts[kind] = (counts[kind] ?? 0) + 1;
          hand.push(tileFromKind(kind));
        }
      }
      hands.push(hand);
    }
    const start = performance.now();
    for (const hand of hands) {
      shanten(hand, 0);
      waits(hand.slice(1), 0, 4);
    }
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("visible and unseen tiles", () => {
  it("counts the seat's hand, ponds, melds and dora, never other hands", () => {
    const board = boardState();
    const visible = visibleCounts(board, 0);
    // Seat 0: 12 hand tiles + drawn 1p; 9m (called) is counted once, in seat 2's pon.
    expect(visible[tileKind("9m")]).toBe(3);
    expect(visible[tileKind("1z")]).toBe(1);
    expect(visible[tileKind("7s")]).toBe(2); // own hand + seat 3's pond
    expect(visible[tileKind("5s")]).toBe(4); // seat 3's closed kan (red five included)
    expect(visible[tileKind("3m")]).toBe(2); // own hand + dora indicator
    // Seat 1's hand (shown in this state) is not counted from seat 0.
    expect(visible[tileKind("8p")]).toBe(0);
    const ownTiles = 13;
    const public_ = 1 /* 1z */ + 1 /* 7s */ + 3 /* pon */ + 4 /* kan */ + 1; /* dora */
    expect(sum(visible)).toBe(ownTiles + public_);
  });

  it("gives 136 minus the visible tiles, 108 with three players", () => {
    const board = boardState();
    expect(sum(unseenCounts(board, 0, 4))).toBe(136 - sum(visibleCounts(board, 0)));
    const sanma = sanmaCrossFormatGame();
    const states = buildTimeline(sanma.rounds[0] as never, 3);
    for (const state of [states[0], states[states.length - 1]] as BoardState[]) {
      const unseen = unseenCounts(state, 1, 3);
      expect(sum(unseen)).toBe(108 - sum(visibleCounts(state, 1)));
      for (let kind = 1; kind <= 7; kind++) {
        expect(unseen[kind]).toBe(0);
      }
    }
  });

  it("counts kita as visible to everyone", () => {
    const board = boardState();
    const withKita: BoardState = {
      ...board,
      seats: board.seats.map((seat, index) =>
        index === 2 ? { ...seat, kita: ["4z", "4z"] } : seat,
      ) as Quad<SeatView>,
    };
    expect(visibleCounts(withKita, 0)[tileKind("4z")]).toBe(
      (visibleCounts(board, 0)[tileKind("4z")] ?? 0) + 2,
    );
  });
});

describe("helpers", () => {
  it("isDiscardFuriten checks the seat's own discards, called ones included", () => {
    const discards = [{ tile: "0p" as Tile, tsumogiri: false, riichi: false, called: true }];
    expect(isDiscardFuriten([tileKind("5p")], discards)).toBe(true);
    expect(isDiscardFuriten([tileKind("4p")], discards)).toBe(false);
  });

  it("kindCounts is null with an unknown tile; concealedTiles adds the drawn tile", () => {
    expect(kindCounts(["1m", "?"])).toBeNull();
    expect(concealedTiles({ hand: ["1m"], drawn: "2m" })).toEqual(["1m", "2m"]);
    expect(concealedTiles({ hand: ["1m"], drawn: null })).toEqual(["1m"]);
  });
});

/**
 * Corpus oracle (real games outside the repository, see src/test/corpus.ts): at every exhaustive
 * draw, a seat has waits exactly when Tenhou lists it as tenpai, and every recorded winning hand
 * is complete on its winning tile.
 */
interface OracleResult {
  draws: number;
  seats: number;
  wins: number;
  mismatches: string[];
}

function checkGame(label: string, game: GameLog): OracleResult {
  const out: OracleResult = { draws: 0, seats: 0, wins: 0, mismatches: [] };
  const seats = activeSeats(game.playerCount);
  for (const [roundIndex, round] of game.rounds.entries()) {
    const states = buildTimeline(round, game.playerCount);
    const last = states[states.length - 1] as BoardState;
    const before = states[states.length - 2] ?? last;
    for (const result of last.results) {
      if (result.type === "ryukyoku" && result.reason === "exhaustive" && result.tenpai) {
        out.draws++;
        for (const seat of seats) {
          out.seats++;
          const view = last.seats[seat];
          const found = waits(view.hand, view.melds.length, game.playerCount).length > 0;
          if (found !== result.tenpai.includes(seat)) {
            out.mismatches.push(
              `${label} round ${roundIndex} seat ${seat}: ${view.hand.join("")} melds ${view.melds.length} computed ${found}`,
            );
          }
        }
      }
      if (result.type === "win" && result.hand && result.tile) {
        out.wins++;
        const view = before.seats[result.seat];
        const melds = view.melds.length;
        const rest = removeOne(result.hand, result.tile);
        const kinds = waits(rest, melds, game.playerCount);
        if (shanten(result.hand, melds) !== -1 || !kinds.includes(tileKind(result.tile))) {
          out.mismatches.push(
            `${label} round ${roundIndex} win seat ${result.seat}: ${result.hand.join("")} on ${result.tile}`,
          );
        }
      }
    }
  }
  return out;
}

function removeOne(hand: readonly Tile[], tile: Tile): Tile[] {
  const index = hand.indexOf(tile);
  return index < 0 ? [...hand] : [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function describeOracle(variable: string, extension: string, parse: (text: string) => GameLog) {
  const files = corpusFiles(variable, extension);
  describe.skipIf(files.length === 0)(`hand analysis oracle: corpus in ${variable}`, () => {
    it("agrees with Tenhou's tenpai seats and winning hands", () => {
      const total: OracleResult = { draws: 0, seats: 0, wins: 0, mismatches: [] };
      for (const [label, path] of files) {
        const result = checkGame(label, parse(readFileSync(path, "utf-8")));
        total.draws += result.draws;
        total.seats += result.seats;
        total.wins += result.wins;
        total.mismatches.push(...result.mismatches);
      }
      console.info(
        `${variable}: ${files.length} games, ${total.draws} exhaustive draws (${total.seats} seats), ${total.wins} wins, ${total.mismatches.length} mismatches`,
      );
      expect(total.mismatches).toEqual([]);
      expect(total.draws + total.wins).toBeGreaterThan(0);
    });
  });
}

describeOracle(MJLOG_CORPUS, ".xml", parseMjlog);
describeOracle(SANMA_MJLOG_CORPUS, ".xml", parseMjlog);
describeOracle(SANMA_TENHOU_JSON_CORPUS, ".json", parseTenhouJson);

describe("the oracle on the synthetic three-player game", () => {
  it("agrees on every draw and win", () => {
    const result = checkGame("sanma", sanmaCrossFormatGame());
    expect(result.mismatches).toEqual([]);
    expect(result.draws).toBeGreaterThan(0);
    expect(result.wins).toBeGreaterThan(0);
  });
});

describe("liveShanten", () => {
  it("counts a tenpai shape whose waits are gone as 1-shanten", () => {
    expect(liveShanten(tiles("1111m456p789s123s"), 0, 4)).toBe(1);
    expect(liveShanten(tiles("1111m456p789s123s"), 0, 3)).toBe(1);
    expect(liveShanten(tiles("123m456p789s11z23s"), 0, 4)).toBe(0);
    // 14 tiles: discarding a 1m leaves a live 5z tanki.
    expect(liveShanten(tiles("1111m456p789s123s5z"), 0, 4)).toBe(0);
    expect(liveShanten(tiles("123m456p789s11z234s"), 0, 4)).toBe(-1);
    expect(liveShanten(tiles("123m456p78s11z235s"), 0, 4)).toBe(1);
  });
});
