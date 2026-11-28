import type { GameLog, Round } from "../../../core/model";
import { buildTimeline } from "../../../replay/timeline";
import type { BoardState } from "../../../replay/types";
import { withRevealedHands } from "../../reveal";

/**
 * The table at the last step of one round of a game, where the round's result is, with the hands
 * the result reveals filled in: what the viewer gives the panel at a round's end.
 */
export function resultStep(game: GameLog, index: number): { round: Round; board: BoardState } {
  const round = game.rounds[index];
  if (!round) {
    throw new Error(`The game has no round ${index}`);
  }
  const states = buildTimeline(round, game.playerCount);
  const last = states[states.length - 1];
  if (!last || last.results.length === 0) {
    throw new Error(`Round ${index} has no result step`);
  }
  return { round, board: { ...last, seats: withRevealedHands(last.seats, last.results) } };
}
