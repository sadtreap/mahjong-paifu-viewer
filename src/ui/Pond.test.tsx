// @vitest-environment happy-dom
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

function renderPond(props: Partial<PondProps> & Pick<PondProps, "discards">) {
  return render(
    <I18nProvider>
      <Pond name="A" lastIndex={-1} {...props} />
    </I18nProvider>,
  );
}

const rows = () => [...screen.getByRole("group", { name: "A's discards" }).children];
const landing = () =>
  screen.getAllByRole("img").map((img) => img.className.split(" ").includes("landing"));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Pond", () => {
  it("lays the discards in rows of six, the third row taking all the rest", () => {
    renderPond({ discards: many(14) });
    expect(rows().map((row) => row.querySelectorAll("img").length)).toEqual([6, 6, 2]);
    cleanup();
    renderPond({ discards: many(21) });
    expect(rows().map((row) => row.querySelectorAll("img").length)).toEqual([6, 6, 9]);
  });

  it("is a named group even while it is empty", () => {
    renderPond({ discards: [] });
    expect(rows()).toEqual([]);
    cleanup();
    renderPond({ discards: many(1) });
    expect(rows().map((row) => row.querySelectorAll("img").length)).toEqual([1]);
  });

  it("keeps the discards in order, row after row", () => {
    const tiles: Tile[] = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m"];
    renderPond({ discards: tiles.map((tile) => discard(tile)) });
    expect(screen.getAllByRole("img").map((img) => img.getAttribute("alt"))).toEqual(
      tiles.map((tile) => `${tile[0]} Man`),
    );
    expect(rows()[1]?.querySelector("img")?.getAttribute("alt")).toBe("7 Man");
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

  it("outlines no discard without a last one", () => {
    renderPond({ discards: many(3) });
    const classes = screen.getAllByRole("img").map((img) => img.className);
    expect(new Set(classes).size).toBe(1);
    expect(screen.queryByAltText(/last discard/)).toBeNull();
  });

  it("marks each tile with its seat and index, for Alt+click", () => {
    renderPond({ discards: many(13), seat: 2 });
    const tiles = screen.getAllByRole("img");
    expect(tiles[0]?.getAttribute("data-d")).toBe("2:0");
    expect(tiles[12]?.getAttribute("data-d")).toBe("2:12");
    cleanup();
    // Seat 0 is a seat like the others.
    renderPond({ discards: many(2), seat: 0 });
    expect(screen.getAllByRole("img")[1]?.getAttribute("data-d")).toBe("0:1");
    cleanup();
    renderPond({ discards: many(2) });
    expect(screen.getAllByRole("img")[0]?.hasAttribute("data-d")).toBe(false);
  });

  it("gives the discard that lands on this step its class, and no other", () => {
    renderPond({ discards: many(3), landingIndex: 2, landingClassName: "landing" });
    expect(landing()).toEqual([false, false, true]);
    cleanup();
    renderPond({ discards: many(14), landingIndex: 0, landingClassName: "landing" });
    expect(landing().indexOf(true)).toBe(0);
    expect(landing().filter(Boolean)).toHaveLength(1);
  });

  it("lands nothing without an index", () => {
    renderPond({ discards: many(3), landingClassName: "landing" });
    expect(landing()).toEqual([false, false, false]);
    cleanup();
    renderPond({ discards: many(3), landingIndex: -1, landingClassName: "landing" });
    expect(landing()).toEqual([false, false, false]);
  });

  it("lands a riichi tile by the tile, inside its turned box", () => {
    renderPond({
      discards: [discard("1m"), discard("2m", { riichi: true })],
      lastIndex: 1,
      landingIndex: 1,
      landingClassName: "landing",
    });
    const riichi = screen.getByAltText("2 Man, riichi declaration, last discard");
    expect(riichi.classList.contains("landing")).toBe(true);
    expect(riichi.parentElement?.classList.contains("landing")).toBe(false);
  });

  it("keeps a landed discard the tile it is: the class is the only difference", () => {
    renderPond({ discards: many(2), lastIndex: 1, landingIndex: 1, landingClassName: "landing" });
    const landed = screen.getAllByRole("img")[1];
    const html = landed?.outerHTML.replace(" landing", "");
    cleanup();
    renderPond({ discards: many(2), lastIndex: 1 });
    expect(screen.getAllByRole("img")[1]?.outerHTML).toBe(html);
  });
});
