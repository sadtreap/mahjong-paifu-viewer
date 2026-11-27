import { useEffect, useRef } from "react";
import { isActivatable, isTextEntry, usesArrowKeys } from "../dom";
import { type KeyCommand, keyCommand } from "./commands";

/** Keys a focused slider, tab list, radio group or select box uses itself. */
const CONTROL_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export interface ViewerKeysOptions {
  /** Single-key shortcuts (letters, digits, punctuation, Space); off leaves arrows, Home, End and Esc. */
  charKeys: boolean;
  /**
   * Runs a command. `repeat` is the key's auto-repeat (navigation from it uses the "repeat"
   * source, which stops at round ends). Return false when the command did not apply, so the key
   * keeps its default action; otherwise the key's default is prevented.
   */
  onCommand(command: KeyCommand, event: { repeat: boolean }): boolean | undefined;
}

/** A modal dialog is open (its backdrop makes the page inert, wherever the focus is). */
function modalOpen(doc: Document): boolean {
  for (const dialog of doc.querySelectorAll("dialog[open]")) {
    try {
      if (dialog.matches(":modal")) {
        return true;
      }
    } catch {
      // A browser without :modal: an open dialog holding the focus is caught by the caller.
    }
  }
  return false;
}

/**
 * The viewer's keyboard shortcuts, on `window`. Ignored: presses with Ctrl, Cmd or
 * Alt; presses in text fields and select boxes; presses inside an open dialog or while a modal
 * dialog is open; IME composition; the arrow, Home, End and paging keys on a focused slider, tab
 * or radio button; Space on a focused button or other control Space presses.
 */
export function useViewerKeys(options: ViewerKeysOptions): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { charKeys, onCommand } = latest.current;
      if (event.defaultPrevented || event.isComposing) {
        return;
      }
      const target = event.target;
      if (
        isTextEntry(target) ||
        target instanceof HTMLSelectElement ||
        (target instanceof Element && target.closest("dialog[open]") !== null) ||
        modalOpen(document)
      ) {
        return;
      }
      const command = keyCommand(event, { charKeys });
      if (
        command === null ||
        (usesArrowKeys(target) && CONTROL_KEYS.has(event.key)) ||
        (command.type === "togglePlay" && isActivatable(target))
      ) {
        return;
      }
      if (onCommand(command, { repeat: event.repeat }) !== false) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
