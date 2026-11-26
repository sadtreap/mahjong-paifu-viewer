/**
 * Per-step review aids derived from the replay: the plate aid rows (waits, tenpai, furiten,
 * shanten), the next-discard marker, the riichi lines and draw waits of the result card.
 */
import type { PlayerCount, Quad, Round, RyukyokuEvent, Seat, WinEvent } from "../../core/model";
import { activeSeats } from "../../core/players";
import { type KnownTile, tileFromKind } from "../../core/tile";
import type { BoardState, SeatView } from "../../replay/types";
import { turnNumber } from "../viewer/stepIndex";
import type { NextDiscard, PlateAid, RiichiLine } from "../viewer/types";
import {
  concealedTiles,
  isDiscardFuriten,
  kindCounts,
  liveShanten,
  unseenCounts,
  waits,
} from "./hand";

export interface PlateAidOptions {
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
): PlateAid {
  const unseen = unseenCounts(board, seat, playerCount);
  return {
    kind: "waits",
    tiles: kinds.map((kind) => tileFromKind(kind)),
    left: kinds.reduce((sum, kind) => sum + (unseen[kind] ?? 0), 0),
    furiten: isDiscardFuriten(kinds, board.seats[seat].discards),
  };
}

/**
 * The aid row of a seat's plate, or null for none. Only the POV and seats whose hand is revealed
 * get one, so hiding hands switches between the omniscient view and the player's view.
 * - The POV choosing a discard: its shanten (-1 complete, 0 tenpai), counting live waits only.
 * - Otherwise a tenpai hand: its waits, the tiles left from that seat's own view, and furiten.
 * - The POV when not tenpai: its shanten. Other seats when not tenpai: none.
 * An opponent holding its drawn tile keeps the waits of the hand it drew to; just after a call it
 * shows "Tenpai" when the call made it tenpai. Hands with an unknown tile get none.
 */
export function plateAid(board: BoardState, seat: Seat, o: PlateAidOptions): PlateAid | null {
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
 * The tile the POV discards next, while it chooses: at a step where it holds 3n+2 concealed tiles
 * and the next step is its discard. `drawn` marks a tsumogiri (the drawn tile goes).
 */
export function nextDiscard(
  states: readonly BoardState[],
  step: number,
  pov: Seat,
): NextDiscard | null {
  const current = states[step];
  const event = states[step + 1]?.lastEvent;
  if (!current || event?.type !== "discard" || event.seat !== pov) {
    return null;
  }
  const view = current.seats[pov];
  if (concealedTiles(view).length % 3 !== 2) {
    return null;
  }
  return { tile: event.tile, drawn: event.tsumogiri && view.drawn !== null };
}

/**
 * One line per riichi declared in the round, in order: the declaring seat, the turn, the waits of
 * the hand it declared with, and for a seat that won the round the tiles left at the declaration
 * from its own view (null for the others).
 */
export function riichiLines(
  _round: Round,
  states: readonly BoardState[],
  playerCount: PlayerCount,
): RiichiLine[] {
  const results = states[states.length - 1]?.results ?? [];
  const winners = new Set(
    results.filter((result): result is WinEvent => result.type === "win").map((win) => win.seat),
  );
  const lines: RiichiLine[] = [];
  const declared = new Set<Seat>();
  for (let step = 1; step < states.length; step++) {
    const state = states[step] as BoardState;
    const event = state.lastEvent;
    if (event?.type !== "discard" || !event.riichi || declared.has(event.seat)) {
      continue;
    }
    declared.add(event.seat);
    const view = state.seats[event.seat];
    const kinds = waits(view.hand, view.melds.length, playerCount);
    const winner = winners.has(event.seat);
    const unseen = unseenCounts(state, event.seat, playerCount);
    lines.push({
      seat: event.seat,
      turn: turnNumber(states, step, playerCount),
      waits: kinds.map((kind) => tileFromKind(kind)),
      left: winner ? kinds.reduce((sum, kind) => sum + (unseen[kind] ?? 0), 0) : null,
      winner,
    });
  }
  return lines;
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
