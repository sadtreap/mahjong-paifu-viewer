import { describe, expect, it } from "vitest";
import type { Round } from "../../core/model";
import { MESSAGES } from "../../i18n/messages";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { boardState, game as fixtureGame } from "../__fixtures__/game";
import { playerNames } from "../labels";
import { playerRows } from "./players";

const { en } = MESSAGES;

describe("playerRows", () => {
  it("gives each playing seat its name, wind and score at the step", () => {
    const names = playerNames(en, fixtureGame.players);
    const rows = playerRows(4, fixtureGame.rounds[0] as Round, boardState(), names);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ seat: 0, name: "A", wind: 0, score: 25000 });
    expect(rows[1]).toEqual({ seat: 1, name: "B", wind: 1, score: 24000 });
  });

  it("skips the empty chair, uses three-player winds and falls back to the start scores", () => {
    const sanma = sanmaCrossFormatGame();
    const names = playerNames(en, sanma.players);
    const round = sanma.rounds[2] as Round; // dealer: seat 1
    const rows = playerRows(3, round, null, names);
    expect(rows.map((r) => [r.seat, r.wind])).toEqual([
      [0, 2],
      [1, 0],
      [2, 1],
    ]);
    expect(rows.map((r) => r.score)).toEqual(round.scores.slice(0, 3));
  });
});
