/**
 * Seat arithmetic shared by the parsers, the replay engine and the UI, for three- and four-player
 * games. Three-player games keep four seat slots (see model.ts): seats 0-2 play, seat 3 is an
 * empty chair. Geometry (who sits across, the side of the table a seat is drawn on, the relative
 * call codes of both Tenhou formats) stays four-seat; turn order and seat winds cycle over the
 * playing seats only.
 */

import type { PlayerCount, Seat, Wind } from "./model";
import { SEATS } from "./model";

const THREE_SEATS: readonly Seat[] = [0, 1, 2];

/** The seats that play: 0-2 with three players, 0-3 with four. */
export function activeSeats(playerCount: PlayerCount): readonly Seat[] {
  return playerCount === 3 ? THREE_SEATS : SEATS;
}

/** Whether a seat plays in a game with this many players (seat 3 is empty with three). */
export function isActiveSeat(seat: Seat, playerCount: PlayerCount): boolean {
  return seat < playerCount;
}

/** The seat that plays after `seat` in turn order. */
export function nextSeat(seat: Seat, playerCount: PlayerCount): Seat {
  return ((seat + 1) % playerCount) as Seat;
}

/** The seat that plays before `seat` in turn order (whose discards `seat` may chi in four-player). */
export function previousSeat(seat: Seat, playerCount: PlayerCount): Seat {
  return ((seat + playerCount - 1) % playerCount) as Seat;
}

/**
 * A seat's wind in a round: the dealer is East and the winds follow turn order, so with three
 * players there is no North seat. Meaningless for the empty chair.
 */
export function seatWind(seat: Seat, dealer: Seat, playerCount: PlayerCount): Wind {
  return ((seat - dealer + playerCount) % playerCount) as Wind;
}

/** Live wall after the deal: 136 - 4 x 13 - 14 = 70, or 108 - 3 x 13 - 14 = 55 with three players. */
export const LIVE_WALL_SIZE: Record<PlayerCount, number> = { 3: 55, 4: 70 };

/** Total noten penalty at an exhaustive draw (Tenhou: 3000, or 2000 with three players). */
export const NOTEN_PENALTY_TOTAL: Record<PlayerCount, number> = { 3: 2000, 4: 3000 };

/**
 * Tile kinds (tileKind numbering: 0 = 1m) that three-player games leave out: 2m-8m. With them gone,
 * a 1m dora indicator points at 9m and 9m at 1m.
 */
export const SANMA_UNUSED_KINDS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7]);
