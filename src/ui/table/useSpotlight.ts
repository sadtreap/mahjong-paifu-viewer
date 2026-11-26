import { useEffect, useRef, useState } from "react";
import type { Spotlight } from "../viewer/types";
import { createSpotlight, type SpotlightController } from "./spotlight";

/**
 * The same-tile spotlight for the whole viewer (the table's hover and the unseen grid's hover use
 * it): one <style> element, no React state. `pickedKind` is the sticky pick, shown whenever
 * nothing is hovered. The returned object is stable.
 */
export function useSpotlight(pickedKind: number | null): Spotlight {
  const [controller] = useState<SpotlightController>(() => createSpotlight());
  useEffect(() => {
    controller.setSticky(pickedKind);
  }, [controller, pickedKind]);
  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}

/** Hover dwell before the pond tooltip appears. */
export const POND_DWELL_MS = 250;
/** The spotlight lingers this long after the pointer leaves a tile (no flicker between tiles). */
export const SPOTLIGHT_LINGER_MS = 80;

export interface StageHoverOptions {
  spotlight: Spotlight;
  /** A pond tile was dwelt on (after POND_DWELL_MS), or the dwell ended (null). */
  onDwell(tile: HTMLElement | null): void;
}

const frame =
  typeof requestAnimationFrame === "function"
    ? (cb: () => void) => requestAnimationFrame(cb)
    : (cb: () => void) => window.setTimeout(cb, 16);
const cancelFrame =
  typeof cancelAnimationFrame === "function"
    ? (id: number) => cancelAnimationFrame(id)
    : (id: number) => window.clearTimeout(id);

/**
 * Hover aids on the stage: a buttonless mouse over a face-up tile spotlights its kind; a dwell on a
 * pond tile asks for the tooltip. Touch and pen never hover (a hover is pointerType "mouse" with no
 * button held; `(hover: hover)` is unreliable). A press (capture) or the wheel clears both until the
 * next buttonless move, so holds and wheel bursts pay nothing for them. rAF-throttled.
 */
export function useStageHover(stage: HTMLElement | null, options: StageHoverOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    if (stage === null) {
      return;
    }
    let armed = true;
    let raf = 0;
    let lastTarget: EventTarget | null = null;
    let linger = 0;
    let dwell = 0;
    let pond: HTMLElement | null = null;
    let dwelt = false;

    const endDwell = () => {
      window.clearTimeout(dwell);
      dwell = 0;
      pond = null;
      if (dwelt) {
        dwelt = false;
        optionsRef.current.onDwell(null);
      }
    };
    const clearAll = () => {
      armed = false;
      if (raf !== 0) {
        cancelFrame(raf);
        raf = 0;
      }
      window.clearTimeout(linger);
      optionsRef.current.spotlight.clear();
      endDwell();
    };
    const update = () => {
      raf = 0;
      const target = lastTarget instanceof Element ? lastTarget : null;
      const tile = target?.closest<HTMLElement>("[data-k]") ?? null;
      window.clearTimeout(linger);
      if (tile !== null && stage.contains(tile)) {
        optionsRef.current.spotlight.hover(Number(tile.dataset.k));
      } else {
        linger = window.setTimeout(() => optionsRef.current.spotlight.clear(), SPOTLIGHT_LINGER_MS);
      }
      const hit = target?.closest<HTMLElement>("[data-d]") ?? null;
      const next = hit !== null && stage.contains(hit) ? hit : null;
      if (next !== pond) {
        endDwell();
        pond = next;
        if (next !== null) {
          dwell = window.setTimeout(() => {
            if (armed && pond === next) {
              dwelt = true;
              optionsRef.current.onDwell(next);
            }
          }, POND_DWELL_MS);
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons !== 0) {
        return;
      }
      armed = true;
      lastTarget = e.target;
      if (raf === 0) {
        raf = frame(update);
      }
    };
    const onLeave = () => {
      if (raf !== 0) {
        cancelFrame(raf);
        raf = 0;
      }
      window.clearTimeout(linger);
      optionsRef.current.spotlight.clear();
      endDwell();
    };
    const onKey = () => endDwell();

    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerleave", onLeave);
    stage.addEventListener("pointerdown", clearAll, { capture: true });
    stage.addEventListener("wheel", clearAll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("pointerdown", clearAll, { capture: true });
      stage.removeEventListener("wheel", clearAll);
      window.removeEventListener("keydown", onKey);
      if (raf !== 0) {
        cancelFrame(raf);
      }
      window.clearTimeout(linger);
      window.clearTimeout(dwell);
    };
  }, [stage]);
}
