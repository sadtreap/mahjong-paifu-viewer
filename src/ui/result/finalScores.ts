import type { GameLog, Quad } from "../../core/model";
import { roundDeltas, roundResults } from "../controls/roundSummary";

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
