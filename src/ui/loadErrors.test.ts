import { describe, expect, it } from "vitest";
import { LogParseError } from "../formats/index";
import { isMahjongSoulLink, tenhouLoadError, toLoadError } from "./loadErrors";

const ID = "2000010100gm-0089-0000-0123abcd";
const PAIPU = "?paipu=190428-0f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8_a123456789";

describe("isMahjongSoulLink", () => {
  it.each([
    `https://game.mahjongsoul.com/${PAIPU}`,
    `https://mahjongsoul.game.yo-star.com/${PAIPU}`,
    `https://mahjongsoul.game.yo-star.com/kr/${PAIPU}`,
    `https://game.maj-soul.com/1/${PAIPU}`,
    `https://game.maj-soul.net/1/${PAIPU}`,
    `http://www.majsoul.com/1/${PAIPU}`,
    `maj-soul.net/1/${PAIPU}`,
    `  GAME.MAHJONGSOUL.COM/${PAIPU}\n`,
    `Game log: https://game.mahjongsoul.com/${PAIPU}`,
  ])("knows %s", (text) => {
    expect(isMahjongSoulLink(text)).toBe(true);
  });

  it.each([
    `https://tenhou.net/0/?log=${ID}`,
    "https://example.com/mahjongsoul",
    "https://notmahjongsoul.com/",
    "https://game.mahjongsoul.com.example.org/",
    "hello",
    "",
  ])("does not take %s for one", (text) => {
    expect(isMahjongSoulLink(text)).toBe(false);
  });

  it("does not search log data for a host", () => {
    const log = `{"title":["https://game.mahjongsoul.com/"],"pad":"${"x".repeat(3000)}"}`;
    expect(isMahjongSoulLink(log)).toBe(false);
  });
});

describe("toLoadError", () => {
  it("keeps the loader's error code", () => {
    expect(toLoadError(new LogParseError("invalid", "bad"), "x")).toEqual({
      code: "invalid",
      logId: null,
    });
  });

  it("adds the Tenhou log id to link errors", () => {
    const error = toLoadError(new LogParseError("urlOnly"), `https://tenhou.net/0/?log=${ID}`);
    expect(error).toEqual({ code: "urlOnly", logId: ID });
  });

  it("gives a Mahjong Soul link its own code, with or without https://", () => {
    expect(
      toLoadError(new LogParseError("urlOnly"), `https://game.mahjongsoul.com/${PAIPU}`),
    ).toEqual({ code: "mahjongSoul", logId: null });
    expect(toLoadError(new LogParseError("unrecognized"), `game.maj-soul.com/1/${PAIPU}`)).toEqual({
      code: "mahjongSoul",
      logId: null,
    });
  });

  it("keeps other errors of text that names Mahjong Soul", () => {
    expect(toLoadError(new LogParseError("invalid"), "https://game.mahjongsoul.com/")).toEqual({
      code: "invalid",
      logId: null,
    });
  });

  it("reports anything else as unexpected", () => {
    expect(toLoadError(new TypeError("boom"), null)).toEqual({ code: "unexpected", logId: null });
  });
});

describe("tenhouLoadError", () => {
  it("treats a download that is not a log as a failed download", () => {
    for (const code of ["empty", "unrecognized", "urlOnly"] as const) {
      expect(tenhouLoadError({ code, logId: null }, ID)).toEqual({
        code: "tenhouFetchFailed",
        logId: ID,
      });
    }
  });

  it("keeps errors about the log itself", () => {
    const error = { code: "unsupportedPlayers", logId: null } as const;
    expect(tenhouLoadError(error, ID)).toBe(error);
  });
});
