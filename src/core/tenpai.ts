import { type Quad, SEATS, type Seat } from "./model";

/**
 * Tenpai seats at an exhaustive draw, read from the noten payments (the draw's deltas): the seats
 * that receive points, when some seats receive and others pay. Undefined when nobody pays, since
 * everyone tenpai and everyone noten both pay nothing. Shared by the parsers of formats that only
 * record the payments (tenhou.net/6, convlog-flavor mjai).
 */
export function tenpaiFromDeltas(deltas: Quad<number>): Seat[] | undefined {
  if (deltas.some((delta) => delta > 0) && deltas.some((delta) => delta < 0)) {
    return SEATS.filter((seat) => deltas[seat] > 0);
  }
  return undefined;
}
