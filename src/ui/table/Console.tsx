import { memo } from "react";
import type { Seat, Wind } from "../../core/model";
import type { KnownTile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import type { Locale } from "../../i18n/locales";
import { cx } from "../cx";
import { formatDelta, formatPoints, tileLabel } from "../labels";
import { keyed } from "../layout";
import { TileImage } from "../TileImage";
import { shortcutKey } from "../viewer/shortcuts";
import type { SeatInfo, Side } from "../viewer/types";
import styles from "./Console.module.css";

/** One player's cell on an edge of the console. */
export interface ConsoleCell {
  side: Side;
  wind: Wind;
  dealer: boolean;
  /** The score, or its difference from the viewed player's. */
  text: string;
  /** It is this player's turn. */
  active: boolean;
}

/**
 * The console's cells for the playing seats. With `diff`, every score but the viewed player's is
 * shown as its difference from that one ("+8,000", "−12,000", "±0").
 */
export function consoleCells(
  seats: readonly SeatInfo[],
  pov: Seat,
  active: Seat | null,
  diff: boolean,
  locale: Locale,
): ConsoleCell[] {
  const own = seats.find((info) => info.seat === pov)?.score ?? 0;
  return seats.map((info) => ({
    side: info.side,
    wind: info.wind,
    dealer: info.dealer,
    text:
      diff && info.seat !== pov
        ? formatDelta(locale, info.score - own)
        : formatPoints(locale, info.score),
    active: info.seat === active,
  }));
}

export interface ConsoleProps {
  /** Round name with its honba count, e.g. "East 3, 1 honba". */
  roundName: string;
  /** Round name alone, e.g. "East 3": what a small console has room for. */
  roundShort: string;
  /** The revealed dora indicators. */
  doraIndicators: readonly KnownTile[];
  wallRemaining: number;
  /** Riichi deposits on the table. */
  deposits: number;
  cells: readonly ConsoleCell[];
  /** The cells show score differences. */
  diff: boolean;
  onToggleDiff(): void;
}

/**
 * The console in the middle of the table: the round name, the dora indicators, the tiles left in
 * the live wall and the riichi deposits (on a small table, in fewer words), and on each edge the seat wind (the dealer's is filled)
 * and the score of the player sitting there, with a bar on the edge of the player whose turn it
 * is. The side players' cells read from their seats; the far player's reads upright.
 *
 * The whole console is one button, the only thing to press on the table: it switches the other
 * players' scores to their differences from the viewed player and back. Like every button on the
 * stage, a tap on it presses it and never steps, while a swipe that starts on it and the wheel over
 * it step as anywhere on the table.
 * What it shows is a picture to assistive technology: the dora indicators and the tiles left are
 * repeated as hidden text beside the button, and each seat's wind and score are in the player
 * list.
 */
export const Console = memo(function Console({
  roundName,
  roundShort,
  doraIndicators,
  wallRemaining,
  deposits,
  cells,
  diff,
  onToggleDiff,
}: ConsoleProps) {
  const { m } = useI18n();
  const key = shortcutKey({ type: "toggleScoreDiff" });
  const doraNames = doraIndicators.map((tile) => tileLabel(m, tile)).join(", ");
  return (
    <div className={styles.console}>
      <button
        type="button"
        className={styles.press}
        aria-label={m.table.scoreDiff}
        title={key ? m.tools.withKey(m.table.scoreDiff, key) : m.table.scoreDiff}
        aria-pressed={diff}
        onClick={onToggleDiff}
      >
        <span className={styles.screen}>
          <span className={cx(styles.round, styles.full)}>{roundName}</span>
          <span className={cx(styles.round, styles.short)}>{roundShort}</span>
          {doraIndicators.length > 0 && (
            <span className={styles.dora}>
              <span className={styles.doraLabel}>{m.board.dora}</span>
              <span className={styles.doraTiles}>
                {keyed(doraIndicators).map(({ key: tileKey, item }) => (
                  <TileImage key={tileKey} tile={item} label="" />
                ))}
              </span>
            </span>
          )}
          <span className={cx(styles.left, styles.full)}>{m.board.wall(wallRemaining)}</span>
          <span className={cx(styles.left, styles.short)}>{m.board.wallShort(wallRemaining)}</span>
          {deposits > 0 && <span className={styles.left}>{m.info.deposits(deposits)}</span>}
        </span>
        {cells.map((cell) => (
          <span key={cell.side} className={styles.edge} data-edge={cell.side} aria-hidden="true">
            <span className={styles.cell}>
              <span className={cx(styles.wind, cell.dealer && styles.dealer)}>
                {m.board.windsShort[cell.wind]}
              </span>
              <span className={styles.score}>{cell.text}</span>
            </span>
            {cell.active && <span className={styles.turn} />}
          </span>
        ))}
      </button>
      <span className="sr-only">
        {doraNames !== "" && `${m.board.dora}: ${doraNames}. `}
        {m.board.wall(wallRemaining)}
      </span>
    </div>
  );
});
