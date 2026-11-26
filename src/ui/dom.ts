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

/** ARIA widgets that move with the arrow keys: custom sliders and tabs. */
const ARROW_ROLES = new Set(["slider", "tab"]);

/**
 * True for controls that use the arrow keys themselves: text entry, select boxes, sliders (a
 * slider's Up and Page Up raise its value, which the round shortcuts would turn around), radio
 * buttons, and elements with the slider or tab role.
 */
export function usesArrowKeys(target: EventTarget | null): boolean {
  return (
    isTextEntry(target) ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement && (target.type === "range" || target.type === "radio")) ||
    (target instanceof HTMLElement && ARROW_ROLES.has(target.getAttribute("role") ?? ""))
  );
}

/** Input types that Space or Enter activates (toggles or presses). */
const ACTIVATABLE_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "reset",
  "submit",
]);

/** Roles whose elements Space activates. */
const ACTIVATABLE_ROLES = new Set([
  "button",
  "checkbox",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "switch",
  "tab",
]);

/**
 * True for elements that Space activates: buttons, links, check boxes and radio buttons, select
 * boxes, summaries, and elements with a button-like role. Space there presses the control instead
 * of toggling autoplay.
 */
export function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLSelectElement ||
    target.tagName === "SUMMARY" ||
    (target instanceof HTMLAnchorElement && target.hasAttribute("href")) ||
    (target instanceof HTMLInputElement && ACTIVATABLE_INPUTS.has(target.type))
  ) {
    return true;
  }
  return ACTIVATABLE_ROLES.has(target.getAttribute("role") ?? "");
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
