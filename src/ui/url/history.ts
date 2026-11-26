import type { Seat } from "../../core/model";
import type { Position } from "../navigation";
import type { MoveKind } from "../viewer/types";

/**
 * What the viewer keeps in `history.state`. `sid` and `n` say which entry of which page session
 * it is (see useHistorySync); entries written before a reload keep them, but they no longer match.
 */
export interface HistoryState {
  v: 1;
  round: number;
  step: number;
  pov: Seat;
  /** The session (one per loaded game and page load) that wrote the entry. */
  sid?: string;
  /** The entry's index in that session's own stack of entries. */
  n?: number;
}

/** Jumps closer together than this replace the entry of the previous jump (a burst is one entry). */
export const JUMP_MERGE_MS = 1000;

/** Single steps and the like write the address at most this often (Safari throttles it). */
export const REPLACE_DEBOUNCE_MS = 250;

export function toHistoryState(
  p: Position,
  pov: Seat,
  entry?: { sid: string; n: number },
): HistoryState {
  const state: HistoryState = { v: 1, round: p.round, step: p.step, pov };
  if (entry) {
    state.sid = entry.sid;
    state.n = entry.n;
  }
  return state;
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** The viewer's state from `history.state`, or null for anything else (another app's state, null). */
export function parseHistoryState(raw: unknown): HistoryState | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { v, round, step, pov, sid, n } = raw as Record<string, unknown>;
  if (
    v !== 1 ||
    !isIndex(round) ||
    !isIndex(step) ||
    !(pov === 0 || pov === 1 || pov === 2 || pov === 3)
  ) {
    return null;
  }
  const state = toHistoryState({ round, step }, pov);
  if (typeof sid === "string" && isIndex(n)) {
    state.sid = sid;
    state.n = n;
  }
  return state;
}

/**
 * How a move is written to the browser history. A jump (round list, matrix cell, timeline click,
 * Moves row, pin, Alt+click, key-moment and round buttons, ↑/↓, Home/End) and a change of the
 * point of view push a new entry, so Back returns to where the user was; a second one within
 * JUMP_MERGE_MS replaces it instead. Single steps, holds, wheel turns, scrubs and autoplay only
 * update the current entry. A move made by the history itself (Back, Forward) and the initial
 * position write nothing.
 */
export function historyMode(kind: MoveKind, msSinceLastPush: number): "push" | "replace" | "none" {
  switch (kind) {
    case "jump":
    case "pov":
      return msSinceLastPush < JUMP_MERGE_MS ? "replace" : "push";
    case "step":
    case "repeat":
    case "scrub":
    case "autoplay":
      return "replace";
    case "history":
    case "init":
      return "none";
  }
}
