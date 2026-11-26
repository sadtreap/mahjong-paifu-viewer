import { useSyncExternalStore } from "react";
import { BREAKPOINT_QUERIES, BREAKPOINTS, breakpointFor } from "./breakpoints";
import type { Breakpoint } from "./viewer/types";

let lists: ReadonlyArray<readonly [Breakpoint, MediaQueryList]> | null = null;

/** The breakpoints' MediaQueryLists, made once (null where matchMedia is missing). */
function mediaLists(): ReadonlyArray<readonly [Breakpoint, MediaQueryList]> | null {
  if (lists === null && typeof window !== "undefined" && typeof window.matchMedia === "function") {
    lists = BREAKPOINTS.map((name) => [name, window.matchMedia(BREAKPOINT_QUERIES[name])] as const);
  }
  return lists;
}

/** The current breakpoint: the matching query, else (fractional sizes) the viewport's size. */
export function currentBreakpoint(): Breakpoint {
  const match = mediaLists()?.find(([, list]) => list.matches);
  return match ? match[0] : breakpointFor(window.innerWidth, window.innerHeight);
}

function subscribe(onChange: () => void): () => void {
  const all = mediaLists() ?? [];
  for (const [, list] of all) {
    list.addEventListener("change", onChange);
  }
  // Zoom can land between the queries' whole-pixel edges, where none matches; resize catches it.
  window.addEventListener("resize", onChange);
  return () => {
    for (const [, list] of all) {
      list.removeEventListener("change", onChange);
    }
    window.removeEventListener("resize", onChange);
  };
}

/** The page layout in use (§1), the same one Viewer.module.css's media queries pick. */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, currentBreakpoint, () => "wide");
}

/** Test hook: forget the cached MediaQueryLists (after a test replaces matchMedia). */
export function resetBreakpointCache(): void {
  lists = null;
}
