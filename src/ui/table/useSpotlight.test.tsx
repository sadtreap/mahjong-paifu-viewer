// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quad } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { boardState, game, round } from "../__fixtures__/game";
import type { Spotlight } from "../viewer/types";
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
  function renderWith(spotlight: Spotlight) {
    const props = stageProps({ game, round, state: boardState(), names }, { spotlight });
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
