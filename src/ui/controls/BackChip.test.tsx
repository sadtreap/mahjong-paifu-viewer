// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { BackChip } from "./BackChip";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("BackChip", () => {
  it("names where it goes back to and goes back on click", () => {
    const onBack = vi.fn();
    render(
      <I18nProvider>
        <BackChip target={{ label: "E1 · turn 6" }} onBack={onBack} />
      </I18nProvider>,
    );
    const chip = screen.getByRole("button", { name: "Back to E1 · turn 6" });
    expect(chip.title).toBe("Back to where you were (Backspace)");
    expect(chip.textContent).toContain("E1 · turn 6");
    fireEvent.click(chip);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
