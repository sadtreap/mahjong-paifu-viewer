import type { Quad, RyukyokuEvent, Seat, WinEvent } from "../core/model";
import { SEATS } from "../core/model";
import { isKnownTile, sortTiles, type Tile, UNKNOWN_TILE } from "../core/tile";
import type { SeatView } from "../replay/types";
import { splitWinningHand } from "./layout";

type RoundResult = WinEvent | RyukyokuEvent;

/**
 * Seats whose concealed tiles are drawn face up. With "show all hands" off only the point of view
 * is shown, plus every hand the round end reveals: winners, tenpai seats and any hand a draw lists.
 */
export function revealedSeats(
  pov: Seat,
  showAll: boolean,
  results: readonly RoundResult[],
): Set<Seat> {
  if (showAll) {
    return new Set(SEATS);
  }
  const seats = new Set<Seat>([pov]);
  for (const result of results) {
    if (result.type === "win") {
      seats.add(result.seat);
      continue;
    }
    for (const seat of result.tenpai ?? []) {
      seats.add(seat);
    }
    for (const seat of SEATS) {
      if (result.hands?.[seat]) {
        seats.add(seat);
      }
    }
  }
  return seats;
}

/**
 * Fills in the hands the round end reveals (a winner's hand, the hands a draw lists) where the
 * replay does not know every concealed tile, e.g. other players' tiles in a log recorded from one
 * seat. A hand whose size does not match the table is left as replayed.
 */
export function withRevealedHands(
  seats: Quad<SeatView>,
  results: readonly RoundResult[],
): Quad<SeatView> {
  if (results.length === 0) {
    return seats;
  }
  const filled = [...seats] as Quad<SeatView>;
  for (const result of results) {
    if (result.type === "win") {
      if (result.hand) {
        filled[result.seat] = fillWinningHand(filled[result.seat], result.hand, result.tile);
      }
      continue;
    }
    for (const seat of SEATS) {
      const hand = result.hands?.[seat];
      if (hand) {
        filled[seat] = fillDrawHand(filled[seat], hand);
      }
    }
  }
  return filled;
}

function hasUnknownTiles(view: SeatView): boolean {
  return view.hand.includes(UNKNOWN_TILE) || view.drawn === UNKNOWN_TILE;
}

/** The winning hand includes the winning tile: the drawn tile for tsumo, the discard for ron. */
function fillWinningHand(view: SeatView, hand: readonly Tile[], tile: Tile | undefined): SeatView {
  if (!hasUnknownTiles(view)) {
    return view;
  }
  const winningTile = tile ?? (view.drawn !== null && isKnownTile(view.drawn) ? view.drawn : null);
  if (winningTile === null) {
    return view;
  }
  const { rest, winning } = splitWinningHand(hand, winningTile);
  if (rest.length !== view.hand.length) {
    return view;
  }
  return { ...view, hand: rest, drawn: view.drawn === null ? null : winning };
}

/** A hand shown at a draw has every concealed tile, including a drawn one (kyuushu kyuuhai). */
function fillDrawHand(view: SeatView, hand: readonly Tile[]): SeatView {
  if (!hasUnknownTiles(view)) {
    return view;
  }
  const count = view.hand.length + (view.drawn === null ? 0 : 1);
  if (hand.length !== count) {
    return view;
  }
  if (view.drawn !== null && isKnownTile(view.drawn)) {
    const { rest, winning } = splitWinningHand(hand, view.drawn);
    if (rest.length === view.hand.length) {
      return { ...view, hand: rest, drawn: winning };
    }
  }
  // Which tile was drawn is unknown, so the whole hand is shown together.
  return { ...view, hand: sortTiles(hand), drawn: null };
}
