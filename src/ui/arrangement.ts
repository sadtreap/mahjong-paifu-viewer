import type { Arrangement } from "./viewer/types";

/**
 * The media queries that pick the page's arrangement. The stylesheets repeat these strings
 * verbatim (CSS cannot import them), so they are written the way the stylesheet formatter writes
 * them, with spaces around a ratio's slash. They never match together; a viewport that matches
 * neither is "stack".
 */
export const WIDE = "(min-aspect-ratio: 13 / 10) and (min-height: 481px)";
export const SHORT = "(min-aspect-ratio: 8 / 5) and (max-height: 480px)";

/**
 * The arrangement for the two queries' results: "wide" (desktops, laptops, tablets in landscape:
 * the stage is the whole viewport), "short" (phones in landscape: the stage and a column of
 * controls) or "stack" (portrait and squarish windows: a top bar, the stage, the controls).
 */
export function arrangementFor(wide: boolean, short: boolean): Arrangement {
  if (wide) {
    return "wide";
  }
  return short ? "short" : "stack";
}
