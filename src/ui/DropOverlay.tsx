import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/context";
import styles from "./DropOverlay.module.css";

/**
 * Shown over the whole window while a file is dragged over it. It joins the browser's top layer
 * where there is one, so it also covers an open dialog; elsewhere it is a fixed layer.
 */
export function DropOverlay() {
  const { m } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = ref.current;
    if (!overlay || typeof overlay.showPopover !== "function") {
      return;
    }
    try {
      overlay.showPopover();
    } catch {
      // Already in the top layer: development builds run effects twice.
    }
  }, []);

  return (
    <div ref={ref} className={styles.overlay} popover="manual">
      <p className={styles.message}>{m.load.dropOverlay}</p>
    </div>
  );
}
