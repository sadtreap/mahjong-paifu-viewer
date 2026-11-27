import { useCallback, useEffect, useMemo, useState } from "react";
import { type Position, samePosition } from "../navigation";

/** How long a toast ("Link copied") stays. */
export const TOAST_MS = 4000;

interface Notice {
  /** Each notice has its own, so the same words are shown and read out again. */
  id: number;
  text: string;
  /** Where the replay was when it was given: the live region reads it until the next move. */
  at: Position;
  /** Shown on screen as a toast too, for TOAST_MS. */
  toast: boolean;
}

export interface Toasts {
  /** The toast on screen, or null. */
  toast: string | null;
  /** What the live region reads in place of the step (LiveStatusProps.announcement). */
  announcement: { id: number; text: string } | null;
  /** A toast, read out as well ("Link copied"). */
  show(text: string): void;
  /** Words for the live region only: what a key changed that the eye sees on the table. */
  say(text: string): void;
}

/**
 * The viewer's short messages. Each one is read out by the live region until the replay moves on
 * (the next step is read then), and a toast stays on screen for its full time even when the next
 * one repeats its words.
 */
export function useToast(position: Position): Toasts {
  const [notice, setNotice] = useState<Notice | null>(null);
  // The toast whose time is up.
  const [expired, setExpired] = useState(0);

  useEffect(() => {
    if (notice === null || !notice.toast) {
      return;
    }
    const timer = window.setTimeout(() => setExpired(notice.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const post = useCallback(
    (text: string, toast: boolean) =>
      setNotice((last) => ({ id: (last?.id ?? 0) + 1, text, at: position, toast })),
    [position],
  );
  const show = useCallback((text: string) => post(text, true), [post]);
  const say = useCallback((text: string) => post(text, false), [post]);

  const reading = notice !== null && samePosition(notice.at, position);
  const announcement = useMemo(
    () => (notice !== null && reading ? { id: notice.id, text: notice.text } : null),
    [notice, reading],
  );
  const toast = notice?.toast && expired !== notice.id ? notice.text : null;
  return { toast, announcement, show, say };
}
