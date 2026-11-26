import type { Quad, Round, RoundEvent, RyukyokuEvent, Seat, WinEvent } from "../core/model";
import type { Tile } from "../core/tile";
import type { Messages } from "../i18n/messages";
import type { BoardState } from "../replay/types";
import { roundLabel, tileLabel } from "./labels";

/**
 * The event a step is about. `dora` and `riichiAccepted` events fold into the step before them, so
 * walk back from the step's last applied event to the one that started it.
 */
export function stepEvent(
  events: readonly RoundEvent[],
  state: Pick<BoardState, "eventIndex" | "lastEvent">,
): RoundEvent | null {
  for (let index = state.eventIndex; index >= 0; index--) {
    const event = events[index];
    if (event && event.type !== "dora" && event.type !== "riichiAccepted") {
      return event;
    }
  }
  return state.eventIndex >= 0 ? state.lastEvent : null;
}

/**
 * The pond tile to highlight: the discard just made, or the tile that was ronned. Returns the seat
 * and the index in that seat's discards.
 */
export function highlightedDiscard(
  events: readonly RoundEvent[],
  state: Pick<BoardState, "eventIndex" | "lastEvent" | "seats">,
): { seat: Seat; index: number } | null {
  const event = stepEvent(events, state);
  let seat: Seat | null = null;
  if (event?.type === "discard") {
    seat = event.seat;
  } else if (event?.type === "win" && event.from !== event.seat) {
    // Multiple ron share one step: find the event before the first win of the step.
    let index = state.eventIndex;
    while (index >= 0 && events[index]?.type === "win") {
      index--;
    }
    const before = events[index];
    if (before?.type === "discard" && before.seat === event.from) {
      seat = event.from;
    }
  }
  if (seat === null) {
    return null;
  }
  const index = state.seats[seat].discards.length - 1;
  return index >= 0 ? { seat, index } : null;
}

/** One-line description of a step for the status line and screen readers. */
export function describeStep(
  m: Messages,
  round: Round,
  state: BoardState,
  names: Quad<string>,
  isRevealed: (seat: Seat) => boolean,
): string {
  if (state.results.length > 0) {
    return state.results.map((result) => describeResult(m, result, names)).join(" / ");
  }
  const event = stepEvent(round.events, state);
  if (!event) {
    // Name the round, so a jump to another round is announced with where it landed.
    return m.event.deal(roundLabel(m, round));
  }
  const tile = (value: Tile) => tileLabel(m, value);
  switch (event.type) {
    case "draw":
      return m.event.draw(names[event.seat], isRevealed(event.seat) ? tile(event.tile) : null);
    case "discard":
      if (event.riichi) {
        return m.event.riichi(names[event.seat], tile(event.tile));
      }
      return event.tsumogiri
        ? m.event.tsumogiri(names[event.seat], tile(event.tile))
        : m.event.discard(names[event.seat], tile(event.tile));
    case "chi":
    case "pon":
    case "daiminkan":
      return m.event.call(names[event.seat], m.calls[event.type], tile(event.tile));
    case "ankan":
      return m.event.kan(names[event.seat], m.calls.ankan, tile(event.tiles[0] ?? "?"));
    case "kakan":
      return m.event.kan(names[event.seat], m.calls.kakan, tile(event.tile));
    case "dora":
      return m.event.dora(tile(event.indicator));
    case "kita":
      return m.event.kita(names[event.seat]);
    case "riichiAccepted":
      return m.event.riichiAccepted(names[event.seat]);
    case "win":
    case "ryukyoku":
      return describeResult(m, event, names);
  }
}

function describeResult(
  m: Messages,
  result: WinEvent | RyukyokuEvent,
  names: Quad<string>,
): string {
  if (result.type === "ryukyoku") {
    return m.ryukyoku[result.reason];
  }
  return result.from === result.seat
    ? m.event.tsumo(names[result.seat])
    : m.event.ron(names[result.seat], names[result.from]);
}
