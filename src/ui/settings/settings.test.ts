import { describe, expect, it } from "vitest";
import type { Settings } from "../viewer/types";
import { AUTOPLAY_SPEEDS, DEFAULT_SETTINGS, parseSettings, serializeSettings } from "./settings";

const blob = (fields: Record<string, unknown>) => JSON.stringify({ version: 1, ...fields });

describe("DEFAULT_SETTINGS", () => {
  it("matches the spec's defaults, with the spoilers off", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      version: 1,
      view: "3d",
      showAllHands: true,
      dimTsumogiri: true,
      captions: true,
      motion: true,
      showWaits: true,
      showNextDiscard: false,
      theme: "system",
      clickToStep: true,
      wheelToStep: true,
      charKeys: true,
      autoplaySpeed: 1,
      panelOpen: true,
      movesOpen: false,
      movesShowRest: false,
      hintSeen: false,
    } satisfies Settings);
  });

  it("cannot be changed by accident", () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });
});

describe("parseSettings", () => {
  it("gives the defaults when nothing is stored", () => {
    expect(parseSettings(null, null)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns a fresh object every time", () => {
    const first = parseSettings(null, null);
    first.motion = false;
    expect(parseSettings(null, null).motion).toBe(true);
    expect(DEFAULT_SETTINGS.motion).toBe(true);
  });

  it.each(["", "{", "not json", "null", "42", '"settings"', "[]", "true"])(
    "ignores a blob that is not a settings object: %j",
    (raw) => {
      expect(parseSettings(raw, null)).toEqual(DEFAULT_SETTINGS);
    },
  );

  it.each([
    ["a missing version", JSON.stringify({ motion: false })],
    ["version 2", JSON.stringify({ version: 2, motion: false })],
    ["version 0", JSON.stringify({ version: 0, motion: false })],
    ['version "1"', JSON.stringify({ version: "1", motion: false })],
  ])("ignores a blob with %s as a whole", (_case, raw) => {
    expect(parseSettings(raw, null)).toEqual(DEFAULT_SETTINGS);
  });

  it("reads every field of a valid blob", () => {
    const stored: Settings = {
      version: 1,
      view: "flat",
      showAllHands: false,
      dimTsumogiri: false,
      captions: false,
      motion: false,
      showWaits: false,
      showNextDiscard: true,
      theme: "dark",
      clickToStep: false,
      wheelToStep: false,
      charKeys: false,
      autoplaySpeed: 4,
      panelOpen: false,
      movesOpen: true,
      movesShowRest: true,
      hintSeen: true,
    };
    expect(parseSettings(JSON.stringify(stored), null)).toEqual(stored);
  });

  it("falls back field by field, keeping the valid fields", () => {
    const settings = parseSettings(
      blob({ motion: false, captions: "false", view: "iso", theme: "light", autoplaySpeed: 3 }),
      null,
    );
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, motion: false, theme: "light" });
  });

  it.each([
    ["0", "0"],
    ['"0"', "0"],
    ['"false"', "false"],
    ['"true"', "true"],
    ["1", 1],
    ["null", null],
    ["an object", {}],
  ])("accepts only JSON booleans as booleans, not %s", (_case, value) => {
    const settings = parseSettings(blob({ clickToStep: value, hintSeen: value }), null);
    expect(settings.clickToStep).toBe(true);
    expect(settings.hintSeen).toBe(false);
  });

  it.each([
    ['"2"', "2"],
    ["0.75", 0.75],
    ["0", 0],
    ["null", null],
  ])("rejects the autoplay speed %s", (_case, value) => {
    expect(parseSettings(blob({ autoplaySpeed: value }), null).autoplaySpeed).toBe(1);
  });

  it.each(AUTOPLAY_SPEEDS)("accepts the autoplay speed %s", (speed) => {
    expect(parseSettings(blob({ autoplaySpeed: speed }), null).autoplaySpeed).toBe(speed);
  });

  it("ignores unknown fields", () => {
    const settings = parseSettings(blob({ language: "ko", pov: 2, motion: false }), null);
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, motion: false });
    expect(settings).not.toHaveProperty("language");
  });

  describe("migrating the old showAllHands flag", () => {
    it.each([
      ["false", false],
      ["true", true],
    ])('reads "%s" when there is no blob', (legacy, expected) => {
      expect(parseSettings(null, legacy).showAllHands).toBe(expected);
    });

    it.each(["0", "", "False", "no", "1"])("ignores the value %j", (legacy) => {
      expect(parseSettings(null, legacy).showAllHands).toBe(true);
    });

    it("applies when the blob is broken or does not set the field", () => {
      expect(parseSettings("{", "false").showAllHands).toBe(false);
      expect(parseSettings(blob({ motion: false }), "false")).toEqual({
        ...DEFAULT_SETTINGS,
        motion: false,
        showAllHands: false,
      });
    });

    it("loses to the blob's own value", () => {
      expect(parseSettings(blob({ showAllHands: true }), "false").showAllHands).toBe(true);
      expect(parseSettings(blob({ showAllHands: false }), "true").showAllHands).toBe(false);
    });
  });
});

describe("serializeSettings", () => {
  it("round-trips through parseSettings", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      view: "flat",
      theme: "light",
      autoplaySpeed: 0.5,
      showNextDiscard: true,
      movesShowRest: true,
      hintSeen: true,
    };
    expect(parseSettings(serializeSettings(settings), null)).toEqual(settings);
    expect(parseSettings(serializeSettings(DEFAULT_SETTINGS), null)).toEqual(DEFAULT_SETTINGS);
  });

  it("writes version 1 and only the known fields", () => {
    const extra = { ...DEFAULT_SETTINGS, pov: 2 } as Settings;
    const json: unknown = JSON.parse(serializeSettings(extra));
    expect(json).toEqual(DEFAULT_SETTINGS);
  });

  it("writes the same text for the same settings", () => {
    const shuffled = Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).reverse(),
    ) as unknown as Settings;
    expect(serializeSettings(shuffled)).toBe(serializeSettings(DEFAULT_SETTINGS));
  });
});
