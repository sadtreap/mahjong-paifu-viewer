import { type RefObject, useEffect, useRef } from "react";

/**
 * Drives a native <dialog> from an `open` flag: showModal() when it turns true, close() when it
 * turns false, and the focus back to the control that had it when the dialog opened (if that
 * control still exists). A close the browser makes on its own (a form with method="dialog")
 * reports through `onClose`, so the flag stays in sync.
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    openRef.current = open;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      const active = dialog.ownerDocument.activeElement;
      opener.current =
        active instanceof HTMLElement && active !== dialog.ownerDocument.body ? active : null;
      try {
        dialog.showModal();
      } catch {
        // Not connected, or already open as a non-modal dialog: show it anyway.
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    const handleClose = () => {
      const target = opener.current;
      opener.current = null;
      if (target?.isConnected && !dialog.contains(target)) {
        target.focus();
      }
      if (openRef.current) {
        onCloseRef.current();
      }
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  // Unmounting while open (e.g. the app swaps views): give the focus back too.
  useEffect(
    () => () => {
      const target = opener.current;
      if (target?.isConnected) {
        target.focus();
      }
    },
    [],
  );

  return ref;
}
