// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameLog } from "../core/model";
import { I18nProvider } from "../i18n/I18nProvider";
import { makeGame, makeSanmaGame, sampleRound, sampleSanmaRound } from "../test/round-builder";
import { game as fixtureGame } from "./__fixtures__/game";
import { BREAKPOINT_QUERIES } from "./breakpoints";
import { SettingsProvider } from "./settings/SettingsProvider";
import { resetBreakpointCache } from "./useBreakpoint";
import { Viewer } from "./Viewer";
import { doubleRonRound } from "./viewer/__fixtures__/games";
import type { Breakpoint, LinkSource, ViewerStart } from "./viewer/types";

/**
 * Three rounds told apart by their names: East 1 (sampleRound, 25 steps: 7 draw S0, 8 riichi S0,
 * 24 ron), East 2 (the same round) and East 3 (a double ron in 4 steps).
 */
const threeRounds: GameLog = makeGame([
  sampleRound(),
  { ...sampleRound(), number: 2 },
  { ...doubleRonRound(), number: 3 },
]);

/** Two three-player rounds (24 steps each). */
const sanma: GameLog = makeSanmaGame([sampleSanmaRound(), { ...sampleSanmaRound(), number: 2 }]);

/** A matchMedia that answers for one breakpoint (and nothing else, so no reduced motion). */
function useBreakpointForTest(breakpoint: Breakpoint) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      matches: BREAKPOINT_QUERIES[breakpoint] === query,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  resetBreakpointCache();
}

interface Options {
  game?: GameLog;
  start?: ViewerStart | null;
  origin?: LinkSource | null;
  welcome?: ReactNode;
  onDismissWelcome?: () => void;
}

function renderViewer({
  game = threeRounds,
  start = null,
  origin = null,
  welcome = null,
  onDismissWelcome = () => {},
}: Options = {}) {
  const focusRef = createRef<HTMLElement>();
  const result = render(
    <I18nProvider>
      <SettingsProvider>
        <Viewer
          game={game}
          start={start}
          origin={origin}
          newEntry={false}
          focusRef={focusRef}
          welcome={welcome}
          onDismissWelcome={onDismissWelcome}
        />
      </SettingsProvider>
    </I18nProvider>,
  );
  return { ...result, focusRef };
}

const at = (round: number, step: number, pov: ViewerStart["pov"] = null): ViewerStart => ({
  round,
  step,
  pov,
});

const counter = () => screen.getByText(/^Step \d+ \/ \d+$/).textContent;
const roundName = () =>
  within(screen.getByRole("toolbar", { name: "Replay controls" }))
    .getByRole("button", { name: /Open the round list/ })
    .getAttribute("aria-label");
const liveText = () => document.querySelector('[aria-live="polite"]')?.textContent ?? "";
const stage = () => screen.getByRole("region", { name: "Mahjong table" });

/** Presses a key on an element (the window by default); false when a handler prevented it. */
async function press(
  key: string,
  options: { code?: string; shiftKey?: boolean; repeat?: boolean; target?: Element | Window } = {},
): Promise<boolean> {
  const { target = window, ...init } = options;
  let allowed = true;
  await act(async () => {
    allowed = fireEvent.keyDown(target, { key, ...init });
  });
  return allowed;
}

beforeEach(() => {
  useBreakpointForTest("laptop");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetBreakpointCache();
  window.history.replaceState(null, "", "/");
});

