import { type ReactNode, useId, useRef } from "react";
import { cx } from "../cx";
import { Icon } from "../Icon";
import styles from "./Dialog.module.css";
import { useModalDialog } from "./useModalDialog";

export interface DialogProps {
  open: boolean;
  onClose(): void;
  title: string;
  /** The close button's accessible name. */
  closeLabel: string;
  /**
   * For a body with nothing to focus that can be taller than the window: the body itself takes the
   * focus, so the keyboard can scroll it. It is no landmark of its own: the dialog names it.
   */
  focusBody?: boolean;
  /** A wider card, for content laid out in two columns. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * A modal native <dialog> with a title and a close button. Esc, the close button and a press on
 * the backdrop close it; the focus returns to the element that had it when the dialog opened.
 */
export function Dialog({
  open,
  onClose,
  title,
  closeLabel,
  focusBody = false,
  wide = false,
  children,
}: DialogProps) {
  const ref = useModalDialog(open, onClose);
  const titleId = useId();
  // A press that starts on the backdrop. One that starts inside and ends outside (a drag that
  // selects text) also clicks the dialog, and must not close it.
  const pressedBackdrop = useRef(false);
  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, wide && styles.wide)}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Close through the state, so `open` stays the single source of truth.
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onPointerDown={(event) => {
        // The content fills the dialog, so only a press on the backdrop targets the dialog itself.
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) {
          onClose();
        }
        pressedBackdrop.current = false;
      }}
    >
      {open && (
        <div className={styles.content}>
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              data-variant="ghost"
              data-icon
              aria-label={closeLabel}
              title={closeLabel}
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
          {focusBody ? (
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a body that scrolls has to take the focus for the keyboard to scroll it.
            <div className={styles.body} tabIndex={0}>
              {children}
            </div>
          ) : (
            <div className={styles.body}>{children}</div>
          )}
        </div>
      )}
    </dialog>
  );
}
