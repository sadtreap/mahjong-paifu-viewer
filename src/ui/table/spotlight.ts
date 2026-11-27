import type { Spotlight } from "../viewer/types";

/** Attribute on the table's root: the spotlight only outlines tiles inside it. */
export const SPOTLIGHT_ROOT_ATTR = "data-stage";

/**
 * The same-tile spotlight's rule: every face-up tile of that kind on the table gets a cyan outline
 * (Highlight in forced colours). Outline only: dimming the other tiles cost 30-56 ms per hover.
 */
export function spotlightCss(kind: number | null): string {
  if (kind === null || !Number.isInteger(kind) || kind < 0 || kind > 33) {
    return "";
  }
  const target = `[${SPOTLIGHT_ROOT_ATTR}] [data-k="${kind}"]`;
  return (
    `${target}{outline:max(3px,calc(var(--w,24px)*.12)) solid var(--spot);outline-offset:1px}` +
    `@media (forced-colors:active){${target}{outline:3px solid Highlight}}`
  );
}

/** A spotlight that can be asked what it shows and disposed. */
export interface SpotlightController extends Spotlight {
  /** The kind the rule currently outlines. */
  current(): number | null;
  dispose(): void;
}

/**
 * Owns one <style> element in the document's head and rewrites it only when the outlined kind
 * changes. No React state: hovering costs a style swap, nothing re-renders. After dispose() the
 * element is gone; a later change puts it back (React's strict mode remounts effects).
 */
export function createSpotlight(doc?: Document): SpotlightController {
  let style: HTMLStyleElement | null = null;
  let shown: number | null = null;
  // The element is created on the first change, so creating a spotlight has no side effect.
  const render = (kind: number | null) => {
    if (kind === shown && (style?.isConnected ?? kind === null)) {
      return;
    }
    shown = kind;
    const owner = doc ?? document;
    if (style === null) {
      style = owner.createElement("style");
      style.setAttribute("data-spotlight", "");
    }
    if (!style.isConnected) {
      owner.head.append(style);
    }
    style.textContent = spotlightCss(kind);
  };
  return {
    hover: render,
    clear: () => render(null),
    current: () => shown,
    dispose() {
      style?.remove();
    },
  };
}
