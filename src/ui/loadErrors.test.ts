import { describe, expect, it } from "vitest";
import { LogParseError } from "../formats/index";
import { tenhouLoadError, toLoadError } from "./loadErrors";

const ID = "2000010100gm-0089-0000-0123abcd";

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
