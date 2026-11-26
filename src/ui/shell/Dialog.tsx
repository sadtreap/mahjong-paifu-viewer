import { type ReactNode, useId } from "react";
import { cx } from "../cx";
import { Icon } from "../Icon";
import styles from "./Dialog.module.css";
import { useModalDialog } from "./useModalDialog";

export interface DialogProps {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  /** The close button's accessible name. */
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

/**
 * A modal native <dialog> in the page theme with a title and a close button. Esc, the close button
 * and a click on the backdrop close it; the focus returns to the control that opened it.
 */
export function Dialog({ open, onClose, title, closeLabel, children, className }: DialogProps) {
  const ref = useModalDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, className)}
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
      onClick={(event) => {
        // The content fills the dialog, so only a click on the backdrop targets the dialog itself.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {open && (
        <div className={styles.content}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.close}
              aria-label={closeLabel}
              title={closeLabel}
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </header>
          <div className={styles.body}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
