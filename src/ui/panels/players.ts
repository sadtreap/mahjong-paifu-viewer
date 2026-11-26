import type { GameLog, Quad, Round } from "../../core/model";
import { activeSeats, seatWind } from "../../core/players";
import type { Messages } from "../../i18n/messages";
import type { BoardState } from "../../replay/types";
import { rankLabel, standings } from "../labels";
import type { PlayerRow } from "../viewer/types";

/**
 * The Players rows (review rail, toolbar seat menu) at a step: one per playing seat in seat order,
 * with its wind in the round, riichi, current score and place. `state` null (a round that failed
 * to replay) uses the round's start scores.
 */
export function playerRows(
  m: Messages,
  game: Pick<GameLog, "players" | "playerCount">,
  round: Pick<Round, "dealer" | "scores">,
  state: Pick<BoardState, "seats"> | null,
  names: Quad<string>,
): PlayerRow[] {
  const scores = state ? (state.seats.map((seat) => seat.score) as Quad<number>) : round.scores;
  const places = new Map(standings(scores, game.playerCount).map((s) => [s.seat, s.place]));
  return activeSeats(game.playerCount).map((seat) => {
    const player = game.players[seat];
    const wind = seatWind(seat, round.dealer, game.playerCount);
    return {
      seat,
      name: names[seat],
      rank: rankLabel(m, player) ?? null,
      rating: player.rating === undefined ? null : m.viewer.rating(Math.round(player.rating)),
      wind,
      dealer: wind === 0,
      riichi: state?.seats[seat].riichi ?? false,
      score: scores[seat],
      place: places.get(seat) ?? 0,
    };
  });
}
