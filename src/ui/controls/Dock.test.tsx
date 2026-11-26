// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { DockProps } from "../viewer/types";
import { Dock } from "./Dock";

function props(patch: Partial<DockProps> = {}): DockProps {
  return {
    status: {
      text: "A draws",
      quiet: false,
      announcement: null,
      counter: "Step 2 / 30",
      legend: null,
    },
    back: null,
    onBack: vi.fn(),
    onShowResult: null,
    transport: {
      roundName: "East 1",
      turn: 4,
      limits: { gameStart: false, gameEnd: false, firstRound: true, lastRound: false },
      playing: false,
      speed: 1,
      breakpoint: "wide",
      onNav: vi.fn(() => true),
      onTogglePlay: vi.fn(),
      onSpeed: vi.fn(),
      onRoundList: vi.fn(),
    },
    bands: <div data-testid="bands" />,
    rootRef: createRef<HTMLDivElement>(),
    ...patch,
  };
}

function renderDock(patch: Partial<DockProps> = {}) {
  const all = props(patch);
  render(
    <I18nProvider>
      <Dock {...all} />
    </I18nProvider>,
  );
  return all;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Dock", () => {
  it("holds the status line, the bands and the transport, in that order, with one live region", () => {
    const { rootRef } = renderDock();
    const root = (rootRef as { current: HTMLDivElement | null }).current;
    expect(root).not.toBeNull();
    const live = document.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    const bands = screen.getByTestId("bands");
    const toolbar = screen.getByRole("toolbar");
    expect(live[0]?.compareDocumentPosition(bands)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(bands.compareDocumentPosition(toolbar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(live[0]?.textContent).toBe("Turn 4 · A draws");
  });

  it("shows the back chip only with a target, and goes back with it", () => {
    renderDock();
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    cleanup();
    const { onBack } = renderDock({ back: { label: "E1 · turn 6" } });
    fireEvent.click(screen.getByRole("button", { name: "Back to E1 · turn 6" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("offers Show result in the status line, outside the live text", () => {
    renderDock();
    expect(screen.queryByRole("button", { name: "Show result" })).toBeNull();
    cleanup();
    const onShowResult = vi.fn();
    renderDock({ onShowResult });
    const chip = screen.getByRole("button", { name: "Show result" });
    expect(chip.closest("[aria-live]")).toBeNull();
    expect(chip.closest("p")?.querySelector("[aria-live]")).not.toBeNull();
    fireEvent.click(chip);
    expect(onShowResult).toHaveBeenCalledTimes(1);
  });
});
