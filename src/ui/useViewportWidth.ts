import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * The viewport's width in CSS pixels (without a scroll bar), updated when it changes; 0 while
 * `watch` is off, so a resize then renders nothing again.
 */
export function useViewportWidth(watch: boolean): number {
  return useSyncExternalStore(
    subscribe,
    () => (watch ? document.documentElement.clientWidth : 0),
    () => 0,
  );
}
