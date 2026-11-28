import type { Seat } from "../../core/model";
import { AUTOPLAY_SPEEDS } from "../settings/settings";
import { type KeyMatch, SHORTCUTS } from "./shortcuts";
import type { AutoplaySpeed, NavCommand } from "./types";

/** What a key press asks the viewer to do. */
export type KeyCommand =
  | { type: "nav"; command: NavCommand }
  | { type: "pov"; seat: Seat }
  | { type: "cyclePov"; delta: 1 | -1 }
  | { type: "togglePlay" }
  | { type: "speed"; delta: 1 | -1 }
  | { type: "toggleHands" }
  | { type: "toggleWaits" }
  | { type: "toggleScoreDiff" }
  | { type: "help" }
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
 * (Alt+← stays the browser's Back). With `charKeys` off (WCAG 2.1.4) only the arrows, Home, End
 * and Esc remain. Digits match by `code`, so they work on any layout and with Shift;
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
