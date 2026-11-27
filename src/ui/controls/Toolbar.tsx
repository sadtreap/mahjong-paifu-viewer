import { useI18n } from "../../i18n/context";
import { Icon } from "../Icon";
import { shortcutKey } from "../viewer/shortcuts";
import type { ToolbarProps } from "../viewer/types";
import { AppMenu } from "./AppMenu";
import { PovMenu } from "./PovMenu";
import styles from "./Toolbar.module.css";

/**
 * The viewer's three tools, at every size: the Hands toggle (all hands face up, or only the
 * viewed player's), the point-of-view button with its menu, and the Menu button with its menu.
 * Where the toolbar is tight it shows icons only: the stylesheet hides the parts marked
 * `data-label` (the viewed player's name, then the Hands label) by the room the toolbar has.
 */
export function Toolbar({
  showAllHands,
  onToggleHands,
  players,
  pov,
  onPov,
  linkable,
  onOpenLog,
  onCopyLink,
  onSettings,
  onHelp,
  popover,
  onPopover,
}: ToolbarProps) {
  const { m } = useI18n();
  const handsKey = shortcutKey({ type: "toggleHands" });

  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a form fieldset.
    <div className={styles.toolbar} role="group" aria-label={m.tools.label} data-gesture="ignore">
      <button
        type="button"
        data-variant="ghost"
        className={styles.hands}
        aria-label={m.viewer.showAllHands}
        aria-pressed={showAllHands}
        title={handsKey ? m.tools.withKey(m.viewer.showAllHands, handsKey) : m.viewer.showAllHands}
        onClick={onToggleHands}
      >
        <Icon name="eye" />
        <span data-label="hands">{m.tools.hands}</span>
      </button>
      <PovMenu
        players={players}
        pov={pov}
        onPov={onPov}
        open={popover === "pov"}
        onOpenChange={(open) => onPopover(open ? "pov" : null)}
      />
      <AppMenu
        linkable={linkable}
        onOpenLog={onOpenLog}
        onCopyLink={onCopyLink}
        onSettings={onSettings}
        onHelp={onHelp}
        open={popover === "menu"}
        onOpenChange={(open) => onPopover(open ? "menu" : null)}
      />
    </div>
  );
}
