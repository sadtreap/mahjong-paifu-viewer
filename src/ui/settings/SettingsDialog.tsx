import { useId } from "react";
import { useI18n } from "../../i18n/context";
import { Dialog } from "../shell/Dialog";
import { LanguageSelect } from "./LanguageSelect";
import styles from "./SettingsDialog.module.css";
import { useSettings } from "./useSettings";

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
}

/**
 * The settings, applied as they change (nothing to save): the waits and shanten aid, the language
 * (kept by the I18nProvider) and single-key shortcuts, then Reset to defaults.
 */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { m } = useI18n();
  const { settings, update, reset } = useSettings();
  const languageId = useId();
  const keysId = useId();
  const keysHintId = useId();

  return (
    <Dialog open={open} onClose={onClose} title={m.settings.heading} closeLabel={m.settings.close}>
      <label className={styles.row}>
        {m.settings.showWaits}
        <input
          type="checkbox"
          checked={settings.showWaits}
          onChange={(event) => update({ showWaits: event.target.checked })}
        />
      </label>
      <div className={styles.row}>
        <label htmlFor={languageId}>{m.settings.language}</label>
        <LanguageSelect id={languageId} />
      </div>
      <label className={styles.row}>
        <span className={styles.text}>
          <span id={keysId}>{m.settings.charKeys}</span>
          <span id={keysHintId} className={styles.hint}>
            {m.settings.charKeysHint}
          </span>
        </span>
        <input
          type="checkbox"
          aria-labelledby={keysId}
          aria-describedby={keysHintId}
          checked={settings.charKeys}
          onChange={(event) => update({ charKeys: event.target.checked })}
        />
      </label>
      <div className={styles.actions}>
        <button type="button" onClick={reset}>
          {m.settings.reset}
        </button>
      </div>
    </Dialog>
  );
}
