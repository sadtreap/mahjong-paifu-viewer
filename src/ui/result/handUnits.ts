import type { WinEvent } from "../../core/model";
import type { Tile } from "../../core/tile";
import type { MeldView } from "../../replay/types";
import { splitWinningHand } from "../layout";

/**
 * Spacing of the winning hand in tile widths (matches WinHand.module.css): the gap before the
 * winning tile, and the margin after it when calls follow.
 */
const WINNING_GAP = 0.35;
const CALLS_MARGIN = 0.45;

/**
 * How wide the part of a winning hand that never wraps is, in tile widths, drawn as the result
 * block draws it: the concealed tiles and the winning tile set apart (the kita and the calls go
 * after them, and under them where the block is narrow). Null when the log has no hand (the block
 * then shows only the winning tile).
 */
export function handLineUnits(
  win: WinEvent,
  melds: readonly MeldView[],
  kita: readonly Tile[],
): number | null {
  if (!win.hand) {
    return null;
  }
  const { rest, winning } = splitWinningHand(win.hand, win.tile);
  const calls = melds.length + (kita.length > 0 ? 1 : 0);
  return rest.length + (winning === null ? 0 : WINNING_GAP + 1) + (calls > 0 ? CALLS_MARGIN : 0);
}
