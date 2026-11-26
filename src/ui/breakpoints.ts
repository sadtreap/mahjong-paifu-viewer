import type { Breakpoint, PanelMode } from "./viewer/types";

/**
 * The page layouts' media queries. Viewer.module.css repeats these strings verbatim (CSS cannot
 * import them), and theme.test.ts checks that it does. For whole CSS pixels exactly one matches.
 */
export const BREAKPOINT_QUERIES: Readonly<Record<Breakpoint, string>> = {
  wide: "(orientation: landscape) and (min-width: 1200px) and (min-height: 501px)",
  laptop: "(orientation: landscape) and (max-width: 1199px) and (min-height: 501px)",
  phoneLandscape: "(orientation: landscape) and (max-height: 500px)",
  tabletPortrait: "(orientation: portrait) and (min-width: 600px)",
  phonePortrait: "(orientation: portrait) and (max-width: 599px)",
};

export const BREAKPOINTS: readonly Breakpoint[] = [
  "wide",
  "laptop",
  "phoneLandscape",
  "tabletPortrait",
  "phonePortrait",
];

/**
 * The breakpoint of a viewport size in CSS pixels, the same one BREAKPOINT_QUERIES picks for whole
 * pixels. Unlike the queries it has no gaps at fractional sizes (a zoomed 1199.5 px is laptop),
 * so it is the fallback when no query matches.
 */
export function breakpointFor(width: number, height: number): Breakpoint {
  // CSS orientation: landscape only when the viewport is wider than it is tall.
  if (width > height) {
    if (height < 501) {
      return "phoneLandscape";
    }
    return width < 1200 ? "laptop" : "wide";
  }
  return width < 600 ? "phonePortrait" : "tabletPortrait";
}

/** Phone layouts: compact seat plates, icon-only back chip, the ⋯ menu. */
export function isPhoneBreakpoint(breakpoint: Breakpoint): boolean {
  return breakpoint === "phonePortrait" || breakpoint === "phoneLandscape";
}

/** Where the review rail goes: a column on wide screens, a side sheet in landscape, inline below in portrait. */
export function panelModeFor(breakpoint: Breakpoint): PanelMode {
  switch (breakpoint) {
    case "wide":
      return "column";
    case "laptop":
    case "phoneLandscape":
      return "sheet";
    case "tabletPortrait":
    case "phonePortrait":
      return "inline";
  }
}
