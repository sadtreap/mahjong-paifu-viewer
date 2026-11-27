// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { MESSAGES } from "../../i18n/messages";
import type { InfoChipProps } from "../viewer/types";
import { InfoChip } from "./InfoChip";

function renderChip(patch: Partial<InfoChipProps> = {}) {
  const { container } = render(
    <I18nProvider>
      <InfoChip doraIndicators={["5m", "1z"]} honba={0} deposits={0} {...patch} />
    </I18nProvider>,
  );
  return container;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("InfoChip", () => {
  it("shows the revealed dora indicators as one named group, and nothing to press", () => {
    const chip = renderChip();
    const tiles = within(screen.getByRole("group", { name: "Dora indicators" })).getAllByRole(
      "img",
    );
    expect(tiles.map((tile) => tile.getAttribute("alt"))).toEqual(["5 Man", "East"]);
    expect(chip.querySelector("button, a, input")).toBeNull();
    expect(chip.firstElementChild?.getAttribute("data-gesture")).toBe("ignore");
    // The short label is for the eye; the group has the full name.
    expect(screen.getByText("Dora").getAttribute("aria-hidden")).toBe("true");
  });

  it("leaves the counts out when there is neither honba nor a deposit", () => {
    const chip = renderChip();
    expect(chip.querySelector("p")).toBeNull();
  });

  it("names only the counts that are not zero", () => {
    expect(renderChip({ honba: 1, deposits: 2 }).querySelector("p")?.textContent).toBe(
      "1 honba · 2 deposits",
    );
    cleanup();
    expect(renderChip({ honba: 3 }).querySelector("p")?.textContent).toBe("3 honba");
    cleanup();
    expect(renderChip({ deposits: 1 }).querySelector("p")?.textContent).toBe("1 deposit");
  });

  it("words the counts in Korean and Japanese", () => {
    const { ko, ja } = MESSAGES;
    expect([ko.info.honba(1), ko.info.deposits(2)].join(" · ")).toBe("1본장 · 공탁 2");
    expect([ja.info.honba(1), ja.info.deposits(2)].join(" · ")).toBe("1本場 · 供託 2");
  });
});
