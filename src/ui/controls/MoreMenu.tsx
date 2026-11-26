import {
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { Icon, type IconName } from "../Icon";
import { AUTOPLAY_SPEEDS } from "../settings/settings";
import type { KeyCommand } from "../viewer/commands";
import { shortcutKey } from "../viewer/shortcuts";
import type { MoreMenuProps } from "../viewer/types";
import styles from "./MoreMenu.module.css";

const ITEM = '[role^="menuitem"]';

function resolve(ref: Ref<HTMLElement>): HTMLElement | null {
  return ref !== null && typeof ref === "object" ? ref.current : null;
}

/** Where the menu goes: under its button, or above it when the button sits in the lower half. */
function placement(anchor: HTMLElement | null): CSSProperties {
  if (!anchor) {
    return { top: 8, right: 8 };
  }
  const rect = anchor.getBoundingClientRect();
  const right = Math.max(6, window.innerWidth - rect.right);
  if (rect.top + rect.height / 2 > window.innerHeight / 2) {
    return { bottom: window.innerHeight - rect.top + 4, right, maxHeight: rect.top - 12 };
  }
  return { top: rect.bottom + 4, right, maxHeight: window.innerHeight - rect.bottom - 12 };
}

interface ItemProps {
  icon: IconName | null;
  label: string;
  onSelect(): void;
  role?: "menuitem" | "menuitemcheckbox";
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  shortcut?: KeyCommand;
}

function Item({
  icon,
  label,
  onSelect,
  role = "menuitem",
  checked = false,
  disabled = false,
  title,
  shortcut,
}: ItemProps) {
  const key = shortcut ? shortcutKey(shortcut) : null;
  const content = (
    <>
      {icon ? <Icon name={icon} className={styles.icon} /> : null}
      <span className={styles.label}>{label}</span>
      {role === "menuitemcheckbox" ? (
        <span className={cx(styles.check, checked && styles.on)} aria-hidden="true" />
      ) : null}
      {key ? (
        <span className={styles.key} aria-hidden="true">
          {key}
        </span>
      ) : null}
    </>
  );
  const onClick = () => {
    if (!disabled) {
      onSelect();
    }
  };
  if (role === "menuitemcheckbox") {
    return (
      <button
        type="button"
        role="menuitemcheckbox"
        tabIndex={-1}
        className={styles.item}
        aria-checked={checked}
        title={title}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={styles.item}
      aria-disabled={disabled || undefined}
      title={title}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function MenuPanel({
  onClose,
  linkable,
  speed,
  showAllHands,
  view,
  onOpenLog,
  onCopyLink,
  onSpeed,
  onNav,
  onToggleHands,
  onToggleView,
  onSettings,
  onHelp,
  anchorRef,
}: Omit<MoreMenuProps, "open">) {
  const { m } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  // The ⋯ button, or whatever had the focus when the menu opened: the focus goes back there.
  const opener = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Without a resolvable anchor ref, the menu button that has the focus (Safari does not focus
    // a clicked button: then the menu opens at the top right corner).
    const anchor =
      resolve(anchorRef) ?? active?.closest<HTMLElement>('[aria-haspopup="menu"]') ?? null;
    opener.current = anchor ?? active;
    setStyle(placement(anchor));
    menuRef.current?.querySelector<HTMLElement>(`${ITEM}:not([aria-disabled="true"])`)?.focus();
  }, [anchorRef]);

  const close = (restoreFocus: boolean) => {
    onClose();
    if (restoreFocus) {
      opener.current?.focus();
    }
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !menuRef.current?.contains(target) &&
        !opener.current?.contains(target)
      ) {
        // A light dismiss: the press only closes the menu (it does not also step the table).
        event.stopPropagation();
        closeRef.current(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  const select = (action: () => void) => () => {
    close(true);
    action();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => {
      items[(next + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index < 0 ? -1 : index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(-1);
        break;
      case "Escape":
        close(true);
        break;
      case "Tab":
        close(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={m.app.more}
      className={styles.menu}
      style={style}
      data-gesture="ignore"
      onKeyDown={onKeyDown}
    >
      <Item icon="open" label={m.app.newLog} onSelect={select(onOpenLog)} />
      <Item
        icon="link"
        label={m.app.copyLink}
        disabled={!linkable}
        title={linkable ? undefined : m.app.linkUnavailable}
        onSelect={select(onCopyLink)}
      />
      <hr className={styles.separator} />
      {/* biome-ignore lint/a11y/useSemanticElements: a group of items inside role="menu", not a form */}
      <div className={styles.speeds} role="group" aria-label={m.menu.speed}>
        <span className={styles.speedLabel} aria-hidden="true">
          {m.menu.speed}
        </span>
        {AUTOPLAY_SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            className={styles.speed}
            aria-checked={value === speed}
            aria-label={m.transport.speed(value)}
            onClick={select(() => onSpeed(value))}
          >
            {m.transport.speedValue(value)}
          </button>
        ))}
      </div>
      <Item
        icon="prevKey"
        label={m.transport.prevMoment}
        shortcut={{ type: "nav", command: { kind: "keyMoment", dir: -1 } }}
        onSelect={select(() => onNav({ kind: "keyMoment", dir: -1 }))}
      />
      <Item
        icon="nextKey"
        label={m.transport.nextMoment}
        shortcut={{ type: "nav", command: { kind: "keyMoment", dir: 1 } }}
        onSelect={select(() => onNav({ kind: "keyMoment", dir: 1 }))}
      />
      <Item
        icon="eye"
        role="menuitemcheckbox"
        checked={showAllHands}
        label={m.viewer.showAllHands}
        shortcut={{ type: "toggleHands" }}
        onSelect={select(onToggleHands)}
      />
      <Item
        icon="cube"
        role="menuitemcheckbox"
        checked={view === "3d"}
        label={m.tools.view3d}
        shortcut={{ type: "toggleView" }}
        onSelect={select(onToggleView)}
      />
      <hr className={styles.separator} />
      <Item icon="settings" label={m.menu.settingsLanguage} onSelect={select(onSettings)} />
      <Item icon="help" label={m.app.help} shortcut={{ type: "help" }} onSelect={select(onHelp)} />
    </div>
  );
}

/**
 * The ⋯ menu of the phone toolbar (SPEC §1.2): open, copy link, speed, key moments, show all
 * hands, 3D, settings and help. A menu (role="menu") portalled to the page, so it follows the
 * page theme; it opens under its button (above it when the button is low on the screen), takes
 * the focus, moves with the arrow keys, and closes on a choice, Esc, Tab or a press outside,
 * giving the focus back to its button.
 */
export function MoreMenu({ open, ...props }: MoreMenuProps) {
  if (!open) {
    return null;
  }
  return createPortal(<MenuPanel {...props} />, document.body);
}
