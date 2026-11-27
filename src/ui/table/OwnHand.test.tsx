// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { SeatView } from "../../replay/types";
import { OwnHand } from "./OwnHand";

const view: SeatView = {
  hand: ["1m", "2m", "3m", "9p", "9p"],
  drawn: "5z",
  melds: [{ type: "chi", tiles: ["4s", "5s"], from: 3, calledTile: "3s" }],
  kita: ["4z", "4z"],
  discards: [],
  score: 25000,
  riichi: false,
};

function renderHand(seatView: SeatView = view) {
  return render(
    <I18nProvider>
      <OwnHand seat={0} view={seatView} name="A" />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("OwnHand", () => {
  it("draws the concealed tiles, the drawn tile, kita and melds in order", () => {
    renderHand();
    const hand = screen.getByRole("group", { name: "A's hand" });
    expect(
      within(hand)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["1 Man", "2 Man", "3 Man", "9 Pin", "9 Pin", "Haku (just drawn)"]);
    expect(screen.getByRole("group", { name: "A's kita: 2 North tiles set aside" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "A's calls" })).toBeTruthy();
  });

  it("keeps the drawn tile's slot between turns, so the row keeps its width", () => {
    const { container, rerender } = renderHand();
    const row = container.firstElementChild as HTMLElement;
    const units = row.style.getPropertyValue("--units");
    expect(container.querySelector("[data-drawn-slot]")).toBeNull();
    // The drawn tile was discarded (tsumogiri): the same concealed tiles, nothing drawn.
    rerender(
      <I18nProvider>
        <OwnHand seat={0} view={{ ...view, drawn: null }} name="A" />
      </I18nProvider>,
    );
    const slot = container.querySelector("[data-drawn-slot]");
    expect(slot?.getAttribute("aria-hidden")).toBe("true");
    expect(slot?.closest('[role="group"]')?.getAttribute("aria-label")).toBe("A's hand");
    expect(row.style.getPropertyValue("--units")).toBe(units);
  });
});