describe("Viewer keys", () => {
  it("steps, skips to own turns and key moments, and moves between rounds", async () => {
    renderViewer();
    expect(counter()).toBe("Step 1 / 25");
    await press("ArrowRight");
    await press("ArrowRight");
    expect(counter()).toBe("Step 3 / 25");
    await press("ArrowLeft");
    expect(counter()).toBe("Step 2 / 25");
    // The point of view's next draw (step 7) and the next riichi (step 8).
    await press("ArrowRight", { shiftKey: true });
    expect(counter()).toBe("Step 8 / 25");
    await press(".");
    expect(counter()).toBe("Step 9 / 25");
    await press("ArrowDown");
    expect(roundName()).toBe("East 2. Open the round list");
    expect(counter()).toBe("Step 1 / 25");
    await press("ArrowRight");
    await press("ArrowRight");
    // Up: the start of this round, then the start of the previous one.
    await press("ArrowUp");
    expect(roundName()).toBe("East 2. Open the round list");
    expect(counter()).toBe("Step 1 / 25");
    await press("ArrowUp");
    expect(roundName()).toBe("East 1. Open the round list");
    await press("End");
    expect(counter()).toBe("Step 25 / 25");
    await press("Home");
    expect(counter()).toBe("Step 1 / 25");
  });

  it("stops key auto-repeat at the round's result, and a fresh press goes on", async () => {
    renderViewer({ start: at(0, 21) });
    for (let i = 0; i < 6; i++) {
      await press("ArrowRight", { repeat: true });
    }
    expect(roundName()).toBe("East 1. Open the round list");
    expect(counter()).toBe("Step 25 / 25");
    await press("ArrowRight");
    expect(roundName()).toBe("East 2. Open the round list");
    expect(counter()).toBe("Step 1 / 25");
  });

  it("does nothing on next round at the end of the game", async () => {
    renderViewer({ start: at(2, 99) });
    expect(counter()).toBe("Step 4 / 4");
    await press("ArrowDown");
    await press("ArrowRight");
    expect(roundName()).toBe("East 3. Open the round list");
    expect(counter()).toBe("Step 4 / 4");
  });

  it("goes to the round's start on up, and nowhere from the first step of the game", async () => {
    renderViewer({ start: at(0, 3) });
    await press("ArrowUp");
    expect(counter()).toBe("Step 1 / 25");
    await press("ArrowUp");
    expect(roundName()).toBe("East 1. Open the round list");
    expect(counter()).toBe("Step 1 / 25");
  });

  it("leaves the arrow and paging keys to the focused step slider", async () => {
    renderViewer({ start: at(1, 2) });
    const slider = screen.getByRole("slider");
    act(() => slider.focus());
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]) {
      // Not prevented by the viewer: the slider handles them within the round.
      await press(key, { target: slider });
    }
    expect(roundName()).toBe("East 2. Open the round list");
  });

  it("leaves Page Up and Page Down to page scrolling", async () => {
    renderViewer({ start: at(0, 2) });
    expect(await press("PageDown", { target: document.body })).toBe(true);
    expect(await press("PageUp", { target: document.body })).toBe(true);
    expect(counter()).toBe("Step 3 / 25");
  });

  it("views from seats 1 to 3 in a three-player game and ignores 4", async () => {
    renderViewer({ game: sanma });
    const pov = () =>
      screen.getByRole("button", { name: /^Point of view:/ }).getAttribute("aria-label");
    expect(pov()).toBe("Point of view: A");
    await press("2", { code: "Digit2" });
    expect(pov()).toBe("Point of view: B");
    await press("3", { code: "Digit3" });
    expect(pov()).toBe("Point of view: C");
    await press("4", { code: "Digit4" });
    expect(pov()).toBe("Point of view: C");
    await press("v");
    expect(pov()).toBe("Point of view: A");
    expect(screen.queryByText("Player 4")).toBeNull();
  });

  it("shows all hands and switches to the flat table with H and C", async () => {
    renderViewer();
    const hands = screen.getByRole("button", { name: "Show all hands" });
    expect(hands.getAttribute("aria-pressed")).toBe("true");
    expect(stage().hasAttribute("data-walls")).toBe(false);
    await press("h");
    expect(hands.getAttribute("aria-pressed")).toBe("false");
    expect(stage().hasAttribute("data-walls")).toBe(true);
    await press("c");
    expect(stage().getAttribute("data-view")).toBe("flat");
  });
});

describe("Viewer hidden information", () => {
  it("keeps opponents' draws out of the step slider's value text while hands are hidden", () => {
    localStorage.setItem(
      "mahjong-paifu-viewer:settings",
      JSON.stringify({ version: 1, showAllHands: false }),
    );
    // Step 4 of the fixture round: B draws 2 Pin.
    renderViewer({ game: fixtureGame, start: at(0, 3, 0) });
    expect(liveText()).toMatch(/B draws$/);
    const slider = screen.getByRole("slider", { name: "Step in this round" });
    expect(slider.getAttribute("aria-valuetext")).toMatch(/B draws$/);
    expect(slider.getAttribute("aria-valuetext")).not.toMatch(/Pin/);
  });
});

