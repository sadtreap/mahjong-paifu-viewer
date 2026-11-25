import type { Round, RoundEvent, Seat } from "../core/model";
import { asSeat, RoundReplay } from "./engine";
import type { BoardState } from "./types";

/**
 * Replays a round into display steps. Index 0 is the table right after the deal; each later entry
 * is the table after one step. A step is one event, except that `dora` and `riichiAccepted` events
 * fold into the step before them and consecutive `win` events (multiple ron) form a single step.
 *
 * In a folded step, `lastEvent` and `activeSeat` describe the step's first (main) event, e.g. the
 * riichi discard or the first ron, while `eventIndex` is the index of the last event applied. A
 * fold event with no event step before it (only the deal) becomes a step of its own, so index 0 is
 * always the bare deal.
 *
 * Riichi: the riichi discard step shows the sideways declaration tile (DiscardView.riichi). When its
 * riichiAccepted folds into that step, the same step also shows the paid deposit (SeatView.riichi,
 * the lower score and one more riichi stick). A riichi discard that is ronned has no riichiAccepted,
 * so neither its step nor the result step shows a deposit for that seat.
 *
 * Never throws: inconsistent events are applied as well as possible (see `checkRound` to find them).
 */
export function buildTimeline(round: Round): BoardState[] {
  const replay = new RoundReplay(round);
  const states = [replay.snapshot(-1, null, null)];
  const events: readonly RoundEvent[] =
    typeof round === "object" && round !== null && Array.isArray(round.events) ? round.events : [];
  let step: { main: RoundEvent; lastIndex: number } | null = null;
  for (const [index, event] of events.entries()) {
    if (step !== null && foldsInto(step.main, event)) {
      step.lastIndex = index;
    } else {
      if (step !== null) {
        states.push(replay.snapshot(step.lastIndex, step.main, actingSeat(step.main)));
      }
      step = { main: event, lastIndex: index };
    }
    replay.apply(event, index);
  }
  if (step !== null) {
    states.push(replay.snapshot(step.lastIndex, step.main, actingSeat(step.main)));
  }
  return states;
}

function eventType(event: unknown): unknown {
  return typeof event === "object" && event !== null
    ? (event as { type?: unknown }).type
    : undefined;
}

function foldsInto(main: RoundEvent, event: unknown): boolean {
  const type = eventType(event);
  return (
    type === "dora" || type === "riichiAccepted" || (type === "win" && eventType(main) === "win")
  );
}

function actingSeat(event: RoundEvent): Seat | null {
  if (typeof event !== "object" || event === null || !("seat" in event)) {
    return null;
  }
  return asSeat(event.seat);
}
