import { Fragment, type ReactNode, useId } from "react";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { cx } from "../cx";
import { Dialog } from "../shell/Dialog";
import { useTouchFirst } from "../shell/device";
import { MOUSE_HELP, SHORTCUTS, TOUCH_HELP } from "../viewer/shortcuts";
import styles from "./HelpDialog.module.css";
import { useSettings } from "./useSettings";

export interface HelpDialogProps {
  open: boolean;
  onClose(): void;
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

function Lines({ lines, m }: { lines: readonly ((m: Messages) => string)[]; m: Messages }) {
  return (
    <ul className={styles.list}>
      {lines.map((line) => (
        <li key={line(m)}>{line(m)}</li>
      ))}
    </ul>
  );
}

/**
 * The three lists. The keys come first, then the mouse and touch; on a touch device the touch
 * list leads and the keys come last, so a phone shows what a finger does without scrolling.
 */
function Controls() {
  const { m } = useI18n();
  const { settings } = useSettings();
  const touchFirst = useTouchFirst();

  const keys = (
    <Section title={m.help.keyboard}>
      {!settings.charKeys && <p className={styles.note}>{m.settings.charKeysOff}</p>}
      <table className={styles.keys}>
        <tbody>
          {SHORTCUTS.map((row) => {
            const off = row.charKey && !settings.charKeys;
            return (
              <tr key={row.id} className={off ? styles.off : undefined}>
                <th scope="row">
                  <span className={styles.combos}>
                    {row.keys.map((key) => (
                      <Keys key={key} display={key} />
                    ))}
                  </span>
                </th>
                <td>
                  {row.label(m)}
                  {off && <span className="sr-only"> {m.help.off}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
  const mouse = (
    <Section title={m.help.mouse}>
      <Lines lines={MOUSE_HELP} m={m} />
    </Section>
  );
  const touch = (
    <Section title={m.help.touch}>
      <Lines lines={TOUCH_HELP} m={m} />
    </Section>
  );

  return touchFirst ? (
    <div className={cx(styles.columns, styles.touchFirst)}>
      <div className={styles.side}>
        {touch}
        {mouse}
      </div>
      {keys}
    </div>
  ) : (
    <div className={styles.columns}>
      {keys}
      <div className={styles.side}>
        {mouse}
        {touch}
      </div>
    </div>
  );
}

/**
 * The controls: the keys, and what the mouse and a finger do on the table. The keys are rendered
 * from the table the key handler reads, so the two cannot disagree; with single-key shortcuts
 * turned off in the settings, those rows are marked as off.
 */
export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const { m } = useI18n();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={m.help.heading}
      closeLabel={m.help.close}
      focusBody
      wide
    >
      <Controls />
    </Dialog>
  );
}
