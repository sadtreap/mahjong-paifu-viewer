import type { Quad, RoundEvent, RyukyokuEvent, Seat, WinEvent } from "../core/model";
import type { KnownTile, Tile } from "../core/tile";

export interface DiscardView {
  tile: Tile;
  tsumogiri: boolean;
  /** Riichi declaration tile, drawn sideways. */
  riichi: boolean;
  /** Taken by another player's chi, pon or kan. */
  called: boolean;
}

export interface MeldView {
  type: "chi" | "pon" | "daiminkan" | "ankan" | "kakan";
  /** Tiles that came from the owner's hand, sorted (4 for ankan, 2 for chi/pon/kakan, 3 for daiminkan). */
  tiles: Tile[];
  /** Seat the called tile came from; absent for ankan. */
  from?: Seat;
  /** The tile taken from another player's discard; absent for ankan. */
  calledTile?: Tile;
  /** For kakan: the tile added to the pon. */
  addedTile?: Tile;
}

export interface SeatView {
  /** Concealed tiles, sorted, excluding `drawn`. */
  hand: Tile[];
  /** The tile just drawn, shown apart from the hand until the player discards. */
  drawn: Tile | null;
  melds: MeldView[];
  /**
   * Three-player: North tiles set aside as kita (nukidora), in the order they were set aside. Not
   * part of `hand` or `melds`, and not counted in the hand size.
   */
  kita: Tile[];
  discards: DiscardView[];
  /** Current points, after riichi deposits and (once the round ends) the result deltas. */
  score: number;
  /**
   * The seat's riichi is accepted and its 1000-point deposit was paid (the riichi stick is drawn).
   * Set by the seat's riichiAccepted event, which folds into the riichi discard step, and kept until
   * the round ends, including the result step after a win collects the deposits. Never set for a
   * declaration without riichiAccepted, which pays no deposit: a riichi discard that is ronned (or
   * that three players ron, aborting the round). The declaration tile itself is DiscardView.riichi.
   */
  riichi: boolean;
}

/**
 * Snapshot of the table after a replay step. A step can apply several events (see buildTimeline:
 * dora and riichiAccepted fold into the step before them, a multiple ron is one step). A kita is a
 * step of its own. In a three-player game seat 3 is the empty chair and its SeatView stays empty.
 */
export interface BoardState {
  seats: Quad<SeatView>;
  doraIndicators: KnownTile[];
  /** Riichi deposits on the table. */
  riichiSticks: number;
  honba: number;
  /**
   * Tiles left in the live wall: 70 after the deal (55 with three players), one fewer for every
   * draw, replacement draws after a kan or kita included.
   */
  wallRemaining: number;
  /** Index in round.events of the last event the step applied (-1 for the initial deal). */
  eventIndex: number;
  /**
   * The step's main (first) event, e.g. the riichi discard or the first ron of a folded step; null
   * for the initial deal. Not necessarily round.events[eventIndex].
   */
  lastEvent: RoundEvent | null;
  /** Seat of the step's main event (null for the deal and for seatless events such as ryukyoku). */
  activeSeat: Seat | null;
  /** Round results, filled in once the round has ended. */
  results: Array<WinEvent | RyukyokuEvent>;
}

/** Inconsistency found while replaying a round strictly (used by tests and diagnostics). */
export interface ReplayIssue {
  roundIndex?: number;
  /** Index into round.events, or -1 for the starting state. */
  eventIndex: number;
  message: string;
}
