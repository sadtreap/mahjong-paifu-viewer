// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Seat } from "../core/model";
import { I18nProvider } from "../i18n/I18nProvider";
import type { MeldView, SeatView } from "../replay/types";
import { HandRow } from "./HandRow";
import { MeldTiles } from "./MeldTiles";

const kakan: MeldView = {
  type: "kakan",
  tiles: ["6z", "6z"],
  from: 1,
  calledTile: "6z",
  addedTile: "6z",
};
const ankan: MeldView = { type: "ankan", tiles: ["0s", "5s", "5s", "5s"] };
const chiFrom = (from: Seat): MeldView => ({
  type: "chi",
  tiles: ["4m", "5m"],
  from,
  calledTile: "3m",
});
const seat: SeatView = {
  hand: ["1m", "2m", "3m", "9p"],
  drawn: null,
  melds: [kakan],
  kita: [],
  discards: [],
  score: 25000,
  riichi: false,
};

const renderMeld = (ui: ReactElement) => render(<I18nProvider>{ui}</I18nProvider>).container;
const meldGroup = () => screen.getByRole("group", { name: /^Added kan/ });
/** The names of a group's tiles in document order, a sideways one in brackets. */
const laid = (group: HTMLElement) =>
  within(group)
    .getAllByRole("img")
    .map((img) => {
      const name = img.getAttribute("alt") ?? img.getAttribute("aria-label");
      return img.parentElement === group ? name : `[${name}]`;
    });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("MeldTiles", () => {
  it("lays the called tile sideways and stacks a kakan's added tile on it", () => {
    renderMeld(<MeldTiles meld={kakan} owner={0} />);
    const group = meldGroup();
    expect(within(group).getAllByRole("img")).toHaveLength(4);
    // From the next player: the called tile is the rightmost, with the added tile in the same slot.
    const stack = group.lastElementChild as HTMLElement;
    expect(stack.querySelectorAll("img")).toHaveLength(2);
    expect([...group.children].slice(0, 2).every((child) => child.tagName === "IMG")).toBe(true);
    // Both tiles of the stack lie sideways, each in its own turned box.
    expect([...stack.children].map((child) => child.tagName)).toEqual(["SPAN", "SPAN"]);
    expect([...stack.children].map((child) => child.querySelectorAll("img").length)).toEqual([
      1, 1,
    ]);
  });

  it("lays the called tile on the side of the player it came from", () => {
    // Seat 1 calls: from the previous player (0) leftmost, from the opposite one (3) in the
    // middle, from the next one (2) rightmost.
    const order = (meld: MeldView) => {
      renderMeld(<MeldTiles meld={meld} owner={1} />);
      const tiles = laid(screen.getByRole("group", { name: /^(Chi|Pon)/ }));
      cleanup();
      return tiles;
    };
    expect(order(chiFrom(0))).toEqual(["[3 Man]", "4 Man", "5 Man"]);
    const pon = (from: Seat): MeldView => ({
      type: "pon",
      tiles: ["7z", "7z"],
      from,
      calledTile: "7z",
    });
    expect(order(pon(3))).toEqual(["Chun", "[Chun]", "Chun"]);
    expect(order(pon(2))).toEqual(["Chun", "Chun", "[Chun]"]);
  });

  it("shows a closed kan with its ends face down and a red five face up", () => {
    const container = renderMeld(<MeldTiles meld={ankan} owner={0} />);
    const group = screen.getByRole("group", { name: /^Closed kan/ });
    expect(laid(group)).toEqual(["Face-down tile", "5 Sou (red)", "5 Sou", "Face-down tile"]);
    // The backs are bodies without artwork; only the two faces are images.
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect([...group.children].map((child) => child.hasAttribute("data-k"))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("names the set after its kind and its tiles", () => {
    renderMeld(
      <>
        <MeldTiles meld={chiFrom(0)} owner={1} />
        <MeldTiles meld={kakan} owner={0} />
      </>,
    );
    expect(screen.getByRole("group", { name: "Chi: 4 Man, 5 Man, 3 Man" })).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Added kan: Hatsu, Hatsu, Hatsu, Hatsu" }),
    ).toBeTruthy();
  });

  it("draws the stack low on the table's rows, where nothing may rise above the row", () => {
    const classOf = (ui: ReactElement) => {
      renderMeld(ui);
      const name = meldGroup().className;
      cleanup();
      return name;
    };
    const plain = classOf(<MeldTiles meld={kakan} owner={0} />);
    const low = classOf(<MeldTiles meld={kakan} owner={0} low />);
    expect(low).not.toBe(plain);
    expect(low.startsWith(plain)).toBe(true);
    // Every seat's row on the table is a HandRow, the viewed player's too.
    expect(classOf(<HandRow seat={0} view={seat} name="B" revealed />)).toBe(low);
    expect(classOf(<HandRow seat={0} view={seat} name="B" revealed={false} />)).toBe(low);
  });
});
