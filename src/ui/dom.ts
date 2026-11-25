/** Input types that do not take typed text, so shortcuts and global paste still apply on them. */
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** True for elements where typing or pasting edits text (text fields, textareas, contenteditable). */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return true;
  }
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

/**
 * True for controls that use the arrow keys themselves: text entry, select boxes and sliders (a
 * slider's Up and Page Up raise its value, which the round shortcuts would turn around).
 */
export function usesArrowKeys(target: EventTarget | null): boolean {
  return (
    isTextEntry(target) ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement && target.type === "range")
  );
}

/** True when nothing has the keyboard focus: it is on the page itself, or on a removed element. */
export function focusIsLost(doc: Document = document): boolean {
  const active = doc.activeElement;
  return active === null || active === doc.body || !active.isConnected;
}

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** The first focusable control that comes after `element` (and outside it) in document order. */
export function nextTabbable(element: Element): HTMLElement | null {
  for (const candidate of element.ownerDocument.querySelectorAll<HTMLElement>(TABBABLE)) {
    if (
      !element.contains(candidate) &&
      element.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      return candidate;
    }
  }
  return null;
}
