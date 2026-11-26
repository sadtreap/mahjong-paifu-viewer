import { Fragment, type ReactNode, useId } from "react";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { Dialog } from "../shell/Dialog";
import { MOUSE_HELP, SHORTCUTS, TOUCH_HELP } from "../viewer/shortcuts";
import styles from "./HelpDialog.module.css";
import { useSettings } from "./useSettings";

/** What the help needs of a keyboard shortcut row (viewer/shortcuts.ts's ShortcutRow has it). */
export interface HelpShortcut {
  keys: readonly string[];
  charKey: boolean;
  label: (m: Messages) => string;
}

export interface HelpDialogProps {
  open: boolean;
  onClose(): void;
  /** The keyboard rows; viewer/shortcuts.ts's SHORTCUTS, which also drives the key handler. */
  shortcuts?: readonly HelpShortcut[];
  mouse?: readonly ((m: Messages) => string)[];
  touch?: readonly ((m: Messages) => string)[];
}

/** "Shift+→" as Shift + → keycaps; a lone "+" stays one key. */
function Keys({ display }: { display: string }) {
  const parts = display === "+" ? ["+"] : display.split("+");
  return (
    <span className={styles.combo}>
      {parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one combination never reorder.
        <Fragment key={index}>
          {index > 0 && <span aria-hidden="true">+</span>}
          <kbd>{part}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h3 id={id} className={styles.heading}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Keyboard, mouse and touch controls. The keyboard part is rendered from the same table the key
 * handler reads, so the two cannot disagree; with single-key shortcuts turned off in the settings,
 * those rows are marked as off.
 */
export function HelpDialog({
  open,
  onClose,
  shortcuts = SHORTCUTS,
  mouse = MOUSE_HELP,
  touch = TOUCH_HELP,
}: HelpDialogProps) {
  const { m } = useI18n();
  const { settings } = useSettings();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={m.help.heading}
      closeLabel={m.help.close}
      className={styles.dialog}
    >
      <div className={styles.columns}>
        <Section title={m.help.keyboard}>
          {!settings.charKeys && <p className={styles.off}>{m.settings.charKeysOff}</p>}
          <table className={styles.keys}>
            <tbody>
              {shortcuts.map((row) => {
                const off = row.charKey && !settings.charKeys;
                return (
                  <tr key={row.keys.join(" ")} className={off ? styles.disabled : undefined}>
                    <th scope="row">
                      {row.keys.map((key) => (
                        <Keys key={key} display={key} />
                      ))}
                    </th>
                    <td>{row.label(m)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
        <div className={styles.side}>
          <Section title={m.help.mouse}>
            <ul className={styles.list}>
              {mouse.map((line) => (
                <li key={line(m)}>{line(m)}</li>
              ))}
            </ul>
          </Section>
          <Section title={m.help.touch}>
            <ul className={styles.list}>
              {touch.map((line) => (
                <li key={line(m)}>{line(m)}</li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
      <p className={styles.note}>{m.help.note}</p>
    </Dialog>
  );
}
