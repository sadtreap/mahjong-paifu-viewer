// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { SeatView } from "../../replay/types";
import type { NextDiscard } from "../viewer/types";
import { nextIndex, OwnHand } from "./OwnHand";

const view: SeatView = {
  hand: ["1m", "2m", "3m", "9p", "9p"],
  drawn: "5z",
  melds: [{ type: "chi", tiles: ["4s", "5s"], from: 3, calledTile: "3s" }],
  kita: ["4z", "4z"],
  discards: [],
  score: 25000,
  riichi: false,
};

function renderHand(next: NextDiscard | null, seatView: SeatView = view) {
  return render(
    <I18nProvider>
      <OwnHand seat={0} view={seatView} name="A" next={next} />
    </I18nProvider>,
  );
}

const marked = () =>
  screen
    .getAllByRole("img")
    .filter((img) => (img.getAttribute("alt") ?? "").endsWith("(discarded next)"));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("OwnHand", () => {
  it("draws the concealed tiles, the drawn tile, kita and melds in order", () => {
    renderHand(null);
    const hand = screen.getByRole("group", { name: "A's hand" });
    expect(
      within(hand)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["1 Man", "2 Man", "3 Man", "9 Pin", "9 Pin", "Haku (just drawn)"]);
    expect(screen.getByRole("group", { name: "A's kita: 2 North tiles set aside" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "A's calls" })).toBeTruthy();
    expect(marked()).toHaveLength(0);
  });

  it("keeps the drawn tile's slot between turns, so the row keeps its width", () => {
    const { container, rerender } = renderHand(null);
    const row = container.firstElementChild as HTMLElement;
    const units = row.style.getPropertyValue("--units");
    expect(container.querySelector("[data-drawn-slot]")).toBeNull();
    // The drawn tile was discarded (tsumogiri): the same concealed tiles, nothing drawn.
    rerender(
      <I18nProvider>
        <OwnHand seat={0} view={{ ...view, drawn: null }} name="A" next={null} />
      </I18nProvider>,
    );
    const slot = container.querySelector("[data-drawn-slot]");
    expect(slot?.getAttribute("aria-hidden")).toBe("true");
    expect(slot?.closest('[role="group"]')?.getAttribute("aria-label")).toBe("A's hand");
    expect(row.style.getPropertyValue("--units")).toBe(units);
  });

  it("marks the first matching concealed tile as the next discard", () => {
    renderHand({ tile: "9p", drawn: false });
    expect(marked().map((img) => img.getAttribute("alt"))).toEqual(["9 Pin (discarded next)"]);
    const tiles = within(screen.getByRole("group", { name: "A's hand" })).getAllByRole("img");
    expect(tiles[3]?.className).not.toBe(tiles[4]?.className);
  });

  it("marks the drawn tile for a tsumogiri", () => {
    renderHand({ tile: "5z", drawn: true });
    expect(marked().map((img) => img.getAttribute("alt"))).toEqual([
      "Haku (just drawn) (discarded next)",
    ]);
  });

  it("finds the next tile by its exact face, red fives included", () => {
    expect(nextIndex(["5p", "0p"], null, { tile: "0p", drawn: false })).toBe(1);
    expect(nextIndex(["5p"], "0p", { tile: "0p", drawn: false })).toBe(-1);
    expect(nextIndex(["5p"], null, { tile: "1m", drawn: false })).toBeNull();
    expect(nextIndex(["5p"], null, { tile: "1m", drawn: true })).toBeNull();
    expect(nextIndex(["5p"], null, null)).toBeNull();
  });
});
