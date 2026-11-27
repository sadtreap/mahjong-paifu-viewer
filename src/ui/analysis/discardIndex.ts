import { SEATS } from "../../core/model";
import type { BoardState } from "../../replay/types";
import type { DiscardIndex } from "../viewer/types";

/**
 * The decision step of each pond tile of a round: the step before the one that discarded it, where
 * the player held the tile and chose.
 */
export function discardIndex(states: readonly BoardState[]): DiscardIndex {
  const bySeat = SEATS.map((): number[] => []);
  for (let step = 1; step < states.length; step++) {
    const state = states[step] as BoardState;
    for (const seat of SEATS) {
      const steps = bySeat[seat] as number[];
      // A pond only grows (a called tile stays in it): a tile new at this step was discarded by it.
      while (steps.length < state.seats[seat].discards.length) {
        steps.push(step - 1);
      }
    }
  }
  return {
    decisionStep: (ref) => bySeat[ref.seat]?.[ref.index],
  };
}
