import type { GameLog, Quad } from "../../core/model";
import { roundDeltas, roundResults } from "../controls/roundSummary";

/**
 * Scores after the last round: the source's final scores when it has them; else the scores on the
 * table at the game's last step (`atEnd`, which counts the riichi deposits paid in that round);
 * else, for a last round that could not be replayed, its start scores with its point changes.
 */
export function finalScores(game: GameLog, atEnd: Quad<number> | null = null): Quad<number> {
  if (game.finalScores) {
    return [...game.finalScores];
  }
  if (atEnd) {
    return [...atEnd];
  }
  const last = game.rounds[game.rounds.length - 1];
  if (!last) {
    return [0, 0, 0, 0];
  }
  const deltas = roundDeltas(roundResults(last));
  return last.scores.map((score, seat) => score + (deltas[seat] ?? 0)) as Quad<number>;
}
