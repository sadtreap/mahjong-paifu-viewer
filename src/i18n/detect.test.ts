import { describe, expect, it } from "vitest";
import { matchLocale, resolveInitialLocale } from "./detect";

describe("matchLocale", () => {
  it("matches a region-tagged language by its primary subtag", () => {
    expect(matchLocale(["ko-KR", "en-US"])).toBe("ko");
  });

  it("skips unsupported languages and takes the first supported one", () => {
    expect(matchLocale(["fr-FR", "de", "ja"])).toBe("ja");
  });

  it("is case-insensitive", () => {
    expect(matchLocale(["JA-jp"])).toBe("ja");
  });

  it("falls back to English when nothing matches", () => {
    expect(matchLocale(["zh-CN"])).toBe("en");
    expect(matchLocale([])).toBe("en");
  });
});

describe("resolveInitialLocale", () => {
  it("prefers a valid stored locale over browser languages", () => {
    expect(resolveInitialLocale("ja", ["ko-KR"])).toBe("ja");
  });

  it("ignores an invalid stored value", () => {
    expect(resolveInitialLocale("xx", ["ko-KR"])).toBe("ko");
    expect(resolveInitialLocale(null, ["ko-KR"])).toBe("ko");
  });
});
