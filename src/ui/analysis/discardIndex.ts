import type { PlayerCount, Round, Seat } from "../../core/model";
import { SEATS } from "../../core/model";
import type { BoardState } from "../../replay/types";
import { turnNumber } from "../viewer/stepIndex";
import type { DiscardIndex, DiscardInfo, DiscardRef } from "../viewer/types";

/**
 * Where each pond tile of a round came from: the step that discarded it, its decision step (the
 * step before, where the player held the tile and chose), its display turn and its flags.
 * `called` describes the end of the round: a view of an earlier step should combine it with the
 * pond tile's own `DiscardView.called`, since the call comes one step after the discard.
 * `round` is unused today and kept for the signature shared with the other per-round builders.
 */
export function discardIndex(
  _round: Round,
  states: readonly BoardState[],
  playerCount: PlayerCount,
): DiscardIndex {
  const bySeat = new Map<Seat, DiscardInfo[]>(SEATS.map((seat) => [seat, []]));
  const last = states[states.length - 1];
  for (let step = 1; step < states.length; step++) {
    const state = states[step] as BoardState;
    const previous = states[step - 1] as BoardState;
    for (const seat of SEATS) {
      const discards = state.seats[seat].discards;
      const list = bySeat.get(seat) as DiscardInfo[];
      for (let index = previous.seats[seat].discards.length; index < discards.length; index++) {
        const view = discards[index];
        if (!view || index !== list.length) {
          continue;
        }
        list.push({
          step,
          decisionStep: Math.max(0, step - 1),
          turn: turnNumber(states, step, playerCount),
          tile: view.tile,
          tsumogiri: view.tsumogiri,
          riichi: view.riichi,
          afterRiichi: list.some((earlier) => earlier.riichi),
          called: last?.seats[seat].discards[index]?.called ?? view.called,
        });
      }
    }
  }
  return {
    get: (ref: DiscardRef) => bySeat.get(ref.seat)?.[ref.index],
  };
}
