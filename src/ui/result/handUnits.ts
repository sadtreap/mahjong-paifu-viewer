import type { WinEvent } from "../../core/model";
import type { Tile } from "../../core/tile";
import type { MeldView } from "../../replay/types";
import { meldSlots, splitWinningHand } from "../layout";

/**
 * Spacing of the winning hand in tile widths (matches WinHand.module.css): the gap before the
 * winning tile, the margin after it when calls follow, and the gap before each call (the kita
 * and each meld).
 */
const WINNING_GAP = 0.35;
const CALLS_MARGIN = 0.45;
const CALL_GAP = 0.3;

/** Width of a sideways tile (and of a kakan's stack), in upright tile widths. */
const SIDEWAYS_WIDTH = 4 / 3;

/** How wide a winning hand is on one line, in tile widths. */
export interface HandUnits {
  /** The concealed tiles and the winning tile set apart: the part that never wraps. */
  line: number;
  /** The whole hand: that part, then the calls. */
  all: number;
}

/**
 * The widths of the hand a win was made with, drawn as the result card draws it; null when the log
 * has no hand (the card then shows only the winning tile).
 */
export function handUnits(
  win: WinEvent,
  melds: readonly MeldView[],
  kita: readonly Tile[],
): HandUnits | null {
  if (!win.hand) {
    return null;
  }
  const { rest, winning } = splitWinningHand(win.hand, win.tile);
  const calls = melds.map((meld) =>
    meldSlots(meld, win.seat).reduce((sum, slot) => sum + (slot.sideways ? SIDEWAYS_WIDTH : 1), 0),
  );
  if (kita.length > 0) {
    calls.unshift(kita.length);
  }
  const line =
    rest.length + (winning === null ? 0 : WINNING_GAP + 1) + (calls.length > 0 ? CALLS_MARGIN : 0);
  return { line, all: calls.reduce((sum, call) => sum + CALL_GAP + call, line) };
}
