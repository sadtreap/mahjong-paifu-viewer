// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { LOCALES } from "../i18n/locales";
import { MESSAGES } from "../i18n/messages";
import { en, type UiErrorCode } from "../i18n/messages/en";
import { ErrorMessage } from "./ErrorMessage";
import type { LoadError } from "./loadErrors";

const ID = "2000010100gm-0089-0000-0123abcd";
const CODES = Object.keys(en.errors.codes) as UiErrorCode[];

function renderError(error: LoadError) {
  render(
    <I18nProvider>
      <ErrorMessage error={error} />
    </I18nProvider>,
  );
  return screen.getByRole("alert");
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ErrorMessage", () => {
  it.each(CODES.filter((code) => code !== "mahjongSoul"))(
    "shows %s as its sentence alone",
    (code) => {
      const alert = renderError({ code, logId: null });
      expect(alert.textContent).toBe(en.errors.codes[code]);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it.each(["tenhouFetchFailed", "urlOnly"] as const)(
    "links to the log data on tenhou.net for %s of a Tenhou log",
    (code) => {
      const alert = renderError({ code, logId: ID });
      expect(alert.textContent).toContain(en.errors.codes[code]);
      const link = screen.getByRole("link", {
        name: "Log data on tenhou.net (opens in a new tab)",
      }) as HTMLAnchorElement;
      expect(link.href).toBe(`https://tenhou.net/0/log/?${ID}`);
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noreferrer");
    },
  );

  it("links to the converter for a Mahjong Soul link", () => {
    const alert = renderError({ code: "mahjongSoul", logId: null });
    expect(alert.textContent).toContain(en.errors.codes.mahjongSoul);
    const link = screen.getByRole("link", {
      name: "tensoul on GitHub (opens in a new tab)",
    }) as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/Equim-chan/tensoul");
    expect(link.target).toBe("_blank");
  });
});

describe("error sentences", () => {
  it.each(LOCALES)("are one short message per code in %s", (locale) => {
    const { codes } = MESSAGES[locale].errors;
    expect(Object.keys(codes).sort()).toEqual([...CODES].sort());
    for (const code of CODES) {
      const text = codes[code];
      expect(text.length, code).toBeLessThanOrEqual(110);
      // One sentence in English. Korean and Japanese say "it failed. Check this." as two short
      // ones, which reads naturally where one sentence joined by "so" does not. The dot of
      // "tenhou.net" is not a stop.
      const stops = text.replace(/tenhou\.net/g, "").match(/[.。]/g) ?? [];
      expect(stops.length, code).toBeGreaterThanOrEqual(1);
      expect(stops.length, code).toBeLessThanOrEqual(locale === "en" ? 1 : 2);
      expect(text, code).toMatch(/[.。]$/);
    }
  });

  it("names Mahjong Soul and the converter in every language", () => {
    expect(MESSAGES.en.errors.codes.mahjongSoul).toMatch(/Mahjong Soul.*tensoul/);
    expect(MESSAGES.ko.errors.codes.mahjongSoul).toMatch(/작혼.*tensoul/);
    expect(MESSAGES.ja.errors.codes.mahjongSoul).toMatch(/雀魂.*tensoul/);
  });
});