describe("Viewer result card", () => {
  it("opens at the round end, hides on Esc and comes back on End", async () => {
    renderViewer({ start: at(0, 23) });
    expect(screen.queryByRole("region", { name: "Round result" })).toBeNull();
    await press("ArrowRight");
    const card = screen.getByRole("region", { name: "Round result" });
    expect(card.closest("[data-stage]")).not.toBeNull();
    expect(liveText()).toMatch(/Result · A wins by ron off B/);

    await press("Escape");
    expect(screen.queryByRole("region", { name: "Round result" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show result" })).toBeTruthy();
    await press("End");
    expect(screen.getByRole("region", { name: "Round result" })).toBeTruthy();
  });

  it("gives the focus to the stage when the card goes away with it", async () => {
    renderViewer({ start: at(0, 24) });
    const hide = screen.getByRole("button", { name: "Hide" });
    act(() => hide.focus());
    await act(async () => {
      fireEvent.click(hide);
    });
    expect(document.activeElement).toBe(stage());

    await press("End");
    const card = screen.getByRole("region", { name: "Round result" });
    const next = within(card).getByRole("button", { name: /Next round/ });
    act(() => next.focus());
    await press("ArrowRight", { target: next });
    expect(roundName()).toBe("East 2. Open the round list");
    expect(document.activeElement).toBe(stage());
  });

  it("forgets an open sheet when the layout leaves sheet mode", async () => {
    localStorage.setItem(
      "mahjong-paifu-viewer:settings",
      JSON.stringify({ version: 1, hintSeen: true }),
    );
    renderViewer({ start: at(0, 24) });
    await press("r");
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    // Resize to wide: the rail becomes a column and the card docks in it.
    await act(async () => {
      useBreakpointForTest("wide");
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("region", { name: "Round result" })).toBeTruthy();
    // The first Esc hides the card (no invisible sheet takes it).
    await press("Escape");
    expect(screen.queryByRole("region", { name: "Round result" })).toBeNull();
    // Back on a laptop the sheet stays closed.
    await act(async () => {
      useBreakpointForTest("laptop");
      window.dispatchEvent(new Event("resize"));
    });
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("docks the card in the review column on wide screens", async () => {
    useBreakpointForTest("wide");
    renderViewer({ start: at(0, 24) });
    const card = screen.getByRole("region", { name: "Round result" });
    expect(card.closest("[data-stage]")).toBeNull();
    expect(card.closest("aside")).not.toBeNull();
    // The felt stays clickable: next round.
    fireEvent.click(within(card).getByRole("button", { name: /Next round/ }));
    expect(roundName()).toBe("East 2. Open the round list");
  });

  it("shows final standings at the end of the game", () => {
    renderViewer({ game: fixtureGame, start: at(0, 99) });
    expect(screen.getByRole("heading", { name: "Final standings" })).toBeTruthy();
    expect(screen.getByText("2 han · 40 fu · 3,900 points")).toBeTruthy();
  });
});

describe("Viewer autoplay", () => {
  it("plays on Space and pauses at the round's result", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 20) });
    const autoplay = screen.getByRole("button", { name: "Autoplay" });
    await press(" ", { code: "Space" });
    expect(autoplay.getAttribute("aria-pressed")).toBe("true");
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
    }
    expect(counter()).toBe("Step 25 / 25");
    expect(autoplay.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("Viewer table input", () => {
  it("steps forward on a click on the table and back on a right click", async () => {
    renderViewer({ start: at(0, 2) });
    const table = stage();
    await act(async () => {
      fireEvent.pointerDown(table, {
        button: 0,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(table, {
        button: 0,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
      });
    });
    expect(counter()).toBe("Step 4 / 25");
    await act(async () => {
      fireEvent.pointerDown(table, {
        button: 2,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(table, {
        button: 2,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
      });
    });
    expect(counter()).toBe("Step 3 / 25");
  });

  it("dismisses the welcome card on the first table step", async () => {
    const onDismissWelcome = vi.fn();
    renderViewer({ welcome: <p>Welcome!</p>, onDismissWelcome });
    expect(screen.getByText("Welcome!").closest("[data-stage]")).not.toBeNull();
    await press("ArrowRight");
    expect(onDismissWelcome).toHaveBeenCalledTimes(1);
  });

  it("dismisses the coach mark on the first table step", async () => {
    renderViewer();
    expect(screen.getByRole("button", { name: "Got it" })).toBeTruthy();
    await press("ArrowRight");
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
  });
});

describe("Viewer history and links", () => {
  it("pushes a jump from the round matrix and goes back on Backspace", async () => {
    useBreakpointForTest("wide");
    const push = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    renderViewer({ start: at(0, 5) });
    expect(await press("Backspace", { target: document.body })).toBe(true);
    const rounds = screen.getByRole("region", { name: "Rounds" });
    const roundButtons = within(rounds).getAllByRole("button", { name: /East 2/ });
    await act(async () => {
      fireEvent.click(roundButtons[0] as HTMLElement);
    });
    expect(roundName()).toBe("East 2. Open the round list");
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /^Back to E1 · turn/ })).toBeTruthy();
    expect(await press("Backspace", { target: document.body })).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("restores a position from Back and Forward without a caption", async () => {
    renderViewer({ start: at(0, 7) });
    const captions = () =>
      screen.queryAllByText("Riichi").filter((el) => el.closest('[aria-hidden="true"]'));
    await press("ArrowRight");
    expect(captions()).toHaveLength(1);
    const entry = window.history.state as { sid?: string };
    await press("ArrowDown");
    expect(roundName()).toBe("East 2. Open the round list");
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { v: 1, round: 0, step: 7, pov: 0, sid: entry.sid, n: 0 },
        }),
      );
    });
    expect(roundName()).toBe("East 1. Open the round list");
    expect(counter()).toBe("Step 9 / 25");
    expect(captions()).toHaveLength(0);
  });

  it("writes the sample and position into the address after single steps", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    const replace = vi.spyOn(window.history, "replaceState");
    renderViewer({ origin: { kind: "sample", id: "tenhou-json" } });
    await press("ArrowRight");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    const url = String(replace.mock.calls.at(-1)?.[2]);
    expect(url).toContain("sample=tenhou-json");
    expect(url).toContain("round=1");
    expect(url).toContain("step=2");
    expect(url).toContain("pov=1");
  });

  it("keeps parameters out of the address for a local log", async () => {
    vi.useFakeTimers();
    const replace = vi.spyOn(window.history, "replaceState");
    renderViewer();
    await press("ArrowRight");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalled();
    for (const call of replace.mock.calls) {
      expect(String(call[2])).not.toContain("?");
    }
    expect(
      screen
        .getByRole("button", { name: "Copy link to this moment" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("copies a link to the clipboard and says so", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderViewer({ origin: { kind: "sample", id: "tenhou-json" }, start: at(0, 4) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link to this moment" }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toMatch(
      /\?sample=tenhou-json&round=1&step=5&pov=1$/,
    );
    expect(liveText()).toBe("Link copied");
  });
});

describe("Viewer focus and announcements", () => {
  it("has exactly one live region, which announces each step", async () => {
    renderViewer({ start: at(0, 24) });
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    await press("ArrowRight");
    expect(liveText()).toContain("East 2: starting hands dealt");
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it("keeps a playback button focusable when it reaches its limit", async () => {
    renderViewer({ start: at(2, 2) });
    const next = screen.getByRole("button", { name: "Next step" });
    act(() => next.focus());
    await act(async () => {
      fireEvent.click(next);
    });
    expect(counter()).toBe("Step 4 / 4");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(next);
    await act(async () => {
      fireEvent.click(next);
    });
    expect(counter()).toBe("Step 4 / 4");
  });

  it("attaches the shell's focus ref to the stage", () => {
    const { focusRef } = renderViewer();
    expect(focusRef.current).toBe(stage());
  });

  it("names the sanma players and leaves the empty chair out", () => {
    useBreakpointForTest("wide");
    renderViewer({ game: sanma });
    const players = screen.getByRole("region", { name: "Players" });
    expect(within(players).getAllByRole("button")).toHaveLength(3);
  });
});
