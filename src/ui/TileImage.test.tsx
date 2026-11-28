// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { TileImage } from "./TileImage";

const renderTiles = (ui: ReactElement) => render(<I18nProvider>{ui}</I18nProvider>).container;

/** The classes `el` has and `plain` does not. */
const marks = (el: Element | null | undefined, plain: Element | null | undefined) => {
  const base = new Set((plain?.className ?? "").split(" "));
  return (el?.className ?? "").split(" ").filter((name) => name !== "" && !base.has(name));
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("a face-up tile", () => {
  it("is an image of its face, named and marked with its kind", () => {
    renderTiles(<TileImage tile="3m" />);
    const img = screen.getByRole("img", { name: "3 Man" });
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toMatch(/tiles\/Man3\.svg$/);
    expect(img.getAttribute("data-k")).toBe("2");
    expect(img.getAttribute("draggable")).toBe("false");
    // The body is drawn in CSS: the image carries no artwork of its own besides the face.
    expect(img.getAttribute("style")).toBeNull();
  });

  it("counts a red five as a five for the same-tile spotlight", () => {
    renderTiles(
      <>
        <TileImage tile="0p" />
        <TileImage tile="5p" />
        <TileImage tile="7z" />
      </>,
    );
    const red = screen.getByAltText("5 Pin (red)");
    expect(red.getAttribute("src")).toMatch(/tiles\/Pin5-Dora\.svg$/);
    expect(red.getAttribute("data-k")).toBe("13");
    expect(screen.getByAltText("5 Pin").getAttribute("data-k")).toBe("13");
    expect(screen.getByAltText("Chun").getAttribute("data-k")).toBe("33");
  });

  it("takes another name, and none at all as a picture others already describe", () => {
    const container = renderTiles(
      <>
        <TileImage tile="1p" label="1 Pin (just drawn)" />
        <TileImage tile="3m" label="" />
      </>,
    );
    expect(screen.getAllByRole("img").map((img) => img.getAttribute("alt"))).toEqual([
      "1 Pin (just drawn)",
    ]);
    // Still an image with its kind, as on the console's dora indicators.
    const silent = container.querySelector('img[alt=""]');
    expect(silent?.getAttribute("src")).toMatch(/tiles\/Man3\.svg$/);
    expect(silent?.getAttribute("data-k")).toBe("2");
  });
});

describe("a face-down tile", () => {
  it("is a body without artwork, which gives away nothing about the tile", () => {
    const container = renderTiles(<TileImage tile="3m" faceDown />);
    const back = screen.getByRole("img", { name: "Face-down tile" });
    expect(back.tagName).toBe("SPAN");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-k]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/Man3|3 Man|\.svg/);
  });

  it("is drawn for an unknown tile even face up, under that tile's name", () => {
    const container = renderTiles(<TileImage tile="?" />);
    const unknown = screen.getByRole("img", { name: "Unknown tile" });
    expect(unknown.tagName).toBe("SPAN");
    expect(container.querySelector("img, [data-k]")).toBeNull();
    cleanup();
    renderTiles(<TileImage tile="?" faceDown />);
    expect(screen.getByRole("img", { name: "Face-down tile" })).toBeTruthy();
  });

  it("is hidden from assistive technology with an empty label, as a back its group counts", () => {
    const container = renderTiles(<TileImage tile="3m" faceDown label="" />);
    expect(screen.queryByRole("img")).toBeNull();
    const back = container.firstElementChild;
    expect(back?.tagName).toBe("SPAN");
    expect(back?.getAttribute("aria-hidden")).toBe("true");
    expect(back?.hasAttribute("role")).toBe(false);
    expect(back?.hasAttribute("aria-label")).toBe(false);
  });

  it("takes another name", () => {
    renderTiles(<TileImage tile="5s" faceDown label="Hidden" />);
    expect(screen.getByRole("img", { name: "Hidden" }).tagName).toBe("SPAN");
  });

  it("looks different from a face, and the same whatever the tile", () => {
    const container = renderTiles(
      <>
        <TileImage tile="3m" />
        <TileImage tile="3m" faceDown />
        <TileImage tile="7z" faceDown label="" />
        <TileImage tile="?" />
      </>,
    );
    const [face, ...backs] = [...container.children];
    expect(marks(backs[0], face)).toHaveLength(1);
    expect(backs.map((back) => back.className)).toEqual(Array(3).fill(backs[0]?.className));
  });
});

describe("a tile's marks", () => {
  it("gives tsumogiri, a called discard and the last discard a class each", () => {
    const container = renderTiles(
      <>
        <TileImage tile="1m" />
        <TileImage tile="1m" dimmed />
        <TileImage tile="1m" called />
        <TileImage tile="1m" highlighted />
        <TileImage tile="1m" dimmed called highlighted />
      </>,
    );
    const [plain, dimmed, called, highlighted, all] = [...container.children];
    const each = [dimmed, called, highlighted].map((el) => marks(el, plain));
    expect(each.map((list) => list.length)).toEqual([1, 1, 1]);
    expect(new Set(each.flat()).size).toBe(3);
    expect(marks(all, plain).sort()).toEqual(each.flat().sort());
  });

  it("puts an extra class on the tile itself", () => {
    const container = renderTiles(
      <>
        <TileImage tile="1m" className="extra" />
        <TileImage tile="1m" faceDown className="extra" />
      </>,
    );
    expect([...container.children].map((el) => el.classList.contains("extra"))).toEqual([
      true,
      true,
    ]);
  });

  it("writes a pond tile's seat and index as data-d, on a face or a back", () => {
    const container = renderTiles(
      <>
        <TileImage tile="1m" discardRef="2:5" />
        <TileImage tile="?" discardRef="0:11" />
        <TileImage tile="1m" faceDown label="" discardRef="3:0" />
        <TileImage tile="1m" />
        <TileImage tile="1m" faceDown />
      </>,
    );
    expect([...container.children].map((el) => el.getAttribute("data-d"))).toEqual([
      "2:5",
      "0:11",
      "3:0",
      null,
      null,
    ]);
  });
});

describe("a sideways tile", () => {
  it("lies in a wrapper that takes the turned box, with everything else on the tile", () => {
    const container = renderTiles(
      <>
        <TileImage tile="3m" />
        <TileImage tile="3m" sideways highlighted className="extra" discardRef="1:0" />
      </>,
    );
    const [upright, wrapper] = [...container.children];
    expect(upright?.tagName).toBe("IMG");
    expect(wrapper?.tagName).toBe("SPAN");
    expect(wrapper?.className).not.toBe("");
    expect(wrapper?.hasAttribute("data-d")).toBe(false);
    expect(wrapper?.hasAttribute("role")).toBe(false);
    const img = screen.getAllByRole("img", { name: "3 Man" })[1];
    expect(img?.parentElement).toBe(wrapper);
    expect(wrapper?.children).toHaveLength(1);
    expect(img?.classList.contains("extra")).toBe(true);
    expect(wrapper?.classList.contains("extra")).toBe(false);
    expect(img?.getAttribute("data-d")).toBe("1:0");
    expect(img?.getAttribute("data-k")).toBe("2");
    // The same tile as an upright one, plus its marks.
    expect(marks(img, upright).length).toBe(2);
  });

  it("wraps a back the same way", () => {
    const container = renderTiles(<TileImage tile="3m" sideways faceDown />);
    const back = screen.getByRole("img", { name: "Face-down tile" });
    expect(back.parentElement).toBe(container.firstElementChild);
    expect(back.parentElement).not.toBe(back);
    expect(container.querySelector("img")).toBeNull();
  });
});
