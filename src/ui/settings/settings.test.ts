import { describe, expect, it } from "vitest";
import type { Settings } from "../viewer/types";
import {
  AUTOPLAY_SPEEDS,
  blobKind,
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
} from "./settings";

const blob = (fields: Record<string, unknown>) => JSON.stringify({ version: 3, ...fields });

describe("DEFAULT_SETTINGS", () => {
  it("has the four settings with their defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      version: 3,
      showAllHands: true,
      showWaits: true,
      charKeys: true,
      autoplaySpeed: 1,
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
    first.showWaits = false;
    expect(parseSettings(null, null).showWaits).toBe(true);
    expect(DEFAULT_SETTINGS.showWaits).toBe(true);
  });

  it.each(["", "{", "not json", "null", "42", '"settings"', "[]", "true"])(
    "ignores a blob that is not a settings object: %j",
    (raw) => {
      expect(parseSettings(raw, null)).toEqual(DEFAULT_SETTINGS);
    },
  );

  it.each([
    ["a missing version", JSON.stringify({ showWaits: false })],
    ["version 4", JSON.stringify({ version: 4, showWaits: false })],
    ["version 0", JSON.stringify({ version: 0, showWaits: false })],
    ['version "3"', JSON.stringify({ version: "3", showWaits: false })],
    ['version "2"', JSON.stringify({ version: "2", showWaits: false })],
  ])("ignores a blob with %s as a whole", (_case, raw) => {
    expect(parseSettings(raw, null)).toEqual(DEFAULT_SETTINGS);
  });

  it("reads every field of a valid blob", () => {
    const stored: Settings = {
      version: 3,
      showAllHands: false,
      showWaits: false,
      charKeys: false,
      autoplaySpeed: 4,
    };
    expect(parseSettings(JSON.stringify(stored), null)).toEqual(stored);
  });

  it("migrates a version 1 blob by keeping the four settings it shares", () => {
    const version1 = {
      version: 1,
      view: "flat",
      showAllHands: false,
      dimTsumogiri: false,
      captions: false,
      motion: false,
      showWaits: false,
      showNextDiscard: true,
      theme: "light",
      clickToStep: false,
      wheelToStep: false,
      charKeys: false,
      autoplaySpeed: 2,
      panelOpen: false,
      movesOpen: true,
      movesShowRest: true,
      hintSeen: true,
    };
    expect(parseSettings(JSON.stringify(version1), null)).toEqual({
      version: 3,
      showAllHands: false,
      showWaits: false,
      charKeys: false,
      autoplaySpeed: 2,
    });
  });

  it("migrates a version 2 blob by dropping its choice of a 3D or a flat table", () => {
    const version2 = {
      version: 2,
      view: "flat",
      showAllHands: false,
      showWaits: true,
      charKeys: false,
      autoplaySpeed: 0.5,
    };
    const settings = parseSettings(JSON.stringify(version2), null);
    expect(settings).toEqual({
      version: 3,
      showAllHands: false,
      showWaits: true,
      charKeys: false,
      autoplaySpeed: 0.5,
    });
    expect(settings).not.toHaveProperty("view");
  });

  it("falls back field by field, keeping the valid fields", () => {
    const settings = parseSettings(
      blob({ showWaits: false, charKeys: "false", showAllHands: 0, autoplaySpeed: 3 }),
      null,
    );
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, showWaits: false });
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
    const settings = parseSettings(
      blob({ charKeys: value, showAllHands: value, showWaits: value }),
      null,
    );
    expect(settings.charKeys).toBe(true);
    expect(settings.showAllHands).toBe(true);
    expect(settings.showWaits).toBe(true);
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

  it("ignores unknown fields, the removed table view among them", () => {
    const settings = parseSettings(
      blob({ language: "ko", pov: 2, view: "flat", showWaits: false }),
      null,
    );
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, showWaits: false });
    expect(settings).not.toHaveProperty("language");
    expect(settings).not.toHaveProperty("view");
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
      expect(parseSettings(blob({ showWaits: false }), "false")).toEqual({
        ...DEFAULT_SETTINGS,
        showWaits: false,
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
      autoplaySpeed: 0.5,
      showAllHands: false,
      charKeys: false,
    };
    expect(parseSettings(serializeSettings(settings), null)).toEqual(settings);
    expect(parseSettings(serializeSettings(DEFAULT_SETTINGS), null)).toEqual(DEFAULT_SETTINGS);
  });

  it("writes version 3 and only the known fields", () => {
    const extra = { ...DEFAULT_SETTINGS, pov: 2, theme: "dark", view: "flat" } as Settings;
    const json: unknown = JSON.parse(serializeSettings(extra));
    expect(json).toEqual(DEFAULT_SETTINGS);
    expect(json).toHaveProperty("version", 3);
  });

  it("writes the same text for the same settings", () => {
    const shuffled = Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).reverse(),
    ) as unknown as Settings;
    expect(serializeSettings(shuffled)).toBe(serializeSettings(DEFAULT_SETTINGS));
  });
});

describe("blobKind", () => {
  it("tells the current blob from an old one", () => {
    expect(blobKind(null)).toBe("none");
    expect(blobKind(serializeSettings(DEFAULT_SETTINGS))).toBe("current");
    expect(blobKind(blob({ charKeys: false, extra: 1 }))).toBe("current");
    expect(blobKind(JSON.stringify({ version: 1, theme: "light" }))).toBe("old");
    expect(blobKind(JSON.stringify({ version: 2, view: "flat" }))).toBe("old");
  });

  it.each([
    "",
    "{",
    "not json",
    "null",
    "[]",
    '{"version":4}',
    '{"version":"3"}',
    '{"version":"2"}',
    "{}",
  ])("does not know %j", (raw) => {
    expect(blobKind(raw)).toBe("unknown");
  });
});
