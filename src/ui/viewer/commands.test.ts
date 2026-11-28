import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { ja } from "../../i18n/messages/ja";
import { ko } from "../../i18n/messages/ko";
import { cycleSpeed, type KeyEventLike, keyCommand, stepSpeed } from "./commands";
import { MOUSE_HELP, SHORTCUTS, shortcutKey, shortcutKeys, TOUCH_HELP } from "./shortcuts";

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
    expect(keyCommand(key(" ", { code: "Space" }), on)).toEqual({ type: "togglePlay" });
    expect(keyCommand(key("+", { shiftKey: true }), on)).toEqual({ type: "speed", delta: 1 });
    expect(keyCommand(key("="), on)).toEqual({ type: "speed", delta: 1 });
    expect(keyCommand(key("-"), on)).toEqual({ type: "speed", delta: -1 });
    expect(keyCommand(key("v"), on)).toEqual({ type: "cyclePov", delta: 1 });
    expect(keyCommand(key("V", { shiftKey: true }), on)).toEqual({ type: "cyclePov", delta: -1 });
    expect(keyCommand(key("h"), on)).toEqual({ type: "toggleHands" });
    expect(keyCommand(key("w"), on)).toEqual({ type: "toggleWaits" });
    expect(keyCommand(key("d"), on)).toEqual({ type: "toggleScoreDiff" });
    expect(keyCommand(key("Escape"), on)).toEqual({ type: "escape" });
    expect(keyCommand(key("PageDown"), on)).toBeNull();
    expect(keyCommand(key("Enter"), on)).toBeNull();
  });

  it("has no command for comma, period or Backspace", () => {
    for (const value of [".", ",", "Backspace"]) {
      expect(keyCommand(key(value), on)).toBeNull();
    }
    expect(keyCommand(key("。", { code: "Period" }), on)).toBeNull();
  });

  it("has no command for C and R, the keys of the table view and the round list that are gone", () => {
    for (const value of ["c", "r"]) {
      expect(keyCommand(key(value), on)).toBeNull();
      expect(keyCommand(key(value.toUpperCase(), { shiftKey: true }), on)).toBeNull();
    }
    expect(keyCommand(key("ㅊ", { code: "KeyC" }), on)).toBeNull();
    expect(keyCommand(key("ㄱ", { code: "KeyR" }), on)).toBeNull();
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
    expect(keyCommand(key("ㅈ", { code: "KeyW" }), on)).toEqual({ type: "toggleWaits" });
    expect(keyCommand(key("ㅇ", { code: "KeyD" }), on)).toEqual({ type: "toggleScoreDiff" });
    // A Latin key on another position keeps its own meaning.
    expect(keyCommand(key("z", { code: "KeyH" }), on)).toBeNull();
  });

  it("ignores Ctrl, Cmd and Alt, so Alt+← stays the browser's", () => {
    expect(keyCommand(key("ArrowLeft", { altKey: true }), on)).toBeNull();
    expect(keyCommand(key("ArrowRight", { ctrlKey: true }), on)).toBeNull();
    expect(keyCommand(key("h", { metaKey: true }), on)).toBeNull();
    expect(keyCommand(key("1", { code: "Digit1", altKey: true }), on)).toBeNull();
  });

  it("keeps only the arrows, Home, End and Esc with single-key shortcuts off", () => {
    const remaining = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "Escape"];
    for (const value of remaining) {
      expect(keyCommand(key(value), off)).not.toBeNull();
    }
    expect(keyCommand(key("ArrowRight", { shiftKey: true }), off)).not.toBeNull();
    for (const value of [" ", "+", "-", "v", "h", "w", "d", "?"]) {
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
      "nextRound",
      "roundStart",
      "roundEnds",
      "autoplay",
      "speed",
      "seat",
      "cycleSeat",
      "hands",
      "waits",
      "scoreDiff",
      "helpKey",
      "escape",
    ]);
  });

  it("marks exactly the character keys as such", () => {
    const charRows = SHORTCUTS.filter((row) => row.charKey).map((row) => row.id);
    expect(charRows).toEqual([
      "autoplay",
      "speed",
      "seat",
      "cycleSeat",
      "hands",
      "waits",
      "scoreDiff",
      "helpKey",
    ]);
  });

  it("gives tooltips the key of a command", () => {
    expect(shortcutKey({ type: "nav", command: { kind: "ownTurn", dir: -1 } })).toBe("Shift+←");
    expect(shortcutKey({ type: "togglePlay" })).toBe("Space");
    expect(shortcutKey({ type: "nav", command: { kind: "nextRound" } })).toBe("↓");
    expect(shortcutKey({ type: "nav", command: { kind: "roundStartOrPrev" } })).toBe("↑");
    expect(shortcutKey({ type: "toggleHands" })).toBe("H");
    expect(shortcutKey({ type: "toggleScoreDiff" })).toBe("D");
    // One key per seat, in seat order: the player list's rows show them.
    expect(shortcutKeys("seat")).toEqual(["1", "2", "3", "4"]);
    expect(shortcutKeys("cycleSeat")).toEqual(["V", "Shift+V"]);
  });

  it("says of Esc only that it stops autoplay", () => {
    const esc = SHORTCUTS.find((row) => row.id === "escape");
    expect(esc?.keys).toEqual(["Esc"]);
    expect(esc?.label(en)).toBe("Stop autoplay");
  });

  it("lists the mouse and touch help in every locale", () => {
    for (const messages of [en, ko, ja]) {
      for (const line of [...MOUSE_HELP, ...TOUCH_HELP]) {
        expect(line(messages).length).toBeGreaterThan(0);
      }
    }
    expect(MOUSE_HELP.length).toBeGreaterThan(0);
    expect(TOUCH_HELP.length).toBeGreaterThan(0);
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
