// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quad } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { boardState, game, round } from "../__fixtures__/game";
import type { DiscardInfo, TableStageProps } from "../viewer/types";
import { stageProps } from "./__fixtures__/stageProps";
import { type PondTip, PondTooltip, placePondTip } from "./PondTooltip";
import { TableStage } from "./TableStage";
import { POND_DWELL_MS } from "./useSpotlight";

const names: Quad<string> = ["A", "B", "C", "D"];

function renderStage(overrides: Partial<TableStageProps> = {}) {
  const props = stageProps({ game, round, state: boardState(), names }, overrides);
  return render(
    <I18nProvider>
      <TableStage {...props} />
    </I18nProvider>,
  );
}

const pondTile = () => screen.getByAltText("7 Sou, discarded right after drawing, last discard");
const tip = () => screen.queryByText(/D · 1st discard · turn 1/);

function hover(el: Element, init: Partial<PointerEventInit> = {}) {
  fireEvent.pointerMove(el, { pointerType: "mouse", buttons: 0, ...init });
  act(() => {
    vi.advanceTimersByTime(20);
  });
}

function dwell(el: Element) {
  hover(el);
  act(() => {
    vi.advanceTimersByTime(POND_DWELL_MS);
  });
}

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

describe("PondTooltip", () => {
  it("appears after a 250 ms dwell with the discard's facts, hidden from screen readers", () => {
    const onPondDwell = vi.fn();
    renderStage({ onPondDwell });
    hover(pondTile());
    act(() => {
      vi.advanceTimersByTime(POND_DWELL_MS - 30);
    });
    expect(tip()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(30);
    });
    const head = tip();
    expect(head).not.toBeNull();
    const box = head?.parentElement as HTMLElement;
    expect(box.getAttribute("aria-hidden")).toBe("true");
    expect(box.textContent).toContain("tsumogiri");
    expect(box.textContent).toContain("Alt+click or the pin on the timeline: go there");
    expect(onPondDwell).toHaveBeenCalledWith({ seat: 3, index: 0 });
  });

  it("hides on a press, the wheel, a key and leaving the tile, keeping the pin", () => {
    const onPondDwell = vi.fn();
    renderStage({ onPondDwell });
    for (const end of [
      () => fireEvent.pointerDown(pondTile(), { button: 0 }),
      () => fireEvent.wheel(pondTile(), { deltaY: 100 }),
      () => fireEvent.keyDown(window, { key: "ArrowRight" }),
      () => hover(screen.getByAltText("5 Man (red)")),
    ]) {
      dwell(pondTile());
      expect(tip()).not.toBeNull();
      act(end);
      expect(tip()).toBeNull();
    }
    expect(onPondDwell).not.toHaveBeenCalledWith(null);
  });

  it("ignores touch and pen pointers and moves with a button held", () => {
    const onPondDwell = vi.fn();
    renderStage({ onPondDwell });
    for (const init of [{ pointerType: "touch" }, { pointerType: "pen" }, { buttons: 1 }]) {
      hover(pondTile(), init);
      act(() => {
        vi.advanceTimersByTime(POND_DWELL_MS * 2);
      });
      expect(tip()).toBeNull();
    }
    expect(onPondDwell).not.toHaveBeenCalled();
  });

  it("hides when the position changes", () => {
    const props = stageProps({ game, round, state: boardState(), names });
    const { rerender } = render(
      <I18nProvider>
        <TableStage {...props} />
      </I18nProvider>,
    );
    dwell(pondTile());
    expect(tip()).not.toBeNull();
    rerender(
      <I18nProvider>
        <TableStage {...props} state={boardState({ wallRemaining: 59 })} />
      </I18nProvider>,
    );
    expect(tip()).toBeNull();
  });
});

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe("placePondTip", () => {
  const stage = rect(100, 50, 1000, 700);

  it("centres the tooltip over the console, in stage pixels, within the console's box", () => {
    const desk = rect(400, 200, 300, 220);
    expect(placePondTip({ stage, console: desk })).toEqual({
      x: 450,
      y: 260,
      maxWidth: 270,
      maxHeight: 198,
      compact: false,
    });
  });

  it("is compact over a small console, with all of its height, and takes the stage's centre without one", () => {
    expect(placePondTip({ stage, console: rect(150, 150, 100, 90) })).toMatchObject({
      compact: true,
      maxWidth: 90,
      maxHeight: 90,
    });
    expect(placePondTip({ stage, console: rect(0, 0, 0, 0) })).toMatchObject({
      x: 500,
      y: 350,
    });
  });
});

describe("PondTooltip fitting a small console", () => {
  const info: DiscardInfo = {
    step: 40,
    decisionStep: 39,
    turn: 9,
    tile: "2p",
    tsumogiri: true,
    riichi: false,
    afterRiichi: false,
    called: true,
  };
  const tipFor = (name: string): PondTip => ({
    ref: { seat: 1, index: 4 },
    info,
    name,
    rects: { stage: rect(0, 0, 320, 400), console: rect(120, 120, 66, 66) },
  });
  /** Box metrics: the content is 13 px (a line) taller than the box until `fits` says otherwise. */
  function measure(fits: (el: HTMLElement) => boolean) {
    const spies = [
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 60),
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
        this: HTMLElement,
      ) {
        return fits(this) ? 60 : 73;
      }),
    ];
    return () => {
      for (const spy of spies) {
        spy.mockRestore();
      }
    };
  }

  it("drops the hint, the turn and then the head until it fits, keeping the facts line", () => {
    const restore = measure((el) => el.children.length <= 1);
    try {
      render(
        <I18nProvider>
          <PondTooltip tip={tipFor("Kuroneko77")} />
        </I18nProvider>,
      );
      const facts = screen.getByText("tsumogiri · called");
      const box = facts.parentElement as HTMLElement;
      expect(box.children).toHaveLength(1);
      expect(box.textContent).not.toContain("Kuroneko77");
    } finally {
      restore();
    }
  });

  it("drops only the turn when the short head fits", () => {
    const restore = measure((el) => !(el.textContent ?? "").includes("turn"));
    try {
      render(
        <I18nProvider>
          <PondTooltip tip={tipFor("A")} />
        </I18nProvider>,
      );
      expect(screen.getByText("A · 5th discard")).not.toBeNull();
      expect(screen.getByText("tsumogiri · called")).not.toBeNull();
      expect(screen.queryByText(/go there/)).toBeNull();
    } finally {
      restore();
    }
  });

  it("keeps every line when it fits", () => {
    render(
      <I18nProvider>
        <PondTooltip tip={tipFor("A")} />
      </I18nProvider>,
    );
    expect(screen.getByText("A · 5th discard · turn 9")).not.toBeNull();
    expect(screen.getByText(/go there/)).not.toBeNull();
  });
});
