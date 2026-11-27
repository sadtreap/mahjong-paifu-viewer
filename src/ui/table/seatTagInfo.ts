import type { PlayerCount, Seat, Wind } from "../../core/model";
import { activeSeats, seatWind } from "../../core/players";
import type { SeatView } from "../../replay/types";
import { SIDES, seatOnSide } from "../layout";
import type { SeatAid, SeatTagInfo } from "../viewer/types";

/** Input of `seatTagsFor`: what the viewer already has per step. */
export interface SeatTagsInput {
  playerCount: PlayerCount;
  dealer: Seat;
  seats: readonly SeatView[];
  names: readonly string[];
  pov: Seat;
  /** The aid of a seat (from analysis/aids.ts), or null; called for playing seats only. */
  aid(seat: Seat): SeatAid | null;
}

/** Tags for the playing seats, in side order from the point of view (none for the empty chair). */
export function seatTagsFor(input: SeatTagsInput): SeatTagInfo[] {
  const playing = new Set(activeSeats(input.playerCount));
  const tags: SeatTagInfo[] = [];
  for (const side of SIDES) {
    const seat = seatOnSide(side, input.pov);
    if (!playing.has(seat)) {
      continue;
    }
    const view = input.seats[seat];
    const wind: Wind = seatWind(seat, input.dealer, input.playerCount);
    tags.push({
      seat,
      side,
      name: input.names[seat] ?? "",
      wind,
      dealer: wind === 0,
      score: view?.score ?? 0,
      riichi: view?.riichi ?? false,
      aid: input.aid(seat),
    });
  }
  return tags;
}
