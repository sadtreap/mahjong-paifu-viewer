import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { Icon } from "../Icon";
import { formatDelta, formatPoints } from "../labels";
import { shortcutKeys } from "../viewer/shortcuts";
import type { PovMenuProps } from "../viewer/types";
import popoverStyles from "./Popover.module.css";
import styles from "./PovMenu.module.css";
import { placeBelow, usePopover } from "./usePopover";

/** The tooltip's keys: the seat keys of the players in the game, then the ones that cycle. */
function povKeys(players: number): string {
  const seats = shortcutKeys("seat").slice(0, players);
  return [[seats[0], seats.at(-1)].join("–"), ...shortcutKeys("cycleSeat")].join(", ");
}

/**
 * The point-of-view control: a button showing the viewed player's seat wind, name and a caret,
 * and the menu it opens. The menu doubles as the scoreboard: one row per playing seat with its
 * wind (the dealer's marked, as on the table), name, score and the difference from the viewed
 * player; choosing a row views the table from that seat.
 */
export function PovMenu({ players, pov, onPov, open, onOpenChange }: PovMenuProps) {
  const { m, locale } = useI18n();
  const popover = usePopover({ open, onOpenChange, place: placeBelow });
  const current = players.find((player) => player.seat === pov) ?? players[0];
  if (!current) {
    return null;
  }
  const windName = (wind: number) => m.round.winds[wind] ?? "";

  return (
    <>
      <button
        ref={popover.openerRef}
        type="button"
        data-variant="ghost"
        className={styles.button}
        aria-label={m.tools.povButton(windName(current.wind), current.name)}
        title={m.tools.withKey(m.tools.pov, povKeys(players.length))}
        aria-haspopup="menu"
        {...popover.openerProps}
      >
        <span
          className={styles.wind}
          data-dealer={current.wind === 0 || undefined}
          aria-hidden="true"
        >
          {m.board.windsShort[current.wind]}
        </span>
        <span className={styles.name} data-label="name">
          {current.name}
        </span>
        <span className={styles.caret}>
          <Icon name="caret" />
        </span>
      </button>
      {open &&
        popover.portal(
          <div
            ref={popover.panelRef}
            role="menu"
            aria-label={m.tools.pov}
            className={cx(popoverStyles.panel, styles.menu)}
            {...popover.panelProps}
          >
            {/* What choosing a row does; the menu is named so for screen readers already. */}
            <p className={styles.head} aria-hidden="true">
              {m.tools.pov}
            </p>
            {players.map((player) => {
              const score = formatPoints(locale, player.score);
              const diff =
                player.seat === current.seat
                  ? null
                  : formatDelta(locale, player.score - current.score);
              return (
                <button
                  key={player.seat}
                  type="button"
                  role="menuitemradio"
                  aria-checked={player.seat === current.seat}
                  aria-label={m.tools.povItem(windName(player.wind), player.name, score, diff)}
                  tabIndex={-1}
                  data-variant="ghost"
                  className={cx(popoverStyles.item, styles.row)}
                  onClick={() => popover.choose(() => onPov(player.seat))}
                >
                  <span
                    className={styles.wind}
                    data-dealer={player.wind === 0 || undefined}
                    aria-hidden="true"
                  >
                    {m.board.windsShort[player.wind]}
                  </span>
                  <span className={styles.player}>{player.name}</span>
                  <span className={styles.score}>{score}</span>
                  <span className={styles.diff}>{diff}</span>
                </button>
              );
            })}
          </div>,
        )}
    </>
  );
}
