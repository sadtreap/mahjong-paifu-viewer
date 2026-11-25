// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Quad, Seat } from "../core/model";
import { I18nProvider } from "../i18n/I18nProvider";
import { boardState, round } from "./__fixtures__/game";
import { Board } from "./Board";

const names: Quad<string> = ["A", "B", "C", "D"];

function renderBoard(revealed: Seat[] = [0, 1, 2, 3], pov: Seat = 0) {
  return render(
    <I18nProvider>
      <Board
        round={round}
        state={boardState()}
        names={names}
        pov={pov}
        revealed={new Set(revealed)}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Board", () => {
  it("labels hands, melds and ponds", () => {
    renderBoard();
    const hand = screen.getByRole("group", { name: "D's hand" });
    expect(within(hand).getAllByRole("img")).toHaveLength(13);
    expect(within(hand).getByAltText("5 Man (red)")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Pon: 9 Man, 9 Man, 9 Man" })).toBeTruthy();
    expect(screen.getByRole("group", { name: /^Closed kan/ })).toBeTruthy();
    expect(screen.getByAltText("9 Man, riichi declaration, called")).toBeTruthy();
    expect(screen.getByAltText("7 Sou, discarded right after drawing, last discard")).toBeTruthy();
    expect(screen.getByAltText("1 Pin (just drawn)")).toBeTruthy();
  });

  it("shows the center information", () => {
    renderBoard();
    // Honba is shown by its own counter, not in the round name.
    expect(screen.getByText("East 1")).toBeTruthy();
    expect(screen.getByTitle("Honba").textContent).toContain("1");
    expect(screen.getByText("60 tiles left")).toBeTruthy();
    // Small boards show a shorter count instead, hidden from screen readers (they read the above).
    expect(screen.getByText("60 left").getAttribute("aria-hidden")).toBe("true");
    const dora = screen.getByRole("group", { name: "Dora indicators" });
    expect(
      within(dora)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["3 Man", "Face-down tile", "Face-down tile", "Face-down tile", "Face-down tile"]);
    expect(screen.getAllByRole("img", { name: "Riichi" })).toHaveLength(1);
  });

  it("draws hidden hands face down", () => {
    renderBoard([0]);
    const hidden = screen.getByRole("group", { name: "B's hand" });
    for (const img of within(hidden).getAllByRole("img")) {
      expect(img.getAttribute("alt")).toBe("Face-down tile");
      expect(img.getAttribute("src")).toMatch(/tiles\/Back\.svg$/);
    }
    const own = screen.getByRole("group", { name: "A's hand" });
    expect(within(own).getAllByRole("img")[0]?.getAttribute("src")).toMatch(/tiles\/Man1\.svg$/);
  });

  it("rotates the table to the point of view", () => {
    const { container } = renderBoard([0, 1, 2, 3], 2);
    const layers = container.querySelectorAll("section > div[class]");
    // First child is the center panel, then the bottom, right, top and left layers.
    expect(layers[1]?.textContent).toContain("C");
    expect(within(layers[1] as HTMLElement).getByRole("group", { name: "C's hand" })).toBeTruthy();
  });
});
