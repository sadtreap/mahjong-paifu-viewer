// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { SettingsProvider } from "../settings/SettingsProvider";
import type { RoundSummary, TransportProps } from "../viewer/types";
import { Transport } from "./Transport";

const ROUNDS: RoundSummary[] = [
  { index: 0, wind: 0, number: 3, honba: 0, outcome: null, deltas: [0, 0, 0, 0] },
  { index: 1, wind: 0, number: 3, honba: 2, outcome: null, deltas: [0, 0, 0, 0] },
];

function props(patch: Partial<TransportProps> = {}): TransportProps {
  return {
    arrangement: "wide",
    turn: 9,
    limits: { gameStart: false, gameEnd: false, lastRound: false },
    playing: false,
    speed: 1,
    onNav: vi.fn(() => true),
    onTogglePlay: vi.fn(),
    onSpeed: vi.fn(),
    onShowResult: null,
    scrubber: {
      round: 0,
      steps: 12,
      step: 4,
      describe: () => "A draws",
      turnOf: () => 2,
      onSeek: vi.fn(),
    },
    roundList: {
      rounds: ROUNDS,
      current: 0,
      names: ["A", "B", "C", "D"],
      pov: 0,
      onRound: vi.fn(),
      onFinal: vi.fn(),
      open: false,
      onOpenChange: vi.fn(),
    },
    rootRef: { current: null },
    ...patch,
  };
}

function renderTransport(patch: Partial<TransportProps> = {}) {
  const all = props(patch);
  render(
    <I18nProvider>
      <SettingsProvider>
        <Transport {...all} />
      </SettingsProvider>
    </I18nProvider>,
  );
  return all;
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });

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
    const group = screen.getByRole("group", { name: "Replay controls" });
    expect(group.getAttribute("data-gesture")).toBe("ignore");
    expect(group.getAttribute("data-arrangement")).toBe("wide");
    for (const name of [
      "Previous round",
      "East 3, round list",
      "Next round",
      "Previous own turn",
      "Next own turn",
      "Previous step",
      "Play",
      "Next step",
      "Autoplay speed: 1×",
    ]) {
      expect(button(name)).toBeTruthy();
    }
    expect(screen.getAllByRole("button")).toHaveLength(9);
    expect(screen.getByText("Turn 9")).toBeTruthy();
    expect(button("Previous own turn").title).toBe("Previous own turn (Shift+←)");
    expect(button("Next step").title).toBe("Next step (→)");
    expect(button("Play").title).toBe("Play (Space)");
    expect(button("Next round").title).toBe("Next round (↓)");
    expect(button("East 3, round list").title).toBe("Rounds (R)");
    expect(button("Autoplay speed: 1×").title).toBe("Autoplay speed: 1× (+ / −)");
  });

  it("puts the controls in the order the eye meets them", () => {
    renderTransport({ onShowResult: vi.fn() });
    const group = screen.getByRole("group", { name: "Replay controls" });
    const names = [...group.querySelectorAll("button, input")].map((control) =>
      control.getAttribute("aria-label"),
    );
    expect(names).toEqual([
      null,
      "Step in this round",
      "Previous round",
      "East 3, round list",
      "Next round",
      "Previous own turn",
      "Next own turn",
      "Previous step",
      "Play",
      "Next step",
      "Autoplay speed: 1×",
    ]);
    expect(group.querySelector("button")?.textContent).toBe("Show result");
  });

  it("adds the honba count to the round button only when there is one", () => {
    /** What the button shows: the parts of its one face that is not hidden. */
    const face = (round: HTMLElement) =>
      [...(round.querySelector("span > span:not([aria-hidden]) > span")?.children ?? [])].map(
        (part) => part.textContent,
      );
    renderTransport();
    expect(face(button("East 3, round list"))).toEqual(["East 3"]);
    cleanup();
    renderTransport({ roundList: { ...props().roundList, current: 1 } });
    expect(face(button("East 3 · 2 honba, round list"))).toEqual(["East 3", "2 honba"]);
  });

  it("holds every round's text of the game, hidden, so the round button keeps one width", () => {
    renderTransport();
    const hidden = [...button("East 3, round list").querySelectorAll('span[aria-hidden="true"]')];
    expect(hidden.map((text) => text.textContent)).toEqual(["East 3", "East 32 honba"]);
  });

  it("sends each button's command as a fresh user input", () => {
    const { onNav } = renderTransport();
    fireEvent.click(button("Previous round"));
    fireEvent.click(button("Next round"));
    fireEvent.click(button("Next step"));
    fireEvent.click(button("Next own turn"));
    expect(vi.mocked(onNav).mock.calls).toEqual([
      [{ kind: "roundStartOrPrev" }, "user"],
      [{ kind: "nextRound" }, "user"],
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
    expect(button("Next round").getAttribute("aria-disabled")).toBe("true");
    expect(button("Previous step").getAttribute("aria-disabled")).toBe("false");
    act(() => next.focus());
    fireEvent.click(next);
    fireEvent.click(button("Next round"));
    expect(onNav).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
    // Nothing is left to play at the game's end.
    expect(button("Play").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button("Play"));
    expect(onTogglePlay).not.toHaveBeenCalled();
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
    fireEvent.click(button("Autoplay speed: 4×"));
    expect(onSpeed).toHaveBeenCalledWith(0.5);
  });

  it("shows Show result only while there is a hidden card to show", () => {
    renderTransport();
    expect(screen.queryByRole("button", { name: "Show result" })).toBeNull();
    cleanup();
    const onShowResult = vi.fn();
    renderTransport({ onShowResult });
    expect(button("Show result").title).toBe("Show result (End)");
    fireEvent.click(button("Show result"));
    expect(onShowResult).toHaveBeenCalledTimes(1);
  });

  it("makes the step buttons large in the block under the table only", () => {
    renderTransport({ arrangement: "stack" });
    for (const name of ["Previous step", "Play", "Next step"]) {
      expect(button(name).getAttribute("data-size")).toBe("lg");
    }
    expect(button("Next round").hasAttribute("data-size")).toBe(false);
    cleanup();
    renderTransport({ arrangement: "short" });
    expect(button("Next step").hasAttribute("data-size")).toBe(false);
  });
});
