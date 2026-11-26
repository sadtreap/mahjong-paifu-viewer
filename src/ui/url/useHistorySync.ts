import { useCallback, useEffect, useRef, useState } from "react";
import type { Seat } from "../../core/model";
import type { Position } from "../navigation";
import type { LinkSource, MoveKind } from "../viewer/types";
import {
  type HistoryState,
  historyMode,
  parseHistoryState,
  REPLACE_DEBOUNCE_MS,
  toHistoryState,
} from "./history";
import { formatViewerUrl, parseViewerUrl, sameLinkSource, viewerLink } from "./urlState";

export interface HistorySyncOptions {
  /**
   * Where the game came from. A sample or Tenhou log writes `?sample=` or `?tenhou=` with round,
   * step and pov; null (a local file, pasted log data, or the sample under the welcome card)
   * keeps the viewer's parameters out of the address.
   */
  origin: LinkSource | null;
  position: Position;
  pov: Seat;
  /** The kind of the move that led to `position` and `pov` (ViewerState.lastMove.kind). */
  moveKind: MoveKind;
  /**
   * True when this game replaced another one in the page: its first entry is pushed, so Back
   * returns to the previous game's entry instead of losing it. False for the first game and for
   * a game reopened by Back or Forward.
   */
  newEntry: boolean;
  /** Back or Forward landed on one of this game's entries: seek there as a "history" move. */
  onRestore(position: Position, pov: Seat): void;
}

