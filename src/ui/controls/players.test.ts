import { describe, expect, it } from "vitest";
import type { Round, Seat } from "../../core/model";
import { MESSAGES } from "../../i18n/messages";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { boardState, game as fixtureGame } from "../__fixtures__/game";
import { playerNames } from "../labels";
import type { SeatAid } from "../viewer/types";
import { playerRows } from "./players";

const { en } = MESSAGES;

describe("playerRows", () => {
  it("gives each playing seat its name, wind and score at the step", () => {
    const names = playerNames(en, fixtureGame.players);
    const rows = playerRows(4, fixtureGame.rounds[0] as Round, boardState(), names);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ seat: 0, name: "A", wind: 0, score: 25000, aid: null });
    expect(rows[1]).toEqual({ seat: 1, name: "B", wind: 1, score: 24000, aid: null });
  });

  it("carries each seat's aid, asked once for every playing seat in seat order", () => {
    const names = playerNames(en, fixtureGame.players);
    const waits: SeatAid = { kind: "waits", tiles: ["1p", "4p"], left: 5, furiten: false };
    const asked: Seat[] = [];
    const rows = playerRows(4, fixtureGame.rounds[0] as Round, boardState(), names, (seat) => {
      asked.push(seat);
      return seat === 1 ? waits : seat === 0 ? { kind: "shanten", value: 2 } : null;
    });
    expect(asked).toEqual([0, 1, 2, 3]);
    expect(rows.map((row) => row.aid)).toEqual([{ kind: "shanten", value: 2 }, waits, null, null]);
  });

  it("skips the empty chair, uses three-player winds and falls back to the start scores", () => {
    const sanma = sanmaCrossFormatGame();
    const names = playerNames(en, sanma.players);
    const round = sanma.rounds[2] as Round; // dealer: seat 1
    const asked: Seat[] = [];
    const rows = playerRows(3, round, null, names, (seat) => {
      asked.push(seat);
      return null;
    });
    // The empty chair has no row, and nobody asks for its aid.
    expect(asked).toEqual([0, 1, 2]);
    expect(rows.map((r) => [r.seat, r.wind])).toEqual([
      [0, 2],
      [1, 0],
      [2, 1],
    ]);
    expect(rows.map((r) => r.score)).toEqual(round.scores.slice(0, 3));
  });
});
