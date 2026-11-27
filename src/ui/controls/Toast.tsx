import styles from "./Toast.module.css";

export interface ToastProps {
  /** The message, or null for none. */
  text: string | null;
}

/**
 * A short message at the top centre of the stage ("Link copied"), for the eye only: the live
 * region announces the same text. The viewer decides how long it stays.
 */
export function Toast({ text }: ToastProps) {
  if (text === null) {
    return null;
  }
  return (
    <p className={styles.toast} aria-hidden="true">
      {text}
    </p>
  );
}
