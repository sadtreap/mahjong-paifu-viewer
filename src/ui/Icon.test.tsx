// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ICON_NAMES, Icon } from "./Icon";

afterEach(cleanup);

/** Path commands and numbers only, every number finite and short (no float noise). */
const VALID_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;

describe("Icon", () => {
  it("has every icon the viewer uses", () => {
    expect(ICON_NAMES).toEqual(
      expect.arrayContaining([
        "prevRound",
        "nextRound",
        "prevStep",
        "nextStep",
        "prevTurn",
        "nextTurn",
        "play",
        "pause",
        "open",
        "close",
        "alert",
        "globe",
      ]),
    );
  });

  it.each(ICON_NAMES)("draws %s as a decorative 24-unit SVG", (name) => {
    const { container } = render(<Icon name={name} className="ico" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("class")).toBe("ico");
    const paths = [...container.querySelectorAll("path")];
    expect(paths.length).toBeGreaterThan(0);
    for (const element of paths) {
      const d = element.getAttribute("d") ?? "";
      expect(d).toMatch(VALID_PATH);
      expect(d).not.toMatch(/\d\.\d{4,}/);
      // Every part is painted somehow.
      expect(
        element.getAttribute("fill") !== "none" || element.getAttribute("stroke") !== "none",
      ).toBe(true);
    }
  });

  it("fills the play and pause glyphs", () => {
    for (const name of ["play", "pause"] as const) {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
      cleanup();
    }
  });
});
