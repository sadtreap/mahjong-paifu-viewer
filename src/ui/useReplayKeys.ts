import { useEffect, useRef } from "react";
import { usesArrowKeys } from "./dom";
import { keyAction, type NavAction } from "./keys";

/**
 * Global replay shortcuts. Keys pressed in text fields, select boxes and the step slider are left
 * to those controls: the slider moves within the round with its own keys, as sliders do.
 */
export function useReplayKeys(onAction: (action: NavAction) => void): void {
  const onActionRef = useRef(onAction);

  useEffect(() => {
    onActionRef.current = onAction;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || usesArrowKeys(event.target)) {
        return;
      }
      const action = keyAction(event);
      if (action) {
        event.preventDefault();
        onActionRef.current(action);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
