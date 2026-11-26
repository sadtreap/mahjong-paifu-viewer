import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { ja } from "../../i18n/messages/ja";
import { ko } from "../../i18n/messages/ko";
import {
  cycleSpeed,
  type EscapeContext,
  escapeAction,
  type KeyEventLike,
  keyCommand,
  stepSpeed,
} from "./commands";
import { MOUSE_HELP, SHORTCUTS, shortcutKey, TOUCH_HELP } from "./shortcuts";

function key(value: string, extra: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key: value,
    code: "",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  };
}
const on = { charKeys: true };
const off = { charKeys: false };

describe("keyCommand", () => {
  it("maps the whole keyboard table", () => {
    expect(keyCommand(key("ArrowRight"), on)).toEqual({
      type: "nav",
      command: { kind: "step", dir: 1 },
    });
    expect(keyCommand(key("ArrowLeft"), on)).toEqual({
      type: "nav",
      command: { kind: "step", dir: -1 },
    });
    expect(keyCommand(key("ArrowRight", { shiftKey: true }), on)).toEqual({
      type: "nav",
      command: { kind: "ownTurn", dir: 1 },
    });
    expect(keyCommand(key("ArrowLeft", { shiftKey: true }), on)).toEqual({
      type: "nav",
      command: { kind: "ownTurn", dir: -1 },
    });
    expect(keyCommand(key("."), on)).toEqual({
      type: "nav",
      command: { kind: "keyMoment", dir: 1 },
    });
    expect(keyCommand(key(","), on)).toEqual({
      type: "nav",
      command: { kind: "keyMoment", dir: -1 },
    });
    expect(keyCommand(key("ArrowDown"), on)).toEqual({
      type: "nav",
      command: { kind: "nextRound" },
    });
    expect(keyCommand(key("ArrowUp"), on)).toEqual({
      type: "nav",
      command: { kind: "roundStartOrPrev" },
    });
    expect(keyCommand(key("Home"), on)).toEqual({ type: "nav", command: { kind: "roundStart" } });
    expect(keyCommand(key("End"), on)).toEqual({ type: "nav", command: { kind: "roundEnd" } });
    expect(keyCommand(key("Backspace"), on)).toEqual({ type: "back" });
    expect(keyCommand(key(" ", { code: "Space" }), on)).toEqual({ type: "togglePlay" });
    expect(keyCommand(key("+", { shiftKey: true }), on)).toEqual({ type: "speed", delta: 1 });
    expect(keyCommand(key("="), on)).toEqual({ type: "speed", delta: 1 });
    expect(keyCommand(key("-"), on)).toEqual({ type: "speed", delta: -1 });
    expect(keyCommand(key("v"), on)).toEqual({ type: "cyclePov", delta: 1 });
    expect(keyCommand(key("V", { shiftKey: true }), on)).toEqual({ type: "cyclePov", delta: -1 });
    expect(keyCommand(key("h"), on)).toEqual({ type: "toggleHands" });
    expect(keyCommand(key("c"), on)).toEqual({ type: "toggleView" });
    expect(keyCommand(key("r"), on)).toEqual({ type: "rounds" });
    expect(keyCommand(key("Escape"), on)).toEqual({ type: "escape" });
    expect(keyCommand(key("PageDown"), on)).toBeNull();
    expect(keyCommand(key("Enter"), on)).toBeNull();
  });

  it("reads digits by code, on any layout and with Shift", () => {
    expect(keyCommand(key("1", { code: "Digit1" }), on)).toEqual({ type: "pov", seat: 0 });
    expect(keyCommand(key("4", { code: "Numpad4" }), on)).toEqual({ type: "pov", seat: 3 });
    expect(keyCommand(key("&", { code: "Digit1", shiftKey: true }), on)).toEqual({
      type: "pov",
      seat: 0,
    });
    expect(keyCommand(key("5", { code: "Digit5" }), on)).toBeNull();
  });

  it("takes ? with Shift", () => {
    expect(keyCommand(key("?", { shiftKey: true, code: "Slash" }), on)).toEqual({ type: "help" });
  });

  it("falls back to the key's code when an IME types something else", () => {
    expect(keyCommand(key("ㅗ", { code: "KeyH" }), on)).toEqual({ type: "toggleHands" });
    expect(keyCommand(key("ㅍ", { code: "KeyV", shiftKey: true }), on)).toEqual({
      type: "cyclePov",
      delta: -1,
    });
    expect(keyCommand(key("。", { code: "Period" }), on)).toEqual({
      type: "nav",
      command: { kind: "keyMoment", dir: 1 },
    });
    // A Latin key on another position keeps its own meaning.
    expect(keyCommand(key("z", { code: "KeyH" }), on)).toBeNull();
  });

  it("ignores Ctrl, Cmd and Alt, so Alt+← stays the browser's", () => {
    expect(keyCommand(key("ArrowLeft", { altKey: true }), on)).toBeNull();
    expect(keyCommand(key("ArrowRight", { ctrlKey: true }), on)).toBeNull();
    expect(keyCommand(key("h", { metaKey: true }), on)).toBeNull();
    expect(keyCommand(key("1", { code: "Digit1", altKey: true }), on)).toBeNull();
  });

  it("keeps only the arrows, Home, End, Backspace and Esc with single-key shortcuts off", () => {
    const remaining = [
      "ArrowRight",
      "ArrowLeft",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "Backspace",
      "Escape",
    ];
    for (const value of remaining) {
      expect(keyCommand(key(value), off)).not.toBeNull();
    }
    expect(keyCommand(key("ArrowRight", { shiftKey: true }), off)).not.toBeNull();
    for (const value of [".", ",", " ", "+", "-", "v", "h", "c", "r", "?"]) {
      expect(keyCommand(key(value, { code: value === " " ? "Space" : "" }), off)).toBeNull();
    }
    expect(keyCommand(key("1", { code: "Digit1" }), off)).toBeNull();
  });
});

