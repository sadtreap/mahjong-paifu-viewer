import { useEffect, useRef, useState } from "react";
import type { Spotlight } from "../viewer/types";
import { createSpotlight, type SpotlightController } from "./spotlight";

/**
 * The same-tile spotlight for the table's hover: one <style> element, no React state. The returned
 * object is stable.
 */
export function useSpotlight(): Spotlight {
  const [controller] = useState<SpotlightController>(() => createSpotlight());
  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}

/** The spotlight lingers this long after the pointer leaves a tile (no flicker between tiles). */
export const SPOTLIGHT_LINGER_MS = 80;

const frame =
  typeof requestAnimationFrame === "function"
    ? (cb: () => void) => requestAnimationFrame(cb)
    : (cb: () => void) => window.setTimeout(cb, 16);
const cancelFrame =
  typeof cancelAnimationFrame === "function"
    ? (id: number) => cancelAnimationFrame(id)
    : (id: number) => window.clearTimeout(id);

/**
 * The hover aid on the stage: a buttonless mouse over a face-up tile spotlights its kind. Touch
 * and pen never hover (a hover is pointerType "mouse" with no button held; `(hover: hover)` is
 * unreliable). A press (capture) or the wheel clears it until the next buttonless move, so holds
 * and wheel bursts pay nothing for it. rAF-throttled.
 */
export function useStageHover(stage: HTMLElement | null, spotlight: Spotlight): void {
  const spotlightRef = useRef(spotlight);
  useEffect(() => {
    spotlightRef.current = spotlight;
  });
  useEffect(() => {
    if (stage === null) {
      return;
    }
    let raf = 0;
    let lastTarget: EventTarget | null = null;
    let linger = 0;

    const clear = () => {
      if (raf !== 0) {
        cancelFrame(raf);
        raf = 0;
      }
      window.clearTimeout(linger);
      spotlightRef.current.clear();
    };
    const update = () => {
      raf = 0;
      const target = lastTarget instanceof Element ? lastTarget : null;
      const tile = target?.closest<HTMLElement>("[data-k]") ?? null;
      window.clearTimeout(linger);
      if (tile !== null && stage.contains(tile)) {
        spotlightRef.current.hover(Number(tile.dataset.k));
      } else {
        linger = window.setTimeout(() => spotlightRef.current.clear(), SPOTLIGHT_LINGER_MS);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons !== 0) {
        return;
      }
      lastTarget = e.target;
      if (raf === 0) {
        raf = frame(update);
      }
    };

    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerleave", clear);
    stage.addEventListener("pointerdown", clear, { capture: true });
    stage.addEventListener("wheel", clear, { passive: true });
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", clear);
      stage.removeEventListener("pointerdown", clear, { capture: true });
      stage.removeEventListener("wheel", clear);
      if (raf !== 0) {
        cancelFrame(raf);
      }
      window.clearTimeout(linger);
    };
  }, [stage]);
}
