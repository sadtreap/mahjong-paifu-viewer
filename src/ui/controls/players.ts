import type { PlayerCount, Quad, Round, Seat } from "../../core/model";
import { activeSeats, seatWind } from "../../core/players";
import type { BoardState } from "../../replay/types";
import type { PlayerRow, SeatAid } from "../viewer/types";

/**
 * The rows of the player list at a step: one per playing seat in seat order, with its wind in the
 * round, its current score and its aid (`aid`, asked for each playing seat; none by default).
 * `state` null (a round that failed to replay) uses the round's start scores.
 */
export function playerRows(
  playerCount: PlayerCount,
  round: Pick<Round, "dealer" | "scores">,
  state: Pick<BoardState, "seats"> | null,
  names: Quad<string>,
  aid: (seat: Seat) => SeatAid | null = () => null,
): PlayerRow[] {
  const scores = state ? (state.seats.map((seat) => seat.score) as Quad<number>) : round.scores;
  return activeSeats(playerCount).map((seat) => ({
    seat,
    name: names[seat],
    wind: seatWind(seat, round.dealer, playerCount),
    score: scores[seat],
    aid: aid(seat),
  }));
}
