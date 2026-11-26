// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { Hud } from "./Hud";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Hud", () => {
  it("shows the dora indicators, honba, deposits and rules", () => {
    render(
      <I18nProvider>
        <Hud doraIndicators={["3m"]} honba={1} riichiSticks={2} ruleLabel="Phoenix room" />
      </I18nProvider>,
    );
    const dora = screen.getByRole("group", { name: "Dora indicators" });
    expect(
      within(dora)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["3 Man", "Face-down tile", "Face-down tile", "Face-down tile", "Face-down tile"]);
    expect(screen.getByTitle("Honba").textContent).toBe("Honba×1");
    expect(screen.getByTitle("Riichi sticks").textContent).toBe("Riichi sticks×2");
    expect(screen.getByText("Honba").className).toBe("sr-only");
    expect(screen.getByText("Phoenix room")).toBeTruthy();
  });
});
