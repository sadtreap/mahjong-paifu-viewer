// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Quad, WinEvent } from "../core/model";
import { I18nProvider } from "../i18n/I18nProvider";
import type { MeldView } from "../replay/types";
import { ResultPanel } from "./ResultPanel";

const names: Quad<string> = ["A", "B", "C", "D"];

function win(overrides: Partial<WinEvent>): WinEvent {
  return {
    type: "win",
    seat: 2,
    from: 3,
    deltas: [0, 0, 12000, -12000],
    yaku: [
      { key: "toitoi", han: 2 },
      { key: "hatsu", han: 1 },
      { key: "honitsu", han: 2 },
    ],
    han: 5,
    points: 12000,
    ...overrides,
  };
}

function renderResult(event: WinEvent | WinEvent[], melds: Quad<MeldView[]> = [[], [], [], []]) {
  return render(
    <I18nProvider>
      <ResultPanel results={Array.isArray(event) ? event : [event]} names={names} melds={melds} />
    </I18nProvider>,
  );
}

const imageAlts = (element: HTMLElement) =>
  within(element)
    .getAllByRole("img")
    .map((img) => img.getAttribute("alt"));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ResultPanel", () => {
  it("names the limit instead of showing fu, as tenhou.net/6 JSON has none for limit hands", () => {
    renderResult(win({ fu: 40, limit: "mangan" }));
    expect(screen.getByText("5 han · Mangan · 12,000 points")).toBeTruthy();
  });

  it("shows fu for hands below the limits", () => {
    renderResult(win({ han: 2, fu: 40, points: 3900, deltas: [0, 0, 3900, -3900] }));
    expect(screen.getByText("2 han · 40 fu · 3,900 points")).toBeTruthy();
  });

  it("shows the winner's calls as part of the winning hand", () => {
    const pon: MeldView = { type: "pon", tiles: ["5z", "5z"], from: 3, calledTile: "5z" };
    const other: MeldView = { type: "chi", tiles: ["2s", "3s"], from: 0, calledTile: "1s" };
    renderResult(
      win({
        tile: "3p",
        hand: ["1m", "1m", "5m", "5m", "5m", "4p", "0p", "3p"],
        yaku: [{ key: "haku", han: 1 }],
        han: 1,
      }),
      [[], [other], [pon], []],
    );
    const hand = screen.getByRole("group", { name: "Winning hand" });
    expect(imageAlts(hand)).toHaveLength(11);
    expect(within(hand).getByRole("group", { name: "Pon: Haku, Haku, Haku" })).toBeTruthy();
    // Another player's calls are not part of the hand.
    expect(within(hand).queryByRole("group", { name: /^Chi/ })).toBeNull();
  });

  it("shows each winner's own calls in a double ron", () => {
    const pon: MeldView = { type: "pon", tiles: ["9m", "9m"], from: 1, calledTile: "9m" };
    renderResult(
      [
        win({ seat: 2, tile: "3p", hand: ["3p", "3p", "4s", "5s", "6s", "7s", "8s", "9s"] }),
        win({ seat: 0, tile: "3p", hand: ["1m", "2m", "3m", "3p", "4p", "5p", "7z", "7z"] }),
      ],
      [[], [], [pon], []],
    );
    const [first, second] = screen.getAllByRole("group", { name: "Winning hand" });
    expect(within(first as HTMLElement).getByRole("group", { name: /^Pon/ })).toBeTruthy();
    expect(within(second as HTMLElement).queryByRole("group", { name: /^Pon/ })).toBeNull();
  });
});
