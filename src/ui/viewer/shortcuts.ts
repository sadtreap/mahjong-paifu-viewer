import type { Seat } from "../../core/model";
import type { Messages } from "../../i18n/messages";
import type { KeyCommand } from "./commands";

/**
 * How a binding recognizes a key press: by `key` (lower-cased when it is one character), by
 * `code`, or by `fallbackCode` when the key is not printable ASCII (an IME typed Hangul or kana).
 * `shift` must equal the Shift state when set; any Shift state matches when it is undefined.
 */
export interface KeyMatch {
  key?: readonly string[];
  code?: readonly string[];
  fallbackCode?: string;
  shift?: boolean;
}

export interface ShortcutBinding {
  /** The key as the help and the tooltips show it, e.g. "Shift+→" (key names stay untranslated). */
  display: string;
  match: KeyMatch;
  command: KeyCommand;
}

/**
 * One line of the keyboard help: the keys of one action or of a forward / backward pair. The
 * table drives both `keyCommand()` and the help dialog, so the two cannot disagree.
 */
export interface ShortcutRow {
  /** Stable id, the `help` message key of the label. */
  id: keyof Messages["help"];
  /** Display strings of the bindings, in order. */
  keys: readonly string[];
  /** The row's first (forward) command. */
  command: KeyCommand;
  bindings: readonly ShortcutBinding[];
  /** A character key (letter, digit, punctuation or Space): off with the `charKeys` setting. */
  charKey: boolean;
  label: (m: Messages) => string;
}

const nav = (command: Extract<KeyCommand, { type: "nav" }>["command"]): KeyCommand => ({
  type: "nav",
  command,
});

function row(
  id: ShortcutRow["id"],
  charKey: boolean,
  bindings: readonly ShortcutBinding[],
): ShortcutRow {
  const first = bindings[0];
  if (!first) {
    throw new Error(`Shortcut row ${id} has no binding`);
  }
  return {
    id,
    keys: bindings.map((binding) => binding.display),
    command: first.command,
    bindings,
    charKey,
    label: (m) => m.help[id],
  };
}

const SEATS_1_TO_4: readonly Seat[] = [0, 1, 2, 3];

const letter = (char: string, shift?: boolean): KeyMatch => ({
  key: [char],
  fallbackCode: `Key${char.toUpperCase()}`,
  shift,
});

/** The keyboard map, in help order. */
export const SHORTCUTS: readonly ShortcutRow[] = [
  row("step", false, [
    {
      display: "→",
      match: { key: ["ArrowRight"], shift: false },
      command: nav({ kind: "step", dir: 1 }),
    },
    {
      display: "←",
      match: { key: ["ArrowLeft"], shift: false },
      command: nav({ kind: "step", dir: -1 }),
    },
  ]),
  row("ownTurn", false, [
    {
      display: "Shift+→",
      match: { key: ["ArrowRight"], shift: true },
      command: nav({ kind: "ownTurn", dir: 1 }),
    },
    {
      display: "Shift+←",
      match: { key: ["ArrowLeft"], shift: true },
      command: nav({ kind: "ownTurn", dir: -1 }),
    },
  ]),
  row("nextRound", false, [
    { display: "↓", match: { key: ["ArrowDown"] }, command: nav({ kind: "nextRound" }) },
  ]),
  row("roundStart", false, [
    { display: "↑", match: { key: ["ArrowUp"] }, command: nav({ kind: "roundStartOrPrev" }) },
  ]),
  row("roundEnds", false, [
    { display: "Home", match: { key: ["Home"] }, command: nav({ kind: "roundStart" }) },
    { display: "End", match: { key: ["End"] }, command: nav({ kind: "roundEnd" }) },
  ]),
  row("autoplay", true, [
    {
      display: "Space",
      match: { key: [" ", "Spacebar"], fallbackCode: "Space" },
      command: { type: "togglePlay" },
    },
  ]),
  row("speed", true, [
    {
      display: "+",
      match: { key: ["+", "="], code: ["NumpadAdd"] },
      command: { type: "speed", delta: 1 },
    },
    {
      display: "−",
      match: { key: ["-"], code: ["NumpadSubtract"], fallbackCode: "Minus" },
      command: { type: "speed", delta: -1 },
    },
  ]),
  row(
    "seat",
    true,
    SEATS_1_TO_4.map((seat) => ({
      display: String(seat + 1),
      match: { code: [`Digit${seat + 1}`, `Numpad${seat + 1}`] },
      command: { type: "pov", seat },
    })),
  ),
  row("cycleSeat", true, [
    { display: "V", match: letter("v", false), command: { type: "cyclePov", delta: 1 } },
    { display: "Shift+V", match: letter("v", true), command: { type: "cyclePov", delta: -1 } },
  ]),
  row("hands", true, [{ display: "H", match: letter("h"), command: { type: "toggleHands" } }]),
  row("waits", true, [{ display: "W", match: letter("w"), command: { type: "toggleWaits" } }]),
  row("scoreDiff", true, [
    { display: "D", match: letter("d"), command: { type: "toggleScoreDiff" } },
  ]),
  row("helpKey", true, [{ display: "?", match: { key: ["?"] }, command: { type: "help" } }]),
  row("escape", false, [
    { display: "Esc", match: { key: ["Escape", "Esc"] }, command: { type: "escape" } },
  ]),
];

/** Built on first use: the transport asks for its tooltips on every render. */
let keysByCommand: Map<string, string> | null = null;

/** The keys of a row's binding for a command, for tooltips (`tools.withKey(label, key)`). */
export function shortcutKey(command: KeyCommand): string | null {
  if (!keysByCommand) {
    keysByCommand = new Map();
    for (const shortcut of SHORTCUTS) {
      for (const binding of shortcut.bindings) {
        const id = JSON.stringify(binding.command);
        if (!keysByCommand.has(id)) {
          keysByCommand.set(id, binding.display);
        }
      }
    }
  }
  return keysByCommand.get(JSON.stringify(command)) ?? null;
}

/** The keys of a row as the help shows them, e.g. ["V", "Shift+V"]. */
export function shortcutKeys(id: ShortcutRow["id"]): readonly string[] {
  return SHORTCUTS.find((row) => row.id === id)?.keys ?? [];
}

/** The mouse and touch sections of the help, in order (they have no key bindings). */
export const MOUSE_HELP: readonly ((m: Messages) => string)[] = [
  (m) => m.help.click,
  (m) => m.help.rightClick,
  (m) => m.help.wheel,
  (m) => m.help.shift,
  (m) => m.help.hold,
  (m) => m.help.hover,
  (m) => m.help.altClick,
  (m) => m.help.console,
];

export const TOUCH_HELP: readonly ((m: Messages) => string)[] = [
  (m) => m.help.tap,
  (m) => m.help.swipe,
  (m) => m.help.longPress,
  (m) => m.help.tapConsole,
];
