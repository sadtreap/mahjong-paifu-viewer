import { type ReactNode, useMemo } from "react";
import type { Quad, Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { cx } from "../cx";
import { Icon } from "../Icon";
import { formatDelta, formatPoints, roundLabel } from "../labels";
import { useSettings } from "../settings/useSettings";
import { keyCommand } from "../viewer/commands";
import { shortcutKey } from "../viewer/shortcuts";
import type { RoundListProps, RoundSummary } from "../viewer/types";
import popoverStyles from "./Popover.module.css";
import styles from "./RoundList.module.css";
import { usePopover, viewport } from "./usePopover";

/** Stand-ins for names in a message, from Unicode's private use area. */
const SLOT = /([\uE000-\uE0FF])/;

/** A name of at most this many columns is never cut short (a CJK character takes two). */
const SHORT_NAME_COLUMNS = 8;

function isShortName(name: string): boolean {
  let columns = 0;
  for (const char of name) {
    columns += (char.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1;
  }
  return columns <= SHORT_NAME_COLUMNS;
}

/**
 * A message with names in it, each name in an element of its own (so a long name can be cut short
 * without losing the words around it, and a short one beside it stays whole).
 */
function withNames(message: (...names: string[]) => string, names: readonly string[]): ReactNode[] {
  const slots = names.map((_, index) => String.fromCharCode(0xe000 + index));
  return message(...slots)
    .split(SLOT)
    .filter((piece) => piece !== "")
    .map((piece, index) => {
      const name = names[slots.indexOf(piece)];
      return (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one message never reorder
          key={index}
          className={name === undefined ? styles.words : styles.who}
          data-short={name !== undefined && isShortName(name) ? "" : undefined}
        >
          {name ?? piece}
        </span>
      );
    });
}

/**
 * Where the list goes, by the transport's shape: above the round button and centred on it (the
 * bar on the felt), above the block of controls and centred on it, or left of the side column
 * from the bottom of the screen up. It gets the room there is and scrolls inside.
 */
function placeList(panel: HTMLElement, opener: HTMLElement): void {
  const host = opener.closest<HTMLElement>("[data-arrangement]") ?? opener;
  const box = host.getBoundingClientRect();
  const { width, height } = viewport();
  const { style } = panel;
  if (host.dataset.arrangement === "short") {
    style.left = "";
    style.right = `${Math.max(8, width - box.left + 8)}px`;
    style.bottom = "8px";
    style.maxWidth = `${Math.max(0, box.left - 16)}px`;
    style.maxHeight = `${height - 16}px`;
    return;
  }
  const stack = host.dataset.arrangement === "stack";
  const anchor = stack ? box : opener.getBoundingClientRect();
  // Under the table the list clears the whole block of controls, the padding around them included.
  const top = stack ? (host.parentElement ?? host).getBoundingClientRect().top : box.top;
  style.right = "";
  style.maxWidth = "";
  const left = anchor.left + anchor.width / 2 - panel.offsetWidth / 2;
  style.left = `${Math.max(8, Math.min(left, width - panel.offsetWidth - 8))}px`;
  style.bottom = `${height - top + 8}px`;
  style.maxHeight = `${Math.max(120, top - 16)}px`;
}

/** A round's name and its honba count ("East 2", "1 honba"), as the round button shows them. */
function nameParts(m: Messages, round: RoundSummary): readonly [string, string | null] {
  return [
    roundLabel(m, { ...round, honba: 0 }),
    round.honba > 0 ? m.info.honba(round.honba) : null,
  ];
}

interface ButtonLabelProps {
  parts: readonly [string, string | null];
  className: string | undefined;
  /** Only there to give the button its width. */
  unseen?: boolean;
}

/**
 * The round button's face: the round's name, its honba count where there is one, and the caret
 * that says the button opens a list.
 */
function ButtonLabel({ parts, className, unseen = false }: ButtonLabelProps) {
  const [name, honba] = parts;
  return (
    <span className={className} aria-hidden={unseen || undefined}>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        {honba !== null && <span className={styles.honba}>{honba}</span>}
      </span>
      <Icon name="caret" className={styles.caret} />
    </span>
  );
}

interface RowProps {
  round: RoundSummary;
  current: boolean;
  names: Quad<string>;
  /** The viewed player, whose point change in the round the row shows. */
  pov: Seat;
  onChoose(): void;
}

/** One round: its name, how it ended ("B ron off C · 18,000") and the viewed player's change. */
function Row({ round, current, names, pov, onChoose }: RowProps) {
  const { m, locale } = useI18n();
  const { outcome } = round;
  const delta = round.deltas[pov];
  return (
    <button
      type="button"
      data-variant="ghost"
      className={cx(popoverStyles.item, styles.row)}
      aria-current={current ? "true" : undefined}
      onClick={onChoose}
    >
      <span className={styles.round}>{roundLabel(m, round)}</span>
      <span className={styles.outcome}>
        {outcome?.kind === "draw" && m.rounds.draw}
        {outcome?.kind === "win" &&
          outcome.wins.map((win) => (
            <span key={win.seat} className={styles.win}>
              {win.from === win.seat
                ? withNames(m.rounds.tsumo, [names[win.seat]])
                : withNames(m.rounds.ron, [names[win.seat], names[win.from]])}
              {win.points !== undefined && (
                <span className={styles.words}> · {formatPoints(locale, win.points)}</span>
              )}
            </span>
          ))}
      </span>
      {delta !== 0 && (
        <span className={styles.delta} data-sign={delta > 0 ? "gain" : "loss"}>
          <span className="sr-only">{names[pov]} </span>
          {formatDelta(locale, delta)}
        </span>
      )}
    </button>
  );
}

/**
 * The round button ("East 2 · 1 honba") and the round list it opens: one row per round that jumps
 * to that round's start, and a last row that jumps to the game's last step. The round on the
 * table is marked, and takes the focus when the list opens. The round-list key closes the open
 * list, as Esc does.
 *
 * Where the button is as wide as its text (the bar on the felt) it holds every round's text of the
 * game, unseen, so it keeps one width for the whole game and nothing beside it moves.
 */
export function RoundList({
  rounds,
  current,
  names,
  pov,
  onRound,
  onFinal,
  open,
  onOpenChange,
  bare = false,
}: RoundListProps & {
  /** The button has no outline of its own (it sits in a bar that has one). */
  bare?: boolean;
}) {
  const { m } = useI18n();
  const { settings } = useSettings();
  const popover = usePopover({
    open,
    onOpenChange,
    place: placeList,
    isCloseKey: (event) => keyCommand(event, { charKeys: settings.charKeys })?.type === "roundList",
  });
  const now = rounds[current];
  const parts: readonly [string, string | null] = now ? nameParts(m, now) : ["", null];
  const [name, honba] = parts;
  const key = shortcutKey({ type: "roundList" });
  // Each text once, keyed by the text.
  const sizes = useMemo(() => {
    const all = new Map<string, readonly [string, string | null]>();
    for (const round of rounds) {
      const each = nameParts(m, round);
      all.set(each.join("\n"), each);
    }
    return [...all];
  }, [rounds, m]);

  return (
    <>
      <button
        ref={popover.openerRef}
        type="button"
        data-variant={bare ? "ghost" : undefined}
        className={styles.button}
        aria-label={m.transport.roundList(honba === null ? name : `${name} · ${honba}`)}
        title={key ? m.tools.withKey(m.rounds.label, key) : m.rounds.label}
        {...popover.openerProps}
      >
        <span className={styles.label}>
          <ButtonLabel parts={parts} className={styles.current} />
          {sizes.map(([id, parts]) => (
            <ButtonLabel key={id} parts={parts} className={styles.sizer} unseen />
          ))}
        </span>
      </button>
      {open &&
        popover.portal(
          // biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a form fieldset.
          <div
            ref={popover.panelRef}
            role="group"
            aria-label={m.rounds.label}
            className={cx(popoverStyles.panel, styles.list)}
            {...popover.panelProps}
          >
            {/* Whose changes the numbers are; each row says so to screen readers itself. */}
            <p className={styles.head} aria-hidden="true">
              {m.rounds.changeFor(names[pov])}
            </p>
            {rounds.map((round) => (
              <Row
                key={round.index}
                round={round}
                current={round.index === current}
                names={names}
                pov={pov}
                onChoose={() => popover.choose(() => onRound(round.index))}
              />
            ))}
            <button
              type="button"
              data-variant="ghost"
              className={cx(popoverStyles.item, styles.final)}
              onClick={() => popover.choose(onFinal)}
            >
              {m.rounds.final}
            </button>
          </div>,
        )}
    </>
  );
}
