import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { Icon, type IconName } from "../Icon";
import type { AppMenuProps } from "../viewer/types";
import styles from "./AppMenu.module.css";
import popoverStyles from "./Popover.module.css";
import { placeBelow, usePopover } from "./usePopover";

/**
 * The Menu button and its menu: open another log, copy a link to this moment (only for a log that
 * has an address), the settings and the controls help. Choosing an item gives the focus back to
 * the button first, so a dialog the item opens returns it there when it closes.
 */
export function AppMenu({
  linkable,
  onOpenLog,
  onCopyLink,
  onSettings,
  onHelp,
  open,
  onOpenChange,
}: AppMenuProps) {
  const { m } = useI18n();
  const popover = usePopover({ open, onOpenChange, place: placeBelow });
  const item = (icon: IconName, label: string, action: () => void) => (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-variant="ghost"
      className={popoverStyles.item}
      onClick={() => popover.choose(action)}
    >
      <Icon name={icon} />
      {label}
    </button>
  );

  return (
    <>
      <button
        ref={popover.openerRef}
        type="button"
        data-variant="ghost"
        data-icon=""
        aria-label={m.menu.label}
        title={m.menu.label}
        aria-haspopup="menu"
        {...popover.openerProps}
      >
        <Icon name="more" />
      </button>
      {open &&
        popover.portal(
          <div
            ref={popover.panelRef}
            role="menu"
            aria-label={m.menu.label}
            className={cx(popoverStyles.panel, styles.menu)}
            {...popover.panelProps}
          >
            {item("open", m.menu.open, onOpenLog)}
            {linkable && item("link", m.menu.copyLink, onCopyLink)}
            {item("settings", m.menu.settings, onSettings)}
            {item("help", m.menu.controls, onHelp)}
          </div>,
        )}
    </>
  );
}
