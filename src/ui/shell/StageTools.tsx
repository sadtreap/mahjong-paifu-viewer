import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { isPhoneBreakpoint } from "../breakpoints";
import { cx } from "../cx";
import { Icon, type IconName } from "../Icon";
import type { PlayerRow, StageToolsProps } from "../viewer/types";
import styles from "./StageTools.module.css";

function ToolButton({
  icon,
  label,
  className,
  onClick,
  pressed,
  disabled,
  title = label,
  buttonRef,
  ...aria
}: {
  icon: IconName;
  label: string;
  className?: string;
  onClick(): void;
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-haspopup"?: "menu";
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cx(styles.button, className)}
      aria-label={label}
      title={title}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) {
          onClick();
        }
      }}
      {...aria}
    >
      <Icon name={icon} className={styles.icon} />
    </button>
  );
}

/**
 * The stage toolbar, which replaces the app bar while a game is shown: a vertical stack at the
 * stage's top right on wide and laptop screens, a row in the top strip in portrait and in the side
 * rail on phones in landscape. The buttons depend on the breakpoint (§1.2); the point-of-view seat
 * menu shows at every size, so phones can switch seats without scrolling to the Players list.
 */
export function StageTools({
  breakpoint,
  showAllHands,
  view,
  panelOpen,
  linkable,
  players,
  pov,
  onPov,
  onOpenLog,
  onCopyLink,
  onToggleHands,
  onToggleView,
  onSettings,
  onHelp,
  onTogglePanel,
  panelId,
  menu,
}: StageToolsProps) {
  const { m } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const phone = isPhoneBreakpoint(breakpoint);
  const portrait = breakpoint === "tabletPortrait" || breakpoint === "phonePortrait";
  const hasPanel = !portrait;
  const sep = <span className={styles.sep} aria-hidden="true" />;

  const hands = (
    <ToolButton
      icon="eye"
      label={m.viewer.showAllHands}
      title={m.tools.withKey(m.viewer.showAllHands, "H")}
      className={styles.hands}
      pressed={showAllHands}
      onClick={onToggleHands}
    />
  );
  const view3d = (
    <ToolButton
      icon="cube"
      label={m.tools.view3d}
      title={m.tools.withKey(m.tools.view3d, "C")}
      className={styles.view}
      pressed={view === "3d"}
      onClick={onToggleView}
    />
  );
  const seats = <PovMenu players={players} pov={pov} onPov={onPov} />;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a form fieldset.
    <div
      className={styles.tools}
      role="group"
      aria-label={m.tools.label}
      data-breakpoint={breakpoint}
    >
      {!phone && (
        <>
          <ToolButton icon="open" label={m.app.newLog} onClick={onOpenLog} />
          <ToolButton
            icon="link"
            label={m.app.copyLink}
            title={linkable ? m.app.copyLink : m.app.linkUnavailable}
            disabled={!linkable}
            onClick={onCopyLink}
          />
          {sep}
        </>
      )}
      {seats}
      {hands}
      {view3d}
      {!phone && (
        <>
          {sep}
          <ToolButton icon="settings" label={m.app.settings} onClick={onSettings} />
          <ToolButton
            icon="help"
            label={m.app.help}
            title={m.tools.withKey(m.app.help, "?")}
            onClick={onHelp}
          />
        </>
      )}
      {hasPanel && (
        <ToolButton
          icon="panel"
          label={m.tools.panel}
          aria-expanded={panelOpen}
          aria-controls={panelId}
          onClick={onTogglePanel}
        />
      )}
      {phone && (
        <div className={styles.anchor}>
          <ToolButton
            icon="more"
            label={m.app.more}
            buttonRef={moreRef}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          />
          {menu({ open: moreOpen, onClose: () => setMoreOpen(false), anchorRef: moreRef })}
        </div>
      )}
    </div>
  );
}

/**
 * The point-of-view control: a button showing the current seat's wind that opens a menu of the
 * playing seats (menuitemradio, the current one checked). Arrow keys, Home and End move in the
 * menu; Esc, Tab or a click outside close it; picking a seat returns the focus to the button.
 */
function PovMenu({
  players,
  pov,
  onPov,
}: {
  players: readonly PlayerRow[];
  pov: Seat;
  onPov(seat: Seat): void;
}) {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef(new Map<Seat, HTMLButtonElement>());
  const menuId = useId();
  const current = players.find((player) => player.seat === pov) ?? players[0];
  const keys = players.length === 3 ? "1–3, V" : "1–4, V";

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) {
      buttonRef.current?.focus();
    }
  };

  // Focus the checked seat when the menu opens.
  useEffect(() => {
    if (open) {
      (itemRefs.current.get(pov) ?? itemRefs.current.values().next().value)?.focus();
    }
  }, [open, pov]);

  // A press outside closes the menu (without taking the focus back). Like the ⋯ menu's light
  // dismiss, the press only closes it: it does not also step the table.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node && wrapRef.current?.contains(event.target))) {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleDown, true);
    return () => document.removeEventListener("pointerdown", handleDown, true);
  }, [open]);

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = players
      .map((player) => itemRefs.current.get(player.seat))
      .filter((item): item is HTMLButtonElement => item !== undefined);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = items[(index + 1) % items.length];
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = items[(index - 1 + items.length) % items.length];
        break;
      case "Home":
        next = items[0];
        break;
      case "End":
        next = items[items.length - 1];
        break;
      case "Escape":
        close(true);
        break;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
    // Keep the viewer's own keys (arrows step and change rounds, Esc hides things) out of it.
    event.preventDefault();
    event.stopPropagation();
    next?.focus();
  };

  if (!current) {
    return null;
  }
  return (
    <div ref={wrapRef} className={styles.anchor}>
      <button
        ref={buttonRef}
        type="button"
        className={cx(styles.button, styles.pov)}
        aria-label={m.tools.povButton(current.name)}
        title={m.tools.withKey(m.tools.pov, keys)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="pov" className={styles.icon} />
        <span className={cx(styles.badge, current.dealer && styles.dealer)} aria-hidden="true">
          {m.board.windsShort[current.wind]}
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          className={styles.menu}
          role="menu"
          aria-label={m.tools.povMenu}
          tabIndex={-1}
          onKeyDown={onMenuKey}
        >
          {players.map((player) => (
            <button
              key={player.seat}
              ref={(node) => {
                if (node) {
                  itemRefs.current.set(player.seat, node);
                } else {
                  itemRefs.current.delete(player.seat);
                }
              }}
              type="button"
              role="menuitemradio"
              aria-checked={player.seat === pov}
              aria-label={m.tools.povItem(
                player.name,
                m.round.winds[player.wind] ?? "",
                player.dealer,
              )}
              tabIndex={player.seat === pov ? 0 : -1}
              className={styles.item}
              style={{ "--seat": `var(--seat-${player.seat})` } as CSSProperties}
              onClick={() => {
                onPov(player.seat);
                close(true);
              }}
            >
              <span className={cx(styles.wind, player.dealer && styles.dealer)} aria-hidden="true">
                {m.board.windsShort[player.wind]}
              </span>
              <span className={styles.name}>{player.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
