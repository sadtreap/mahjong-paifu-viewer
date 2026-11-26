import { afterEach, describe, expect, it, vi } from "vitest";
import { readStorage, removeStorage, storageKey, writeStorage } from "./storage";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storage", () => {
  it("namespaces keys with the app name", () => {
    expect(storageKey("locale")).toBe("mahjong-paifu-viewer:locale");
  });

  it("round-trips a value under the namespaced key", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);

    writeStorage("locale", "ja");

    expect(readStorage("locale")).toBe("ja");
    expect(storage.getItem("mahjong-paifu-viewer:locale")).toBe("ja");
    expect(storage.getItem("locale")).toBeNull();
  });

  it("returns null and does not throw when storage is unavailable", () => {
    const throwing = fakeStorage();
    throwing.getItem = () => {
      throw new Error("SecurityError");
    };
    throwing.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    vi.stubGlobal("localStorage", throwing);

    expect(readStorage("locale")).toBeNull();
    expect(() => writeStorage("locale", "ko")).not.toThrow();
  });

  it("removes a namespaced key and ignores unavailable storage", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem("showAllHands", "kept");
    writeStorage("showAllHands", "false");

    removeStorage("showAllHands");

    expect(readStorage("showAllHands")).toBeNull();
    expect(storage.getItem("showAllHands")).toBe("kept");

    storage.removeItem = () => {
      throw new Error("SecurityError");
    };
    expect(() => removeStorage("showAllHands")).not.toThrow();
  });
});