export interface HistorySync {
  /** The previous entry of this game (the back chip's target), or null when there is none. */
  back: HistoryState | null;
  /** Returns to the previous entry (Backspace, the back chip); does nothing without one. */
  goBack(): void;
  /** The absolute link to the current position (Copy link), or null for a game no link reopens. */
  link(): string | null;
}

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** History API calls can throw (Safari's rate limit, sandboxed frames); the viewer carries on. */
function write(mode: "push" | "replace", state: HistoryState, url: string): void {
  try {
    if (mode === "push") {
      window.history.pushState(state, "", url);
    } else {
      window.history.replaceState(state, "", url);
    }
  } catch {
    // The address falls behind; Back and Forward still work for the entries already written.
  }
}

/**
 * Keeps the browser history in step with the viewer (§3.7). Jumps and point-of-view changes push
 * an entry (a burst within a second is one entry); single steps, holds, wheel turns, scrubs and
 * autoplay update the current entry, debounced. Back and Forward (the browser's buttons, the mouse
 * back button, Backspace, Alt+←, the Android back gesture) restore a position of this game through
 * `onRestore`. The entries of this game are tracked in memory for the back chip; after a reload the
 * chip waits for the next jump. Entries of another game are left to the shell, which reloads a
 * sample or Tenhou log that Back or Forward returns to.
 */
export function useHistorySync({
  origin,
  position,
  pov,
  moveKind,
  newEntry,
  onRestore,
}: HistorySyncOptions): HistorySync {
  const [sid] = useState(newSessionId);
  const stack = useRef<HistoryState[]>([]);
  const index = useRef(0);
  const [back, setBack] = useState<HistoryState | null>(null);
  const lastJump = useRef(Number.NEGATIVE_INFINITY);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const latest = useRef({ origin, position, pov, moveKind, onRestore });
  // Declared first, so the effects below see this render's values.
  useEffect(() => {
    latest.current = { origin, position, pov, moveKind, onRestore };
  });

  const urlFor = useCallback((state: HistoryState) => {
    const { pathname, search, hash } = window.location;
    return `${pathname}${formatViewerUrl(search, latest.current.origin, state, state.pov)}${hash}`;
  }, []);

  const entry = useCallback(
    (p: Position, seat: Seat, n: number) => toHistoryState(p, seat, { sid, n }),
    [sid],
  );

  const syncBack = useCallback(() => {
    setBack(index.current > 0 ? (stack.current[index.current - 1] ?? null) : null);
  }, []);

  /** Writes the current entry now if a debounced write is waiting. */
  const flush = useCallback(() => {
    if (pending.current === null) {
      return;
    }
    clearTimeout(pending.current);
    pending.current = null;
    const state = stack.current[index.current];
    if (state) {
      write("replace", state, urlFor(state));
    }
  }, [urlFor]);

  const scheduleReplace = useCallback(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current);
    }
    pending.current = setTimeout(() => {
      pending.current = null;
      const state = stack.current[index.current];
      if (state) {
        write("replace", state, urlFor(state));
      }
    }, REPLACE_DEBOUNCE_MS);
  }, [urlFor]);

  // The game's first entry: stamp the current one, or push after another game.
  useEffect(() => {
    if (initialized.current) {
      return;
    }
    initialized.current = true;
    const { position: p, pov: seat } = latest.current;
    const state = entry(p, seat, 0);
    stack.current = [state];
    index.current = 0;
    write(newEntry ? "push" : "replace", state, urlFor(state));
    syncBack();
  }, [entry, newEntry, urlFor, syncBack]);

  // Every later move.
  const { round, step } = position;
  const moveKey = `${round}:${step}:${pov}`;
  const lastMoveKey = useRef(moveKey);
  useEffect(() => {
    if (lastMoveKey.current === moveKey) {
      return;
    }
    lastMoveKey.current = moveKey;
    const kind = latest.current.moveKind;
    const now = performance.now();
    const mode = historyMode(kind, now - lastJump.current);
    if (kind === "jump" || kind === "pov") {
      lastJump.current = now;
    }
    if (mode === "none") {
      return;
    }
    if (mode === "push") {
      flush();
      index.current += 1;
      const state = entry({ round, step }, pov, index.current);
      stack.current = [...stack.current.slice(0, index.current), state];
      write("push", state, urlFor(state));
      syncBack();
      return;
    }
    stack.current[index.current] = entry({ round, step }, pov, index.current);
    if (kind === "jump" || kind === "pov") {
      // A merged jump: rare, so written at once.
      flush();
      const state = stack.current[index.current];
      if (state) {
        write("replace", state, urlFor(state));
      }
    } else {
      scheduleReplace();
    }
  }, [moveKey, round, step, pov, entry, flush, scheduleReplace, syncBack, urlFor]);

  // The origin changes when the welcome card goes (the sample becomes linkable): rewrite the address.
  const originKey = origin === null ? "" : JSON.stringify(origin);
  const lastOriginKey = useRef(originKey);
  useEffect(() => {
    if (lastOriginKey.current !== originKey) {
      lastOriginKey.current = originKey;
      scheduleReplace();
    }
  }, [originKey, scheduleReplace]);

  // Back and Forward.
  useEffect(() => {
    const handlePop = (event: PopStateEvent) => {
      const state = parseHistoryState(event.state);
      if (!state) {
        return;
      }
      // A debounced write belongs to the entry just left; the browser has moved on.
      if (pending.current !== null) {
        clearTimeout(pending.current);
        pending.current = null;
      }
      let target: HistoryState;
      if (state.sid === sid && state.n !== undefined) {
        index.current = state.n;
        target = stack.current[state.n] ?? state;
      } else {
        // An entry from before a reload: ours only if the address names this game's source.
        const linked = parseViewerUrl(window.location.search)?.source ?? null;
        const { origin: current } = latest.current;
        if (current === null || !sameLinkSource(linked, current)) {
          return;
        }
        target = entry(state, state.pov, 0);
        stack.current = [target];
        index.current = 0;
        write("replace", target, urlFor(target));
      }
      syncBack();
      latest.current.onRestore({ round: target.round, step: target.step }, target.pov);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [sid, entry, syncBack, urlFor]);

  // The mouse back and forward buttons navigate on release: write the waiting entry first. Also
  // write it before the page is hidden (a reload or a closed tab keeps the latest position).
  useEffect(() => {
    const handleDown = (event: PointerEvent) => {
      if (event.button === 3 || event.button === 4) {
        flush();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pointerdown", handleDown, true);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pointerdown", handleDown, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      // Unmounting (another game replaces this one): the old entry keeps the last position.
      flush();
    };
  }, [flush]);

  const goBack = useCallback(() => {
    if (index.current > 0) {
      flush();
      window.history.back();
    }
  }, [flush]);

  const link = useCallback(() => {
    const { origin: source, position: p, pov: seat } = latest.current;
    return viewerLink(window.location, source, p, seat);
  }, []);

  return { back, goBack, link };
}
