// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { TileImage } from "./TileImage";

const css = readFileSync("src/ui/TileImage.module.css", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ");

const depthOf = (el: HTMLElement) => [
  el.style.getPropertyValue("--zx"),
  el.style.getPropertyValue("--zy"),
];

afterEach(cleanup);

describe("TileImage depth (paint order of lying tiles on the 3D table)", () => {
  it("puts the column and row on an upright tile, next to its tile body", () => {
    render(
      <I18nProvider>
        <TileImage tile="3m" depth={[2, 1]} />
      </I18nProvider>,
    );
    const img = screen.getByRole("img");
    expect(depthOf(img)).toEqual(["2", "1"]);
    expect(img.style.backgroundImage).toContain("url(");
  });

  it("puts them on a sideways tile's wrapper, which carries its box and thickness", () => {
    render(
      <I18nProvider>
        <TileImage tile="3m" sideways depth={[4, -1]} />
      </I18nProvider>,
    );
    const img = screen.getByRole("img");
    expect(depthOf(img)).toEqual(["", ""]);
    expect(depthOf(img.parentElement as HTMLElement)).toEqual(["4", "-1"]);
  });

  it("leaves tiles without depth in document order", () => {
    render(
      <I18nProvider>
        <TileImage tile="3m" />
        <TileImage tile="4m" sideways />
      </I18nProvider>,
    );
    for (const img of screen.getAllByRole("img")) {
      expect(depthOf(img)).toEqual(["", ""]);
      expect(depthOf(img.parentElement as HTMLElement)).toEqual(["", ""]);
    }
  });

  it("orders by the seat layer's camera direction, only on the 3D table", () => {
    const rule = /\[data-thick\] \.depth \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/position: relative/);
    expect(rule).toMatch(
      /z-index: calc\(100 \+ var\(--dx, 0\) \* var\(--zx, 0\) \+ var\(--dy, 1\) \* var\(--zy, 0\)\)/,
    );
    expect(css).not.toMatch(/(^|\}) ?\.depth \{/);
  });
});
