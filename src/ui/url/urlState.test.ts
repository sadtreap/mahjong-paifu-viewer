import { describe, expect, it } from "vitest";
import {
  formatViewerUrl,
  linkLogSource,
  parseViewerUrl,
  sameLinkSource,
  viewerLink,
} from "./urlState";

const ID = "2000010100gm-0089-0000-0123abcd";

describe("parseViewerUrl", () => {
  it("maps the 1-based round, step and pov of a sample link to 0-based values", () => {
    expect(parseViewerUrl("?sample=tenhou-json&round=2&step=5&pov=3")).toEqual({
      source: { kind: "sample", id: "tenhou-json" },
      start: { round: 1, step: 4, pov: 2 },
    });
    expect(parseViewerUrl("sample=sanma")).toEqual({
      source: { kind: "sample", id: "sanma" },
      start: { round: 0, step: 0, pov: null },
    });
  });

  it("reads a Tenhou log id", () => {
    expect(parseViewerUrl(`?tenhou=${ID}&round=3&pov=1`)).toEqual({
      source: { kind: "tenhou", logId: ID },
      start: { round: 2, step: 0, pov: 0 },
    });
  });

  it("leaves clamping to the viewer, which knows the game", () => {
    expect(parseViewerUrl("?sample=tenhou-json&round=99&step=999")?.start).toEqual({
      round: 98,
      step: 998,
      pov: null,
    });
    expect(parseViewerUrl("?sample=tenhou-json&round=0&step=-3")?.start).toEqual({
      round: -1,
      step: -4,
      pov: null,
    });
  });

  it("treats invalid numbers as missing", () => {
    expect(parseViewerUrl("?sample=tenhou-json&round=two&step=1.5&pov=")?.start).toEqual({
      round: 0,
      step: 0,
      pov: null,
    });
  });

  it("ignores a pov outside the four seats", () => {
    expect(parseViewerUrl("?sample=tenhou-json&pov=0")?.start.pov).toBeNull();
    expect(parseViewerUrl("?sample=tenhou-json&pov=5")?.start.pov).toBeNull();
    expect(parseViewerUrl("?sample=tenhou-json&pov=4")?.start.pov).toBe(3);
  });

  it("returns null for an unknown sample, an invalid Tenhou id or no source", () => {
    expect(parseViewerUrl("?sample=nope&round=2")).toBeNull();
    expect(parseViewerUrl("?sample=toString")).toBeNull();
    expect(parseViewerUrl("?tenhou=2000010100gm-0089")).toBeNull();
    expect(parseViewerUrl(`?tenhou=x${ID}`)).toBeNull();
    expect(parseViewerUrl(`?tenhou=${ID}&evil=1`)?.source).toEqual({ kind: "tenhou", logId: ID });
    expect(parseViewerUrl("?round=2&step=3")).toBeNull();
    expect(parseViewerUrl("")).toBeNull();
  });

  it("prefers a known sample when both sources are given", () => {
    expect(parseViewerUrl(`?tenhou=${ID}&sample=sanma`)?.source).toEqual({
      kind: "sample",
      id: "sanma",
    });
    expect(parseViewerUrl(`?tenhou=${ID}&sample=nope`)?.source).toEqual({
      kind: "tenhou",
      logId: ID,
    });
  });
});

describe("formatViewerUrl", () => {
  const p = { round: 1, step: 4 };

  it("writes 1-based parameters for a sample or a Tenhou log", () => {
    expect(formatViewerUrl("", { kind: "sample", id: "sanma" }, p, 2)).toBe(
      "?sample=sanma&round=2&step=5&pov=3",
    );
    expect(formatViewerUrl("", { kind: "tenhou", logId: ID }, p, 0)).toBe(
      `?tenhou=${ID}&round=2&step=5&pov=1`,
    );
  });

  it("replaces the viewer's old parameters and keeps unrelated ones", () => {
    expect(
      formatViewerUrl(
        "?lang=ja&sample=tenhou-json&round=9&step=9&pov=4&utm=x",
        { kind: "sample", id: "sanma" },
        p,
        1,
      ),
    ).toBe("?sample=sanma&round=2&step=5&pov=2&lang=ja&utm=x");
  });

  it("strips the viewer's parameters for a local log", () => {
    expect(formatViewerUrl("?sample=tenhou-json&round=2&lang=ko", null, p, 0)).toBe("?lang=ko");
    expect(formatViewerUrl(`?tenhou=${ID}&step=3&pov=1`, null, p, 0)).toBe("");
    expect(formatViewerUrl("", null, p, 0)).toBe("");
  });

  it("round-trips through parseViewerUrl", () => {
    const search = formatViewerUrl("?x=1", { kind: "tenhou", logId: ID }, { round: 4, step: 0 }, 3);
    expect(parseViewerUrl(search)).toEqual({
      source: { kind: "tenhou", logId: ID },
      start: { round: 4, step: 0, pov: 3 },
    });
  });
});

describe("link helpers", () => {
  it("compares link sources", () => {
    expect(sameLinkSource({ kind: "sample", id: "sanma" }, { kind: "sample", id: "sanma" })).toBe(
      true,
    );
    expect(
      sameLinkSource({ kind: "sample", id: "sanma" }, { kind: "sample", id: "tenhou-json" }),
    ).toBe(false);
    expect(sameLinkSource({ kind: "tenhou", logId: ID }, { kind: "tenhou", logId: ID })).toBe(true);
    expect(sameLinkSource({ kind: "tenhou", logId: ID }, null)).toBe(false);
    expect(sameLinkSource(null, null)).toBe(true);
  });

  it("loads a sample from its URL and a Tenhou id as pasted text", () => {
    expect(linkLogSource({ kind: "sample", id: "sanma" })).toEqual({
      kind: "url",
      url: expect.stringMatching(/samples\/sanma\.json$/),
    });
    expect(linkLogSource({ kind: "tenhou", logId: ID })).toEqual({ kind: "text", text: ID });
  });

  it("builds an absolute link, or none for a local log", () => {
    const location = {
      origin: "https://example.github.io",
      pathname: "/mahjong-paifu-viewer/",
      search: "?lang=en",
      hash: "",
    };
    expect(
      viewerLink(location, { kind: "sample", id: "tenhou-json" }, { round: 0, step: 9 }, 1),
    ).toBe(
      "https://example.github.io/mahjong-paifu-viewer/?sample=tenhou-json&round=1&step=10&pov=2&lang=en",
    );
    expect(viewerLink(location, null, { round: 0, step: 9 }, 1)).toBeNull();
  });
});
