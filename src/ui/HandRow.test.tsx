// @vitest-environment happy-dom
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

function renderRow(overrides: Partial<SeatView> = {}, revealed = true) {
  return render(
    <I18nProvider>
      <HandRow seat={0} view={{ ...view, ...overrides }} name="B" revealed={revealed} />
    </I18nProvider>,
  ).container;
}

/** The row's parts, in document order, by their group names. */
const parts = (container: HTMLElement) =>
  [...(container.firstElementChild?.children ?? [])].map((el) => el.getAttribute("aria-label"));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("a face-up hand row", () => {
  it("names the hand and each of its tiles, the drawn one as just drawn", () => {
    renderRow();
    const hand = screen.getByRole("group", { name: "B's hand" });
    expect(
      within(hand)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["1 Man", "2 Man", "3 Man", "9 Pin", "Haku (just drawn)"]);
    expect(hand.querySelectorAll("img[data-k]")).toHaveLength(5);
  });

  it("sets the drawn tile apart from the hand, in a box of its own", () => {
    renderRow();
    const hand = screen.getByRole("group", { name: "B's hand" });
    const drawn = screen.getByAltText("Haku (just drawn)");
    expect(screen.getByAltText("9 Pin").parentElement).toBe(hand);
    expect(drawn.parentElement).not.toBe(hand);
    expect(drawn.parentElement?.parentElement).toBe(hand);
    expect(hand.lastElementChild).toBe(drawn.parentElement);
    expect(drawn.parentElement?.className).not.toBe("");
  });

  it("has no box for a drawn tile between turns", () => {
    renderRow({ drawn: null });
    const hand = screen.getByRole("group", { name: "B's hand" });
    expect([...hand.children].map((el) => el.tagName)).toEqual(["IMG", "IMG", "IMG", "IMG"]);
  });
});

describe("a hidden hand row", () => {
  it("counts its tiles in the group's name and draws them as backs nobody reads one by one", () => {
    const container = renderRow({}, false);
    const hand = screen.getByRole("group", { name: "B's hand, 5 tiles face down" });
    expect(screen.queryByRole("group", { name: "B's hand" })).toBeNull();
    expect(within(hand).queryAllByRole("img")).toEqual([]);
    expect(hand.querySelectorAll('span[aria-hidden="true"]:empty')).toHaveLength(5);
    // Nothing in the row tells what the hidden tiles are.
    expect(hand.querySelector("img, [data-k], [aria-label]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/Man[123]|Pin9|Haku/);
  });

  it("still sets the drawn tile apart, face down", () => {
    renderRow({}, false);
    const hand = screen.getByRole("group", { name: "B's hand, 5 tiles face down" });
    const box = hand.lastElementChild as HTMLElement;
    expect(box.hasAttribute("aria-hidden")).toBe(false);
    expect(box.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(1);
    expect(hand.children).toHaveLength(5);
  });

  it("counts one tile as one tile, and no drawn tile between turns", () => {
    renderRow({ hand: ["1m"], drawn: null }, false);
    expect(screen.getByRole("group", { name: "B's hand, 1 tile face down" })).toBeTruthy();
    cleanup();
    renderRow({ drawn: null }, false);
    expect(screen.getByRole("group", { name: "B's hand, 4 tiles face down" })).toBeTruthy();
  });

  it("keeps the calls and the kita face up", () => {
    renderRow({ kita: ["4z"] }, false);
    const calls = screen.getByRole("group", { name: "B's calls" });
    expect(within(calls).getAllByRole("img")).toHaveLength(7);
    expect(calls.querySelectorAll("img[data-k]")).toHaveLength(7);
    const kita = screen.getByRole("group", { name: "B's kita: 1 North tile set aside" });
    expect(within(kita).getByRole("img", { name: "North" })).toBeTruthy();
  });
});

describe("a hand row's parts", () => {
  it("come in the order hand, kita, calls", () => {
    expect(parts(renderRow({ kita: ["4z", "4z"] }))).toEqual([
      "B's hand",
      "B's kita: 2 North tiles set aside",
      "B's calls",
    ]);
  });

  it("leave out the kita and the calls a seat does not have", () => {
    expect(parts(renderRow({ melds: [] }))).toEqual(["B's hand"]);
    expect(screen.queryByRole("group", { name: "B's calls" })).toBeNull();
    cleanup();
    expect(parts(renderRow({ kita: ["4z"], melds: [] }))).toEqual([
      "B's hand",
      "B's kita: 1 North tile set aside",
    ]);
    cleanup();
    expect(parts(renderRow())).toEqual(["B's hand", "B's calls"]);
  });

  it("list the calls in the order they were made, each a group of its own", () => {
    renderRow();
    const calls = within(screen.getByRole("group", { name: "B's calls" })).getAllByRole("group");
    expect(calls.map((call) => call.getAttribute("aria-label"))).toEqual([
      "Pon: Chun, Chun, Chun",
      "Added kan: Hatsu, Hatsu, Hatsu, Hatsu",
    ]);
    // The pon came from across the table, the kan's tile from the next player.
    const sideways = (call: HTMLElement | undefined) =>
      [...(call?.children ?? [])].map((el) => el.tagName !== "IMG");
    expect(sideways(calls[0])).toEqual([false, true, false]);
    expect(sideways(calls[1])).toEqual([false, false, true]);
  });

  it("show one North tile for the kita, with the count from two on", () => {
    renderRow({ kita: ["4z", "4z", "4z"] });
    const kita = screen.getByRole("group", { name: "B's kita: 3 North tiles set aside" });
    expect(within(kita).getAllByRole("img")).toHaveLength(1);
    expect(within(kita).getByText("×3").getAttribute("aria-hidden")).toBe("true");
    cleanup();
    renderRow({ kita: ["4z"] });
    expect(
      screen.getByRole("group", { name: "B's kita: 1 North tile set aside" }).textContent,
    ).toBe("");
  });
});
