import { useI18n } from "../../i18n/context";
import type { PanelActionsProps } from "../viewer/types";
import styles from "./PanelActions.module.css";

/**
 * The app's actions, at the panel's foot: open another log, copy a link to this moment (only for
 * a log that has an address), the settings and the controls help.
 */
export function PanelActions({
  linkable,
  onOpenLog,
  onCopyLink,
  onSettings,
  onHelp,
}: PanelActionsProps) {
  const { m } = useI18n();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a form fieldset.
    <div className={styles.actions} role="group" aria-label={m.menu.label}>
      <button type="button" data-variant="ghost" onClick={onOpenLog}>
        {m.menu.open}
      </button>
      {linkable && (
        <button type="button" data-variant="ghost" onClick={onCopyLink}>
          {m.menu.copyLink}
        </button>
      )}
      <button type="button" data-variant="ghost" onClick={onSettings}>
        {m.menu.settings}
      </button>
      <button type="button" data-variant="ghost" onClick={onHelp}>
        {m.menu.controls}
      </button>
    </div>
  );
}
