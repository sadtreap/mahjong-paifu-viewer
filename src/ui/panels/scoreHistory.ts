import type { GameLog, Quad } from "../../core/model";
import { activeSeats } from "../../core/players";
import { roundDeltas, roundResults } from "../timeline/timelineModel";

/** Scores after the last round: the source's final scores when it has them, else the round's end. */
export function finalScores(game: GameLog): Quad<number> {
  if (game.finalScores) {
    return [...game.finalScores];
  }
  const last = game.rounds[game.rounds.length - 1];
  if (!last) {
    return [0, 0, 0, 0];
  }
  const deltas = roundDeltas(roundResults(last));
  return last.scores.map((score, seat) => score + (deltas[seat] ?? 0)) as Quad<number>;
}

/**
 * The score chart's series: for each playing seat (in seat order, as `activeSeats` lists them),
 * its score at the start of every round, then after the game (the source's final scores when it
 * has them).
 */
export function scoreSeries(game: GameLog): number[][] {
  const end = finalScores(game);
  return activeSeats(game.playerCount).map((seat) =>
    game.rounds.length === 0 ? [] : [...game.rounds.map((round) => round.scores[seat]), end[seat]],
  );
}
