// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { TransportProps } from "../viewer/types";
import { Transport } from "./Transport";

function props(patch: Partial<TransportProps> = {}): TransportProps {
  return {
    limits: { gameStart: false, gameEnd: false, lastRound: false },
    playing: false,
    speed: 1,
    onNav: vi.fn(() => true),
    onTogglePlay: vi.fn(),
    onSpeed: vi.fn(),
    scrubber: {
      round: 0,
      steps: 12,
      step: 4,
      describe: () => "A draws",
      turnOf: () => 2,
      onSeek: vi.fn(),
    },
    ...patch,
  };
}

function renderTransport(patch: Partial<TransportProps> = {}) {
  const all = props(patch);
  render(
    <I18nProvider>
      <Transport {...all} />
    </I18nProvider>,
  );
  return all;
}

const group = () => screen.getByRole("group", { name: "Replay controls" });
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const slider = () => screen.getByRole("slider", { name: "Step in this round" }) as HTMLInputElement;
/** The step's number beside the slider, e.g. "5 / 12". */
const stepText = () => [...group().children].find((child) => child.tagName === "SPAN");

function hold(target: HTMLElement, ms: number) {
  fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  fireEvent.pointerUp(target, { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse" });
  fireEvent.click(target);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe("Transport", () => {
  it("names every control in a labelled group, with the shortcut in the tooltip", () => {
    renderTransport();
    for (const name of [
      "Previous own turn",
      "Previous step",
      "Play",
      "Next step",
      "Next own turn",
      "Autoplay speed: 1×",
    ]) {
      expect(group().contains(button(name)), name).toBe(true);
    }
    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(button("Previous own turn").title).toBe("Previous own turn (Shift+←)");
    expect(button("Next own turn").title).toBe("Next own turn (Shift+→)");
    expect(button("Previous step").title).toBe("Previous step (←)");
    expect(button("Next step").title).toBe("Next step (→)");
    expect(button("Play").title).toBe("Play (Space)");
    expect(button("Autoplay speed: 1×").title).toBe("Autoplay speed: 1× (+ / −)");
    expect(button("Autoplay speed: 1×").textContent).toBe("1×");
  });

  it("puts the controls in the order the eye meets them", () => {
    renderTransport();
    const names = [...group().querySelectorAll("button, input")].map((control) =>
      control.getAttribute("aria-label"),
    );
    expect(names).toEqual([
      "Previous own turn",
      "Previous step",
      "Play",
      "Next step",
      "Next own turn",
      "Step in this round",
      "Autoplay speed: 1×",
    ]);
  });

  it("has neither round buttons nor a round list, and nothing about the result", () => {
    renderTransport({ limits: { gameStart: false, gameEnd: false, lastRound: false } });
    for (const name of ["Previous round", "Next round", "Show result", /round list/, /^East/]) {
      expect(screen.queryByRole("button", { name }), String(name)).toBeNull();
    }
    expect(group().querySelector("[aria-expanded], [aria-haspopup]")).toBeNull();
    // The bar lies under the table, not on it: it takes no part in the stage's gestures.
    expect(group().hasAttribute("data-gesture")).toBe(false);
    expect(group().hasAttribute("data-arrangement")).toBe(false);
  });

  it("shows the step's number beside the slider, for the eye only", () => {
    renderTransport();
    expect(stepText()?.textContent).toBe("5 / 12");
    expect(stepText()?.getAttribute("aria-hidden")).toBe("true");
    // The slider says the same in words.
    expect(slider().value).toBe("5");
    expect(slider().max).toBe("12");
    expect(slider().getAttribute("aria-valuetext")).toBe("Step 5 of 12, turn 2: A draws");
  });

  it("keeps the step's number inside the round, as the slider does", () => {
    renderTransport({ scrubber: { ...props().scrubber, steps: 12, step: 40 } });
    expect(stepText()?.textContent).toBe("12 / 12");
    expect(slider().value).toBe("12");
    cleanup();
    renderTransport({ scrubber: { ...props().scrubber, steps: 12, step: -3 } });
    expect(stepText()?.textContent).toBe("1 / 12");
    cleanup();
    // A round that could not be replayed counts as one step.
    renderTransport({ scrubber: { ...props().scrubber, steps: 0, step: 0 } });
    expect(stepText()?.textContent).toBe("1 / 1");
    expect(slider().max).toBe("1");
  });

  it("scrubs to the step the slider is moved to", () => {
    const { scrubber } = renderTransport({ scrubber: { ...props().scrubber, round: 3 } });
    fireEvent.change(slider(), { target: { value: "9" } });
    expect(scrubber.onSeek).toHaveBeenCalledWith({ round: 3, step: 8 }, "scrub");
  });

  it("sends each button's command as a fresh user input", () => {
    const { onNav } = renderTransport();
    fireEvent.click(button("Previous own turn"));
    fireEvent.click(button("Previous step"));
    fireEvent.click(button("Next step"));
    fireEvent.click(button("Next own turn"));
    expect(vi.mocked(onNav).mock.calls).toEqual([
      [{ kind: "ownTurn", dir: -1 }, "user"],
      [{ kind: "step", dir: -1 }, "user"],
      [{ kind: "step", dir: 1 }, "user"],
      [{ kind: "ownTurn", dir: 1 }, "user"],
    ]);
  });

  it("keeps the focus on a button at its limit and does nothing", () => {
    const { onNav, onTogglePlay } = renderTransport({
      limits: { gameStart: false, gameEnd: true, lastRound: true },
    });
    const next = button("Next step");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(button("Next own turn").getAttribute("aria-disabled")).toBe("true");
    expect(button("Previous step").getAttribute("aria-disabled")).toBe("false");
    expect(button("Previous own turn").getAttribute("aria-disabled")).toBe("false");
    act(() => next.focus());
    fireEvent.click(next);
    fireEvent.click(button("Next own turn"));
    expect(onNav).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
    // Nothing is left to play at the game's end.
    expect(button("Play").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button("Play"));
    expect(onTogglePlay).not.toHaveBeenCalled();
  });

  it("disables only the backward buttons at the game's start", () => {
    const { onNav } = renderTransport({
      limits: { gameStart: true, gameEnd: false, lastRound: false },
    });
    expect(button("Previous step").getAttribute("aria-disabled")).toBe("true");
    expect(button("Previous own turn").getAttribute("aria-disabled")).toBe("true");
    expect(button("Next step").getAttribute("aria-disabled")).toBe("false");
    expect(button("Next own turn").getAttribute("aria-disabled")).toBe("false");
    expect(button("Play").getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(button("Previous step"));
    fireEvent.click(button("Previous own turn"));
    expect(onNav).not.toHaveBeenCalled();
  });

  it("does not disable the forward buttons in the last round before its end", () => {
    renderTransport({ limits: { gameStart: false, gameEnd: false, lastRound: true } });
    for (const name of ["Next step", "Next own turn", "Play"]) {
      expect(button(name).getAttribute("aria-disabled"), name).toBe("false");
    }
  });

  it("names the play button by what pressing it does, without a pressed state", () => {
    const { onTogglePlay } = renderTransport({ playing: true });
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    const pause = button("Pause");
    expect(pause.hasAttribute("aria-pressed")).toBe(false);
    expect(pause.title).toBe("Pause (Space)");
    fireEvent.click(pause);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("can still pause at the game's end", () => {
    const { onTogglePlay } = renderTransport({
      playing: true,
      limits: { gameStart: false, gameEnd: true, lastRound: true },
    });
    expect(button("Pause").getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(button("Pause"));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("repeats a held step button and stops when a step goes nowhere", () => {
    let left = 3;
    const onNav = vi.fn(() => left-- > 0);
    renderTransport({ onNav });
    hold(button("Next step"), 2000);
    // At 350 ms the first repeat, then every 100 ms until the fourth call returned false.
    expect(onNav).toHaveBeenCalledTimes(4);
    expect(vi.mocked(onNav).mock.calls.every((call) => (call as unknown[])[1] === "repeat")).toBe(
      true,
    );
  });

  it("repeats a held own-turn button too", () => {
    const { onNav } = renderTransport();
    hold(button("Previous own turn"), 600);
    const calls = vi.mocked(onNav).mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every(([command]) => command.kind === "ownTurn" && command.dir === -1)).toBe(true);
    expect(calls.every(([, source]) => source === "repeat")).toBe(true);
  });

  it("swallows the click that ends a hold, but a quick click steps once", () => {
    const { onNav } = renderTransport();
    hold(button("Previous step"), 360);
    expect(onNav).toHaveBeenCalledTimes(1);
    hold(button("Previous step"), 100);
    expect(onNav).toHaveBeenCalledTimes(2);
    expect(vi.mocked(onNav).mock.calls[1]).toEqual([{ kind: "step", dir: -1 }, "user"]);
  });

  it("does not lose the next click when a long touch press ends without one", () => {
    const { onNav } = renderTransport();
    const next = button("Next step");
    fireEvent.pointerDown(next, { pointerId: 2, isPrimary: true, button: 0, pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    fireEvent.pointerUp(next, { pointerId: 2, isPrimary: true, button: 0, pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(onNav).toHaveBeenCalledTimes(1);
    fireEvent.click(next);
    expect(onNav).toHaveBeenCalledTimes(2);
    expect(vi.mocked(onNav).mock.calls[1]).toEqual([{ kind: "step", dir: 1 }, "user"]);
  });

  it("steps as a repeat on Enter's auto-repeat", () => {
    const { onNav } = renderTransport();
    fireEvent.keyDown(button("Next step"), { key: "Enter", repeat: true });
    expect(onNav).toHaveBeenCalledWith({ kind: "step", dir: 1 }, "repeat");
  });

  it("cycles the speed", () => {
    const { onSpeed } = renderTransport({ speed: 4 });
    expect(button("Autoplay speed: 4×").textContent).toBe("4×");
    fireEvent.click(button("Autoplay speed: 4×"));
    expect(onSpeed).toHaveBeenCalledWith(0.5);
  });
});
