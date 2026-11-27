/**
 * Per-step review aids derived from the replay: the seat aids (waits, tenpai, furiten, shanten)
 * and the draw waits of the result card.
 */
import type { PlayerCount, Quad, RyukyokuEvent, Seat, WinEvent } from "../../core/model";
import { activeSeats } from "../../core/players";
import { type KnownTile, tileFromKind } from "../../core/tile";
import type { BoardState, SeatView } from "../../replay/types";
import type { SeatAid } from "../viewer/types";
import {
  concealedTiles,
  isDiscardFuriten,
  kindCounts,
  liveShanten,
  unseenCounts,
  waits,
} from "./hand";

export interface SeatAidOptions {
  pov: Seat;
  /** The seat's concealed tiles are drawn face up for this viewer. */
  revealed: boolean;
  playerCount: PlayerCount;
  /**
   * Optional hint that the POV is choosing a discard. The tile count decides: a hand of 3n+2
   * concealed tiles (a drawn tile, or just after a call) is always a decision.
   */
  decision?: boolean;
}

function waitsAid(
  board: BoardState,
  seat: Seat,
  kinds: readonly number[],
  playerCount: PlayerCount,
): SeatAid {
  const unseen = unseenCounts(board, seat, playerCount);
  return {
    kind: "waits",
    tiles: kinds.map((kind) => tileFromKind(kind)),
    left: kinds.reduce((sum, kind) => sum + (unseen[kind] ?? 0), 0),
    furiten: isDiscardFuriten(kinds, board.seats[seat].discards),
  };
}

/**
 * The aid shown next to a seat's name, or null for none. Only the POV and seats whose hand is
 * revealed get one, so hiding hands switches between the omniscient view and the player's view.
 * - The POV choosing a discard: its shanten (-1 complete, 0 tenpai), counting live waits only.
 * - Otherwise a tenpai hand: its waits, the tiles left from that seat's own view, and furiten.
 * - The POV when not tenpai: its shanten. Other seats when not tenpai: none.
 * An opponent holding its drawn tile keeps the waits of the hand it drew to; just after a call it
 * shows "Tenpai" when the call made it tenpai. Hands with an unknown tile get none.
 */
export function seatAid(board: BoardState, seat: Seat, o: SeatAidOptions): SeatAid | null {
  const isPov = seat === o.pov;
  if (!isPov && !o.revealed) {
    return null;
  }
  const view = board.seats[seat];
  const tiles = concealedTiles(view);
  if (tiles.length === 0 || kindCounts(tiles) === null) {
    return null;
  }
  const melds = view.melds.length;
  if (tiles.length % 3 === 2) {
    if (isPov) {
      return { kind: "shanten", value: liveShanten(tiles, melds, o.playerCount) };
    }
    if (view.drawn !== null) {
      const kinds = waits(view.hand, melds, o.playerCount);
      return kinds.length > 0 ? waitsAid(board, seat, kinds, o.playerCount) : null;
    }
    const value = liveShanten(tiles, melds, o.playerCount);
    return value <= 0 ? { kind: "shanten", value } : null;
  }
  const kinds = waits(tiles, melds, o.playerCount);
  if (kinds.length > 0) {
    return waitsAid(board, seat, kinds, o.playerCount);
  }
  return isPov ? { kind: "shanten", value: liveShanten(tiles, melds, o.playerCount) } : null;
}

/**
 * The waits of each seat a draw lists as tenpai, from the hands at the result step (pass the
 * seats with the revealed hands filled in). Seats whose hand is unknown are left out.
 */
export function drawWaits(
  results: ReadonlyArray<WinEvent | RyukyokuEvent>,
  seats: Quad<SeatView>,
  playerCount: PlayerCount,
): Partial<Record<Seat, readonly KnownTile[]>> {
  const out: Partial<Record<Seat, readonly KnownTile[]>> = {};
  for (const result of results) {
    if (result.type !== "ryukyoku") {
      continue;
    }
    for (const seat of result.tenpai ?? []) {
      if (!activeSeats(playerCount).includes(seat)) {
        continue;
      }
      const view = seats[seat];
      const kinds = waits(view.hand, view.melds.length, playerCount);
      if (kinds.length > 0) {
        out[seat] = kinds.map((kind) => tileFromKind(kind));
      }
    }
  }
  return out;
}