describe("SHORTCUTS", () => {
  it("has a help label in every locale for every row, and keys for every binding", () => {
    for (const row of SHORTCUTS) {
      for (const messages of [en, ko, ja]) {
        expect(row.label(messages).length).toBeGreaterThan(0);
      }
      expect(row.keys).toEqual(row.bindings.map((binding) => binding.display));
      expect(row.command).toEqual(row.bindings[0]?.command);
    }
    expect(SHORTCUTS.map((row) => row.id)).toEqual([
      "step",
      "ownTurn",
      "moment",
      "nextRound",
      "roundStart",
      "roundEnds",
      "back",
      "autoplay",
      "speed",
      "seat",
      "cycleSeat",
      "hands",
      "view",
      "rounds",
      "helpKey",
      "escape",
    ]);
  });

  it("marks exactly the character keys as such", () => {
    const charRows = SHORTCUTS.filter((row) => row.charKey).map((row) => row.id);
    expect(charRows).toEqual([
      "moment",
      "autoplay",
      "speed",
      "seat",
      "cycleSeat",
      "hands",
      "view",
      "rounds",
      "helpKey",
    ]);
  });

  it("gives tooltips the key of a command", () => {
    expect(shortcutKey({ type: "nav", command: { kind: "ownTurn", dir: -1 } })).toBe("Shift+←");
    expect(shortcutKey({ type: "togglePlay" })).toBe("Space");
    expect(shortcutKey({ type: "nav", command: { kind: "keyMoment", dir: 1 } })).toBe(".");
  });

  it("lists the mouse and touch help in every locale", () => {
    for (const messages of [en, ko, ja]) {
      for (const line of [...MOUSE_HELP, ...TOUCH_HELP]) {
        expect(line(messages).length).toBeGreaterThan(0);
      }
    }
    expect(MOUSE_HELP).toHaveLength(10);
    expect(TOUCH_HELP).toHaveLength(3);
  });
});

describe("speed", () => {
  it("steps up and down without wrapping, and the button cycles", () => {
    expect(stepSpeed(1, 1)).toBe(2);
    expect(stepSpeed(4, 1)).toBe(4);
    expect(stepSpeed(0.5, -1)).toBe(0.5);
    expect(stepSpeed(2, -1)).toBe(1);
    expect([0.5, 1, 2, 4].map((speed) => cycleSpeed(speed as 0.5 | 1 | 2 | 4))).toEqual([
      1, 2, 4, 0.5,
    ]);
  });
});

describe("escapeAction", () => {
  const none: EscapeContext = {
    menuOpen: false,
    sheetOpen: false,
    coach: false,
    resultShown: false,
    picked: false,
    playing: false,
  };
  it("closes, dismisses, hides, clears or pauses, in that order", () => {
    const all = {
      menuOpen: true,
      sheetOpen: true,
      coach: true,
      resultShown: true,
      picked: true,
      playing: true,
    };
    expect(escapeAction(all)).toBe("closeMenu");
    expect(escapeAction({ ...all, menuOpen: false })).toBe("closeSheet");
    expect(escapeAction({ ...all, menuOpen: false, sheetOpen: false })).toBe("dismissCoach");
    expect(escapeAction({ ...none, resultShown: true, picked: true, playing: true })).toBe(
      "hideResult",
    );
    expect(escapeAction({ ...none, picked: true, playing: true })).toBe("clearPick");
    expect(escapeAction({ ...none, playing: true })).toBe("pause");
    expect(escapeAction(none)).toBeNull();
  });
});
