import type { PlayerCount, Quad, Seat } from "./model";
import { activeSeats } from "./players";

/**
 * Tenpai seats at an exhaustive draw, read from the noten payments (the draw's deltas): the seats
 * that receive points, when some seats receive and others pay. Undefined when nobody pays, since
 * everyone tenpai and everyone noten both pay nothing. Shared by the parsers of formats that only
 * record the payments (tenhou.net/6, convlog-flavor mjai). With three players only seats 0-2 are
 * read, so the empty chair is never tenpai.
 */
export function tenpaiFromDeltas(
  deltas: Quad<number>,
  playerCount: PlayerCount = 4,
): Seat[] | undefined {
  const seats = activeSeats(playerCount);
  if (seats.some((seat) => deltas[seat] > 0) && seats.some((seat) => deltas[seat] < 0)) {
    return seats.filter((seat) => deltas[seat] > 0);
  }
  return undefined;
}
