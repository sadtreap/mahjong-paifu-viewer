import { memo } from "react";
import type { Seat, Wind } from "../../core/model";
import { useI18n } from "../../i18n/context";
import type { Locale } from "../../i18n/locales";
import { cx } from "../cx";
import { formatDelta } from "../labels";
import { shortcutKey } from "../viewer/shortcuts";
import type { SeatTagInfo, Side } from "../viewer/types";
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

/** A score in plain digits ("25000"), with a real minus sign below zero. */
export function scoreText(score: number): string {
  return score < 0 ? `−${-score}` : String(score);
}

/**
 * The console's cells for the playing seats. With `diff`, every score but the viewed player's is
 * shown as its difference from that one, in plain digits ("+8000", "−12000", "±0").
 */
export function consoleCells(
  seats: readonly SeatTagInfo[],
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
        ? formatDelta(locale, info.score - own, false)
        : scoreText(info.score),
    active: info.seat === active,
  }));
}

export interface ConsoleProps {
  /** Round name without honba, e.g. "East 3". */
  roundName: string;
  wallRemaining: number;
  cells: readonly ConsoleCell[];
  /** The cells show score differences. */
  diff: boolean;
  onToggleDiff(): void;
  /** Something lies over the table (the result card): the button leaves the Tab order. */
  covered: boolean;
}

/**
 * The console in the middle of the table: the round name and the tiles left in the live wall, and
 * on each edge the seat wind (the dealer's is highlighted) and the score of the player sitting
 * there, with a bar on the edge of the player whose turn it is. The side players' cells read from
 * their seats; the far player's reads upright.
 *
 * The whole console is one button, the only thing to press on the felt: it switches the other
 * players' scores to their differences from the viewed player and back. Like every button on the
 * stage, a tap on it presses it and never steps, while a swipe that starts on it and the wheel over
 * it step as anywhere on the table.
 * What it shows is a picture to assistive technology: the tiles left are repeated as hidden text
 * beside the button, and each seat's wind and score are in its seat tag.
 */
export const Console = memo(function Console({
  roundName,
  wallRemaining,
  cells,
  diff,
  onToggleDiff,
  covered,
}: ConsoleProps) {
  const { m } = useI18n();
  const key = shortcutKey({ type: "toggleScoreDiff" });
  return (
    <div className={styles.console}>
      <button
        type="button"
        className={styles.press}
        aria-label={m.table.scoreDiff}
        title={key ? m.tools.withKey(m.table.scoreDiff, key) : m.table.scoreDiff}
        aria-pressed={diff}
        tabIndex={covered ? -1 : undefined}
        onClick={onToggleDiff}
      >
        <span className={styles.screen}>
          <span className={styles.round}>{roundName}</span>
          <span className={styles.left}>{m.board.wallShort(wallRemaining)}</span>
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
      <span className="sr-only">{m.board.wall(wallRemaining)}</span>
    </div>
  );
});
