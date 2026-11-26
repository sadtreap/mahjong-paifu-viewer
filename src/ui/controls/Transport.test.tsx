// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { TransportProps } from "../viewer/types";
import { Transport } from "./Transport";

function props(patch: Partial<TransportProps> = {}): TransportProps {
  return {
    roundName: "East 3",
    turn: 9,
    limits: { gameStart: false, gameEnd: false, firstRound: false, lastRound: false },
    playing: false,
    speed: 1,
    breakpoint: "wide",
    onNav: vi.fn(() => true),
    onTogglePlay: vi.fn(),
    onSpeed: vi.fn(),
    onRoundList: vi.fn(),
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
  it("names every control in a labelled toolbar, with the shortcut in the tooltip", () => {
    renderTransport();
    expect(screen.getByRole("toolbar", { name: "Replay controls" })).toBeTruthy();
    for (const name of [
      "Previous round",
      "East 3. Open the round list",
      "Next round",
      "Previous own turn",
      "Next own turn",
      "Previous call, riichi or kita",
      "Previous step",
      "Autoplay",
      "Next step",
      "Next call, riichi or kita",
      "Autoplay speed: 1×",
    ]) {
      expect(button(name)).toBeTruthy();
    }
    expect(screen.getByText("Turn 9")).toBeTruthy();
    expect(button("Previous own turn").title).toBe("Previous own turn (Shift+←)");
    expect(button("Next step").title).toBe("Next step (→)");
    expect(button("Autoplay").title).toBe("Autoplay (Space)");
    expect(button("Next call, riichi or kita").title).toBe("Next call, riichi or kita (.)");
  });

  it("sends each button's command as a fresh user input", () => {
    const { onNav } = renderTransport();
    fireEvent.click(button("Previous round"));
    fireEvent.click(button("Next round"));
    fireEvent.click(button("Previous call, riichi or kita"));
    fireEvent.click(button("Next step"));
    fireEvent.click(button("Next own turn"));
    expect(vi.mocked(onNav).mock.calls).toEqual([
      [{ kind: "roundStartOrPrev" }, "user"],
      [{ kind: "nextRound" }, "user"],
      [{ kind: "keyMoment", dir: -1 }, "user"],
      [{ kind: "step", dir: 1 }, "user"],
      [{ kind: "ownTurn", dir: 1 }, "user"],
    ]);
  });

  it("keeps the focus on a button at its limit and does nothing", () => {
    const { onNav } = renderTransport({
      limits: { gameStart: false, gameEnd: true, firstRound: false, lastRound: true },
    });
    const next = button("Next step");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(button("Next round").getAttribute("aria-disabled")).toBe("true");
    expect(button("Previous step").getAttribute("aria-disabled")).toBe("false");
    act(() => next.focus());
    fireEvent.click(next);
    fireEvent.click(button("Next round"));
    expect(onNav).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
    expect(button("Autoplay").getAttribute("aria-disabled")).toBe("true");
  });

  it("marks autoplay with aria-pressed and keeps its name", () => {
    const { onTogglePlay } = renderTransport({ playing: true });
    const play = button("Autoplay");
    expect(play.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(play);
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

  it("opens the round list and cycles the speed", () => {
    const { onRoundList, onSpeed } = renderTransport({ speed: 4 });
    fireEvent.click(button("East 3. Open the round list"));
    expect(onRoundList).toHaveBeenCalledTimes(1);
    fireEvent.click(button("Autoplay speed: 4×"));
    expect(onSpeed).toHaveBeenCalledWith(0.5);
  });

  it("leaves the turn label, key moments and speed to the ⋯ menu on phones in portrait", () => {
    renderTransport({ breakpoint: "phonePortrait" });
    expect(screen.queryByText("Turn 9")).toBeNull();
    expect(screen.queryByRole("button", { name: /call, riichi or kita/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Autoplay speed/ })).toBeNull();
    expect(button("Next step")).toBeTruthy();
    expect(button("Autoplay")).toBeTruthy();
  });
});
