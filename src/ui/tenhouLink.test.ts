import { describe, expect, it } from "vitest";
import { findTenhouLogId, tenhouLinkLogId, tenhouLinkStart, tenhouLogDataUrl } from "./tenhouLink";

const ID = "2000010100gm-0089-0000-0123abcd";

describe("findTenhouLogId", () => {
  it("finds the log id in a viewer link", () => {
    expect(findTenhouLogId(`https://tenhou.net/0/?log=${ID}&tw=2`)).toBe(ID);
  });

  it("returns null without an id", () => {
    expect(findTenhouLogId("https://example.com/")).toBeNull();
  });
});

describe("tenhouLinkLogId", () => {
  it("accepts replay links, links without a scheme and bare ids", () => {
    expect(tenhouLinkLogId(`https://tenhou.net/0/?log=${ID}&tw=2`)).toBe(ID);
    expect(tenhouLinkLogId(`http://tenhou.net/3/?log=${ID}`)).toBe(ID);
    expect(tenhouLinkLogId(`tenhou.net/0/?log=${ID}&tw=1&ts=3`)).toBe(ID);
    expect(tenhouLinkLogId(`  ${ID}\r\n`)).toBe(ID);
  });

  it("ignores log data that mentions an id and tenhou.net/6 links with the log inside", () => {
    expect(tenhouLinkLogId(`{"title":["",""],"ref":"${ID}","log":[]}`)).toBeNull();
    expect(tenhouLinkLogId(`<mjloggm ver="2.3"><SHUFFLE seed="${ID}"/></mjloggm>`)).toBeNull();
    expect(tenhouLinkLogId(`https://tenhou.net/6/#json={"ref":"${ID}"}`)).toBeNull();
    expect(tenhouLinkLogId(`log ${ID} and more`)).toBeNull();
  });

  it("ignores links without a Tenhou log id", () => {
    expect(tenhouLinkLogId("https://game.mahjongsoul.com/?paipu=230101-0123abcd")).toBeNull();
    expect(tenhouLinkLogId("")).toBeNull();
  });
});

describe("tenhouLogDataUrl", () => {
  it("points at the mjlog XML without the viewer's other parameters", () => {
    expect(tenhouLogDataUrl(ID)).toBe(`https://tenhou.net/0/log/?${ID}`);
  });
});

describe("tenhouLinkStart", () => {
  it("reads the seat (tw) and the 0-based round (ts) of a replay link", () => {
    expect(tenhouLinkStart(`https://tenhou.net/0/?log=${ID}&tw=2&ts=3`)).toEqual({
      pov: 2,
      round: 3,
    });
    expect(tenhouLinkStart(`tenhou.net/0/?log=${ID}&ts=0&tw=0`)).toEqual({ pov: 0, round: 0 });
    expect(tenhouLinkStart(`https://tenhou.net/3/?log=${ID}&tw=1`)).toEqual({
      pov: 1,
      round: null,
    });
  });

  it("gives null for missing, out-of-range or malformed values", () => {
    expect(tenhouLinkStart(`https://tenhou.net/0/?log=${ID}`)).toEqual({ pov: null, round: null });
    expect(tenhouLinkStart(`https://tenhou.net/0/?log=${ID}&tw=4&ts=1000`)).toEqual({
      pov: null,
      round: null,
    });
    expect(tenhouLinkStart(`https://tenhou.net/0/?log=${ID}&tw=-1&ts=1.5`)).toEqual({
      pov: null,
      round: null,
    });
    expect(tenhouLinkStart(`https://tenhou.net/0/?log=${ID}&xtw=2&tsx=3`)).toEqual({
      pov: null,
      round: null,
    });
  });

  it("gives null for text that is not a Tenhou link", () => {
    expect(tenhouLinkStart(ID)).toEqual({ pov: null, round: null });
    expect(tenhouLinkStart(`{"ref":"${ID}","tw":2}`)).toEqual({ pov: null, round: null });
    expect(tenhouLinkStart("https://example.com/?tw=2&ts=1")).toEqual({ pov: null, round: null });
  });
});
