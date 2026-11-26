import { useEffect, useRef } from "react";
import type { Position } from "../navigation";
import { autoplayDelay } from "./autoplay";
import type { AutoplaySpeed, StepIndex } from "./types";

export interface AutoplayOptions {
  playing: boolean;
  position: Position;
  ix: StepIndex;
  speed: AutoplaySpeed;
  /** Advance one step (dispatch a "nav" step with source "autoplay"). */
  onTick(): void;
  /** Pause: at a result, or when the page is hidden. */
  onStop(): void;
}

/**
 * Autoplay as a setTimeout chain keyed on the position: each step waits its own delay
 * (`autoplayDelay`), then calls `onTick`. Cleared on unmount, on pause and when the position
 * changes for any other reason; pauses when the page is hidden.
 */
export function useAutoplay({
  playing,
  position,
  ix,
  speed,
  onTick,
  onStop,
}: AutoplayOptions): void {
  const callbacks = useRef({ onTick, onStop });
  useEffect(() => {
    callbacks.current = { onTick, onStop };
  });

  const { round, step } = position;
  useEffect(() => {
    if (!playing) {
      return;
    }
    const delay = autoplayDelay(ix.info(round, step), speed);
    if (delay === "stop") {
      callbacks.current.onStop();
      return;
    }
    const timer = window.setTimeout(() => callbacks.current.onTick(), delay);
    return () => window.clearTimeout(timer);
  }, [playing, round, step, ix, speed]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        callbacks.current.onStop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [playing]);
}
