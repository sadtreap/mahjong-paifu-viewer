// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Tile } from "../core/tile";
import { I18nProvider } from "../i18n/I18nProvider";
import type { DiscardView } from "../replay/types";
import { Pond } from "./Pond";

const discard = (tile: Tile, riichi = false): DiscardView => ({
  tile,
  tsumogiri: false,
  riichi,
  called: false,
});

/** The element a tile's paint order sits on: a sideways tile's wrapper, else the image. */
const ordered = (img: HTMLElement) =>
  img.style.getPropertyValue("--zx") === "" ? (img.parentElement as HTMLElement) : img;

afterEach(cleanup);

describe("Pond", () => {
  it("gives every discard its column and row for the 3D table's paint order", () => {
    const discards = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m"].map((tile, index) =>
      discard(tile as Tile, index === 6),
    );
    render(
      <I18nProvider>
        <Pond discards={discards} name="A" lastIndex={-1} />
      </I18nProvider>,
    );
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

  it("isolates, so the tiles' order stays inside the pond", () => {
    const css = readFileSync("src/ui/Pond.module.css", "utf8");
    expect(/\.pond \{[^}]*isolation: isolate;/.exec(css)).not.toBeNull();
  });
});
