// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quad, Seat } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { boardState, game, round } from "../__fixtures__/game";
import type { Spotlight, TableStageProps } from "../viewer/types";
import { stageProps } from "./__fixtures__/stageProps";
import { TableStage } from "./TableStage";
import { SPOTLIGHT_LINGER_MS, useSpotlight } from "./useSpotlight";

const names: Quad<string> = ["A", "B", "C", "D"];
const styles = () => [...document.head.querySelectorAll("style[data-spotlight]")];

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

function Probe({ kind }: { kind: number | null }) {
  const spotlight = useSpotlight();
  useEffect(() => {
    spotlight.hover(kind);
  }, [spotlight, kind]);
  return null;
}

describe("useSpotlight", () => {
  it("keeps one <style> for the outlined kind and removes it on unmount", () => {
    const { rerender, unmount } = render(<Probe kind={null} />);
    expect(styles()).toHaveLength(0);
    rerender(<Probe kind={22} />);
    expect(styles()).toHaveLength(1);
    expect(styles()[0]?.textContent).toContain('[data-k="22"]');
    rerender(<Probe kind={null} />);
    expect(styles()[0]?.textContent).toBe("");
    unmount();
    expect(styles()).toHaveLength(0);
  });
});

describe("the table's hover spotlight", () => {
  function renderWith(spotlight: Spotlight, overrides: Partial<TableStageProps> = {}) {
    const props = stageProps(
      { game, round, state: boardState(), names },
      { spotlight, ...overrides },
    );
    render(
      <I18nProvider>
        <TableStage {...props} />
      </I18nProvider>,
    );
  }

  function move(el: Element, init: Partial<PointerEventInit> = {}) {
    fireEvent.pointerMove(el, { pointerType: "mouse", buttons: 0, ...init });
    act(() => {
      vi.advanceTimersByTime(20);
    });
  }

  it("spotlights a hovered face-up tile's kind and lingers briefly after leaving it", () => {
    const spotlight = { hover: vi.fn(), clear: vi.fn() };
    renderWith(spotlight);
    move(screen.getByAltText("5 Man (red)"));
    expect(spotlight.hover).toHaveBeenLastCalledWith(4);
    move(screen.getByText("East 1"));
    expect(spotlight.clear).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SPOTLIGHT_LINGER_MS);
    });
    expect(spotlight.clear).toHaveBeenCalled();
  });

  it("spotlights the kind of a dora indicator on the console and of a tile in a pond", () => {
    const spotlight = { hover: vi.fn(), clear: vi.fn() };
    renderWith(spotlight);
    const button = screen.getByRole("button", { name: "Show score differences" });
    // The indicator is 3 Man.
    move(button.querySelector("img[data-k]") as HTMLElement);
    expect(spotlight.hover).toHaveBeenLastCalledWith(2);
    // A sideways tile is hovered by the tile inside its turned box.
    move(screen.getByAltText("9 Man, riichi declaration, called"));
    expect(spotlight.hover).toHaveBeenLastCalledWith(8);
    expect(spotlight.clear).not.toHaveBeenCalled();
  });

  it("spotlights nothing over a face-down tile, which has no kind to show", () => {
    const spotlight = { hover: vi.fn(), clear: vi.fn() };
    renderWith(spotlight, { revealed: new Set<Seat>([0]) });
    const hidden = screen.getByRole("group", { name: "B's hand, 13 tiles face down" });
    move(hidden.firstElementChild as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(SPOTLIGHT_LINGER_MS);
    });
    expect(spotlight.hover).not.toHaveBeenCalled();
    // The ends of the closed kan lie face down too, around its two faces.
    const kan = screen.getByRole("group", { name: /^Closed kan/ });
    move(kan.firstElementChild as HTMLElement);
    expect(spotlight.hover).not.toHaveBeenCalled();
    move(kan.children[1] as HTMLElement);
    expect(spotlight.hover).toHaveBeenLastCalledWith(22);
  });

  it("ignores touch pointers and moves with a button pressed", () => {
    const spotlight = { hover: vi.fn(), clear: vi.fn() };
    renderWith(spotlight);
    move(screen.getByAltText("5 Man (red)"), { pointerType: "touch" });
    move(screen.getByAltText("5 Man (red)"), { buttons: 1 });
    expect(spotlight.hover).not.toHaveBeenCalled();
  });

  it("clears on a press and on the wheel", () => {
    const spotlight = { hover: vi.fn(), clear: vi.fn() };
    renderWith(spotlight);
    const tile = screen.getByAltText("5 Man (red)");
    move(tile);
    fireEvent.pointerDown(tile, { button: 0 });
    expect(spotlight.clear).toHaveBeenCalledTimes(1);
    move(tile);
    fireEvent.wheel(tile, { deltaY: 50 });
    expect(spotlight.clear).toHaveBeenCalledTimes(2);
  });
});
