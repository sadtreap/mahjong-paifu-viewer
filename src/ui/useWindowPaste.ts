import { useEffect, useRef } from "react";
import { isTextEntry } from "./dom";
import { type LogSource, sourceFromDataTransfer } from "./logSource";

/** Loads what the user pastes (Ctrl/Cmd+V) anywhere outside a text field. */
export function useWindowPaste(onPaste: (source: LogSource) => void): void {
  const onPasteRef = useRef(onPaste);

  useEffect(() => {
    onPasteRef.current = onPaste;
  });

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isTextEntry(event.target)) {
        return;
      }
      const source = sourceFromDataTransfer(event.clipboardData);
      if (source) {
        event.preventDefault();
        onPasteRef.current(source);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);
}
