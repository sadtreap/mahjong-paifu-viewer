/**
 * The text of a rendered element as one reader gets it, for component tests: a row often says one
 * thing to the eye ("E", tiles) and another to a screen reader ("East", the tiles' names).
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * An element's text, one piece per run of text and the pieces joined by single spaces, without
 * the parts `skip` names (and all that is in them).
 */
export function textOf(element: Element, skip: (part: Element) => boolean): string {
  const pieces: string[] = [];
  const walk = (parent: Element) => {
    let run = "";
    const flush = () => {
      if (run.trim() !== "") {
        pieces.push(run.trim());
      }
      run = "";
    };
    for (const child of parent.childNodes) {
      if (child.nodeType === TEXT_NODE) {
        run += child.textContent ?? "";
      } else if (child.nodeType === ELEMENT_NODE) {
        flush();
        if (!skip(child as Element)) {
          walk(child as Element);
        }
      }
    }
    flush();
  };
  walk(element);
  return pieces.join(" ");
}

/** What a screen reader reads of an element: its text without what `aria-hidden` keeps from it. */
export function spoken(element: Element): string {
  return textOf(element, (part) => part.getAttribute("aria-hidden") === "true");
}

/** What the eye reads of an element: its text without what only a screen reader gets (`sr-only`). */
export function shown(element: Element): string {
  return textOf(element, (part) => part.classList.contains("sr-only"));
}
