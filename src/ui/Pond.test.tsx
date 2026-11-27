// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Tile } from "../core/tile";
import { I18nProvider } from "../i18n/I18nProvider";
import type { DiscardView } from "../replay/types";
import { Pond, type PondProps } from "./Pond";

const discard = (tile: Tile, marks: Partial<DiscardView> = {}): DiscardView => ({
  tile,
  tsumogiri: false,
  riichi: false,
  called: false,
  ...marks,
});

const many = (n: number) => Array.from({ length: n }, () => discard("1m"));

/** The element a tile's paint order sits on: a sideways tile's wrapper, else the image. */
const ordered = (img: HTMLElement) =>
  img.style.getPropertyValue("--zx") === "" ? (img.parentElement as HTMLElement) : img;

function renderPond(props: Partial<PondProps> & Pick<PondProps, "discards">) {
  return render(
    <I18nProvider>
      <Pond name="A" lastIndex={-1} {...props} />
    </I18nProvider>,
  );
}

const rows = () => [...screen.getByRole("group", { name: "A's discards" }).children];

afterEach(cleanup);

describe("Pond", () => {
  it("lays the discards in rows of six, the third row taking all the rest", () => {
    renderPond({ discards: many(14) });
    expect(rows().map((row) => row.querySelectorAll("img").length)).toEqual([6, 6, 2]);
    cleanup();
    renderPond({ discards: many(21) });
    expect(rows().map((row) => row.querySelectorAll("img").length)).toEqual([6, 6, 9]);
  });

  it("lays the riichi tile sideways, in its place in the row", () => {
    renderPond({ discards: [discard("1m"), discard("2m", { riichi: true }), discard("3m")] });
    const [first, riichi, third] = screen.getAllByRole("img") as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(riichi.getAttribute("alt")).toBe("2 Man, riichi declaration");
    // A sideways tile has a wrapper with its turned box; upright tiles lie in the row directly.
    const row = first.parentElement as HTMLElement;
    expect(third.parentElement).toBe(row);
    expect(riichi.parentElement).not.toBe(row);
    expect(riichi.parentElement?.parentElement).toBe(row);
    expect([...row.children].indexOf(riichi.parentElement as HTMLElement)).toBe(1);
  });

  it("dims tsumogiri, fades a called tile and outlines the last discard", () => {
    renderPond({
      discards: [
        discard("1m"),
        discard("2m", { tsumogiri: true }),
        discard("3m", { called: true }),
        discard("4m"),
      ],
      lastIndex: 3,
    });
    const [plain, tsumogiri, called, last] = screen.getAllByRole("img") as HTMLElement[];
    expect(screen.getAllByRole("img").map((img) => img.getAttribute("alt"))).toEqual([
      "1 Man",
      "2 Man, discarded right after drawing",
      "3 Man, called",
      "4 Man, last discard",
    ]);
    // Each mark is a class of its own on the tile.
    const marks = [tsumogiri, called, last].map((img) =>
      (img?.className ?? "").replace(plain?.className ?? "", "").trim(),
    );
    expect(marks.every((mark) => mark !== "")).toBe(true);
    expect(new Set(marks).size).toBe(3);
  });

  it("marks each tile with its seat and index, for Alt+click", () => {
    renderPond({ discards: many(13), seat: 2 });
    const tiles = screen.getAllByRole("img");
    expect(tiles[0]?.getAttribute("data-d")).toBe("2:0");
    expect(tiles[12]?.getAttribute("data-d")).toBe("2:12");
    cleanup();
    renderPond({ discards: many(2) });
    expect(screen.getAllByRole("img")[0]?.hasAttribute("data-d")).toBe(false);
  });

  it("hides the discard whose flight is still in the air", () => {
    renderPond({ discards: many(3), hiddenIndex: 2, hiddenClassName: "landing" });
    expect(
      screen.getAllByRole("img").map((img) => img.className.split(" ").includes("landing")),
    ).toEqual([false, false, true]);
  });

  it("gives every discard its column and row for the 3D table's paint order", () => {
    const discards = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m"].map((tile, index) =>
      discard(tile as Tile, { riichi: index === 6 }),
    );
    renderPond({ discards });
    const tiles = screen.getAllByRole("img").map((img) => {
      const el = ordered(img);
      return [el.style.getPropertyValue("--zx"), el.style.getPropertyValue("--zy")];
    });
    expect(tiles).toEqual([
      ["0", "0"],
      ["1", "0"],
      ["2", "0"],
      ["3", "0"],
      ["4", "0"],
      ["5", "0"],
      ["0", "1"],
      ["1", "1"],
    ]);
  });

  it("counts the third row's columns on, however long it grows", () => {
    renderPond({ discards: many(20) });
    const last = ordered(screen.getAllByRole("img")[19] as HTMLElement);
    expect([last.style.getPropertyValue("--zx"), last.style.getPropertyValue("--zy")]).toEqual([
      "7",
      "2",
    ]);
  });

  it("isolates, so the tiles' order stays inside the pond", () => {
    const css = readFileSync("src/ui/Pond.module.css", "utf8");
    expect(/\.pond \{[^}]*isolation: isolate;/.exec(css)).not.toBeNull();
  });
});
