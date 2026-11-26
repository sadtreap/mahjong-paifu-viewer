import type { Seat } from "../../core/model";
import { AUTOPLAY_SPEEDS } from "../settings/settings";
import { type KeyMatch, SHORTCUTS } from "./shortcuts";
import type { AutoplaySpeed, NavCommand, NavSource } from "./types";

/** What a key press asks the viewer to do. */
export type KeyCommand =
  | { type: "nav"; command: NavCommand }
  | { type: "pov"; seat: Seat }
  | { type: "cyclePov"; delta: 1 | -1 }
  | { type: "togglePlay" }
  | { type: "speed"; delta: 1 | -1 }
  | { type: "toggleHands" }
  | { type: "toggleView" }
  | { type: "rounds" }
  | { type: "help" }
  | { type: "back" }
  | { type: "escape" };

export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "code" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
>;

/** A printable ASCII key value: what a Latin layout types. Anything else (an IME's Hangul or kana) falls back to the key's code. */
function isAscii(key: string): boolean {
  return key.length === 1 && key >= " " && key <= "~";
}

function matches(match: KeyMatch, event: KeyEventLike): boolean {
  if (match.shift !== undefined && match.shift !== event.shiftKey) {
    return false;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return (
    (match.key?.includes(key) ?? false) ||
    (match.code?.includes(event.code) ?? false) ||
    (match.fallbackCode !== undefined && !isAscii(event.key) && event.code === match.fallbackCode)
  );
}

/**
 * The viewer command for a key press, or null. Presses with Ctrl, Cmd or Alt held are never ours
 * (Alt+← stays the browser's Back). With `charKeys` off (WCAG 2.1.4) only the arrows, Home, End,
 * Backspace and Esc remain. Digits match by `code`, so they work on any layout and with Shift;
 * letters and punctuation fall back to `code` when an IME types something else (Hangul, kana).
 */
export function keyCommand(event: KeyEventLike, options: { charKeys: boolean }): KeyCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  for (const row of SHORTCUTS) {
    if (row.charKey && !options.charKeys) {
      continue;
    }
    for (const binding of row.bindings) {
      if (matches(binding.match, event)) {
        return binding.command;
      }
    }
  }
  return null;
}

/** Where a navigation came from. Each input maps to a nav source, which decides the hard stops. */
export type InputKind =
  | "click"
  | "tap"
  | "swipe"
  | "hold"
  | "key"
  | "keyRepeat"
  | "wheel"
  | "wheelBurst"
  | "button"
  | "buttonHold"
  | "menu"
  | "autoplay";

/**
 * Fresh single inputs are "user" (they cross round ends); held, auto-repeated and burst inputs are
 * "repeat" (they stop at a round's last step and at step 0); autoplay is its own source.
 */
export function navSource(kind: InputKind): NavSource {
  switch (kind) {
    case "hold":
    case "keyRepeat":
    case "wheelBurst":
    case "buttonHold":
      return "repeat";
    case "autoplay":
      return "autoplay";
    default:
      return "user";
  }
}

/** The next autoplay speed up or down (+ / −), stopping at 0.5× and 4×. */
export function stepSpeed(speed: AutoplaySpeed, delta: 1 | -1): AutoplaySpeed {
  const index = AUTOPLAY_SPEEDS.indexOf(speed);
  const next = Math.min(Math.max((index < 0 ? 1 : index) + delta, 0), AUTOPLAY_SPEEDS.length - 1);
  return AUTOPLAY_SPEEDS[next] ?? speed;
}

/** The speed button's next value: 0.5× → 1× → 2× → 4× → 0.5×. */
export function cycleSpeed(speed: AutoplaySpeed): AutoplaySpeed {
  const index = AUTOPLAY_SPEEDS.indexOf(speed);
  return AUTOPLAY_SPEEDS[(index + 1) % AUTOPLAY_SPEEDS.length] ?? 1;
}

export interface EscapeContext {
  menuOpen: boolean;
  sheetOpen: boolean;
  coach: boolean;
  /** The result card is showing (at a result step and not hidden). */
  resultShown: boolean;
  picked: boolean;
  playing: boolean;
}

export type EscapeAction =
  | "closeMenu"
  | "closeSheet"
  | "dismissCoach"
  | "hideResult"
  | "clearPick"
  | "pause";

/**
 * What Esc does, in order: close the ⋯ menu or the sheet; otherwise dismiss the coach mark;
 * otherwise hide the result card; otherwise clear a sticky tile pick; otherwise pause autoplay.
 */
export function escapeAction(context: EscapeContext): EscapeAction | null {
  if (context.menuOpen) {
    return "closeMenu";
  }
  if (context.sheetOpen) {
    return "closeSheet";
  }
  if (context.coach) {
    return "dismissCoach";
  }
  if (context.resultShown) {
    return "hideResult";
  }
  if (context.picked) {
    return "clearPick";
  }
  return context.playing ? "pause" : null;
}
