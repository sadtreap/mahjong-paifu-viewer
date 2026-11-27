// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { ToolbarProps } from "../viewer/types";
import { Toolbar } from "./Toolbar";

function renderToolbar(patch: Partial<ToolbarProps> = {}) {
  const props: ToolbarProps = {
    showAllHands: true,
    onToggleHands: vi.fn(),
    players: [
      { seat: 0, name: "Alice", wind: 0, score: 25000 },
      { seat: 1, name: "Bob", wind: 1, score: 25000 },
    ],
    pov: 0,
    onPov: vi.fn(),
    linkable: true,
    onOpenLog: vi.fn(),
    onCopyLink: vi.fn(),
    onSettings: vi.fn(),
    onHelp: vi.fn(),
    popover: null,
    onPopover: vi.fn(),
    ...patch,
  };
  render(
    <I18nProvider>
      <Toolbar {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Toolbar", () => {
  it("is a labelled group of three controls that the table's gestures skip", () => {
    renderToolbar();
    const group = screen.getByRole("group", { name: "Viewer tools" });
    expect(group.getAttribute("data-gesture")).toBe("ignore");
    expect(
      [...group.querySelectorAll("button")].map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Show all hands", "Point of view: East, Alice", "Menu"]);
  });

  it("toggles the hands with a pressed state and a fixed name", () => {
    const { onToggleHands } = renderToolbar();
    const hands = screen.getByRole("button", { name: "Show all hands" });
    expect(hands.getAttribute("aria-pressed")).toBe("true");
    expect(hands.title).toBe("Show all hands (H)");
    // The short label is for the eye, where there is room.
    expect(hands.textContent).toBe("Hands");
    fireEvent.click(hands);
    expect(onToggleHands).toHaveBeenCalledTimes(1);
    cleanup();

    renderToolbar({ showAllHands: false });
    expect(
      screen.getByRole("button", { name: "Show all hands" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("asks for one menu at a time", () => {
    const { onPopover } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: /^Point of view:/ }));
    expect(onPopover).toHaveBeenLastCalledWith("pov");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(onPopover).toHaveBeenLastCalledWith("menu");
    cleanup();

    const open = renderToolbar({ popover: "menu" });
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu", { name: "Menu" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(open.onPopover).toHaveBeenLastCalledWith(null);
  });

  it("opens neither menu for the round list", () => {
    renderToolbar({ popover: "rounds" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
