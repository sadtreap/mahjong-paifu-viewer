/**
 * One summary per round of a game, for the round list: which round it is, how it ended and the
 * point changes. Pure, and without text: the list words it in the reader's language.
 */
import type { GameLog, Quad, Round, RyukyokuEvent, WinEvent } from "../../core/model";
import type { RoundOutcome, RoundSummary } from "../viewer/types";

type Result = WinEvent | RyukyokuEvent;

/** The results a round's log ends with (wins, or the draw). */
export function roundResults(round: Round): Result[] {
  if (!Array.isArray(round.events)) {
    return [];
  }
  return round.events.filter(
    (event): event is Result => event.type === "win" || event.type === "ryukyoku",
  );
}

/** The round's wins (each with who paid for it and its value), or a draw; null with no result. */
export function roundOutcome(results: readonly Result[]): RoundOutcome {
  const wins = results.filter((result): result is WinEvent => result.type === "win");
  if (wins.length > 0) {
    return {
      kind: "win",
      wins: wins.map((win) => ({ seat: win.seat, from: win.from, points: win.points })),
    };
  }
  return results.length > 0 ? { kind: "draw" } : null;
}

/** The point changes of all of a round's results together. */
export function roundDeltas(results: readonly Result[]): Quad<number> {
  const deltas: Quad<number> = [0, 0, 0, 0];
  for (const result of results) {
    for (let seat = 0; seat < 4; seat++) {
      deltas[seat] = (deltas[seat] ?? 0) + (result.deltas[seat] ?? 0);
    }
  }
  return deltas;
}

/** Every round of the game with its outcome and point changes. */
export function gameOverview(game: GameLog): RoundSummary[] {
  return game.rounds.map((round, index) => {
    const results = roundResults(round);
    return {
      index,
      wind: round.wind,
      number: round.number,
      honba: round.honba,
      outcome: roundOutcome(results),
      deltas: roundDeltas(results),
    };
  });
}
