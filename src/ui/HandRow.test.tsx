// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import type { SeatView } from "../replay/types";
import { HandRow } from "./HandRow";

const view: SeatView = {
  hand: ["1m", "2m", "3m", "9p"],
  drawn: "5z",
  melds: [
    { type: "pon", tiles: ["7z", "7z"], from: 2, calledTile: "7z" },
    { type: "kakan", tiles: ["6z", "6z"], from: 1, calledTile: "6z", addedTile: "6z" },
  ],
  kita: [],
  discards: [],
  score: 25000,
  riichi: false,
};

/** [column, row] of each tile image in a group, read from the tile or its sideways wrapper. */
function depths(group: HTMLElement): [number, number][] {
  return within(group)
    .getAllByRole("img")
    .map((img) => {
      const el = img.style.getPropertyValue("--zx") === "" ? img.parentElement : img;
      return [
        Number(el?.style.getPropertyValue("--zx")),
        Number(el?.style.getPropertyValue("--zy")),
      ];
    });
}

afterEach(cleanup);

describe("HandRow paint order (3D table)", () => {
  it("numbers the columns from left to right across the hand, the drawn tile and the melds", () => {
    render(
      <I18nProvider>
        <HandRow seat={0} view={view} name="B" revealed />
      </I18nProvider>,
    );
    expect(depths(screen.getByRole("group", { name: "B's hand" }))).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    const [first, second] = within(screen.getByRole("group", { name: "B's calls" })).getAllByRole(
      "group",
    );
    // Melds are drawn right to left: the first call is rightmost, so its columns come last.
    const pon = depths(first as HTMLElement);
    const kakan = depths(second as HTMLElement);
    expect(pon.map(([column]) => column)).toEqual([11, 12, 13]);
    // The kakan's added tile lies one row farther than the called tile it is stacked on.
    expect(kakan).toEqual([
      [6, 0],
      [7, 0],
      [8, -1],
      [8, 0],
    ]);
  });

  it("isolates the row, so its tiles' order stays under a standing wall", () => {
    const css = readFileSync("src/ui/HandRow.module.css", "utf8");
    expect(/\.row \{[^}]*isolation: isolate;/.exec(css)).not.toBeNull();
  });
});
