// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLog } from "../core/model";
import { I18nProvider } from "../i18n/I18nProvider";
import { readStorage, writeStorage } from "../storage";
import { makeGame, makeSanmaGame, sampleRound, sampleSanmaRound } from "../test/round-builder";
import { game as fixtureGame } from "./__fixtures__/game";
import { SHORT, WIDE } from "./arrangement";
import { CARD_GUARD_MS } from "./controls/ResultLayer";
import { SettingsProvider } from "./settings/SettingsProvider";
import { SETTINGS_STORAGE_NAME } from "./settings/settings";
import { useDialogs } from "./settings/useSettings";
import { RESULT_DELAY_MS, Viewer } from "./Viewer";
import { doubleRonRound } from "./viewer/__fixtures__/games";
import type { Arrangement, LinkSource, ViewerStart } from "./viewer/types";
import { TOAST_MS } from "./viewer/useToast";

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

/** A matchMedia that answers the arrangement queries (and nothing else, so no reduced motion). */
function arrange(arrangement: Arrangement) {
  const matching = { wide: WIDE, short: SHORT, stack: "" }[arrangement];
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      matches: query === matching,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
}

/** Shows which of the shell's dialogs the viewer asked for. */
function DialogProbe() {
  return <output data-testid="dialog">{useDialogs().dialog ?? ""}</output>;
}

interface Options {
  game?: GameLog;
  start?: ViewerStart | null;
  origin?: LinkSource | null;
  notice?: string | null;
}

function renderViewer({
  game = threeRounds,
  start = null,
  origin = null,
  notice = null,
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
          notice={notice}
        />
        <DialogProbe />
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

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const slider = () => screen.getByRole("slider", { name: "Step in this round" }) as HTMLInputElement;
/** The position in the round as the step slider has it: "step / steps", 1-based. */
const counter = () => `${slider().value} / ${slider().max}`;
const transport = () => screen.getByRole("group", { name: "Replay controls" });
/** The round on the table, as the round button names it. */
const roundName = () =>
  button(/, round list$/)
    .getAttribute("aria-label")
    ?.replace(/, round list$/, "");
const liveText = () => document.querySelector("[aria-live]")?.textContent ?? "";
const stage = () => screen.getByRole("region", { name: "Mahjong table" });
const card = () => screen.getByRole("region", { name: "Round result" });
const queryCard = () => screen.queryByRole("region", { name: "Round result" });
const stored = () =>
  JSON.parse(readStorage(SETTINGS_STORAGE_NAME) ?? "{}") as Record<string, unknown>;

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

async function click(target: Element) {
  await act(async () => {
    fireEvent.click(target);
  });
}

/** A press and release of a mouse button on the same spot. */
async function mouse(target: Element, mouseButton = 0, init: PointerEventInit = {}) {
  const event = {
    button: mouseButton,
    pointerId: 1,
    isPrimary: true,
    pointerType: "mouse",
    ...init,
  };
  await act(async () => {
    fireEvent.pointerDown(target, event);
    fireEvent.pointerUp(target, event);
  });
}

async function wheel(target: Element, deltaY: number) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
  // happy-dom's WheelEvent is not a MouseEvent: give it the modifier keys a browser's has.
  for (const key of ["shiftKey", "ctrlKey", "metaKey", "altKey"] as const) {
    Object.defineProperty(event, key, { value: false });
  }
  await act(async () => {
    target.dispatchEvent(event);
  });
}

/** Lets the result card's first moment pass, after which presses on it and beside it count. */
function afterGuard() {
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + CARD_GUARD_MS);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("Viewer keys", () => {
  it("steps, skips to own turns and moves between rounds", async () => {
    renderViewer();
    expect(counter()).toBe("1 / 25");
    await press("ArrowRight");
    await press("ArrowRight");
    expect(counter()).toBe("3 / 25");
    await press("ArrowLeft");
    expect(counter()).toBe("2 / 25");
    // The point of view's next draw (step 7).
    await press("ArrowRight", { shiftKey: true });
    expect(counter()).toBe("8 / 25");
    await press("ArrowDown");
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    await press("ArrowRight");
    await press("ArrowRight");
    // Up: the start of this round, then the start of the previous one.
    await press("ArrowUp");
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    await press("ArrowUp");
    expect(roundName()).toBe("East 1");
    await press("End");
    expect(counter()).toBe("25 / 25");
    await press("Home");
    expect(counter()).toBe("1 / 25");
  });

  it("stops key auto-repeat at the round's result, and fresh presses go on", async () => {
    renderViewer({ start: at(0, 21) });
    for (let i = 0; i < 6; i++) {
      await press("ArrowRight", { repeat: true });
    }
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
    expect(queryCard()).toBeNull();
    // The first brings up the result card, which was waiting; the next leaves the round.
    await press("ArrowRight");
    expect(queryCard()).not.toBeNull();
    expect(roundName()).toBe("East 1");
    await press("ArrowRight");
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
  });

  it("does nothing on next round at the end of the game", async () => {
    renderViewer({ start: at(2, 99) });
    expect(counter()).toBe("4 / 4");
    await press("ArrowDown");
    await press("ArrowRight");
    expect(roundName()).toBe("East 3");
    expect(counter()).toBe("4 / 4");
  });

  it("goes to the round's start on up, and nowhere from the first step of the game", async () => {
    renderViewer({ start: at(0, 3) });
    await press("ArrowUp");
    expect(counter()).toBe("1 / 25");
    await press("ArrowUp");
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("1 / 25");
  });

  it("leaves the arrow and paging keys to the focused step slider", async () => {
    renderViewer({ start: at(1, 2) });
    const range = slider();
    act(() => range.focus());
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]) {
      // Not taken by the viewer: the slider handles them within the round.
      await press(key, { target: range });
    }
    expect(roundName()).toBe("East 2");
  });

  it("scrubs within the round with the step slider and its page keys", async () => {
    renderViewer({ start: at(1, 2) });
    await act(async () => {
      fireEvent.change(slider(), { target: { value: "9" } });
    });
    expect(counter()).toBe("9 / 25");
    await press("PageUp", { target: slider() });
    expect(counter()).toBe("19 / 25");
    await press("PageUp", { target: slider() });
    expect(counter()).toBe("25 / 25");
    await press("PageDown", { target: slider() });
    expect(counter()).toBe("15 / 25");
    expect(roundName()).toBe("East 2");
  });

  it("leaves comma, period, Backspace and the page keys to the browser", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    renderViewer({ start: at(0, 2) });
    for (const key of [".", ",", "Backspace", "PageDown", "PageUp"]) {
      expect(await press(key, { target: document.body }), key).toBe(true);
    }
    expect(counter()).toBe("3 / 25");
    expect(back).not.toHaveBeenCalled();
  });

  it("views from seats 1 to 3 in a three-player game and ignores 4", async () => {
    renderViewer({ game: sanma });
    const pov = () => button(/^Point of view:/).getAttribute("aria-label");
    expect(pov()).toBe("Point of view: East, A");
    await press("2", { code: "Digit2" });
    expect(pov()).toBe("Point of view: South, B");
    await press("3", { code: "Digit3" });
    expect(pov()).toBe("Point of view: West, C");
    await press("4", { code: "Digit4" });
    expect(pov()).toBe("Point of view: West, C");
    await press("v");
    expect(pov()).toBe("Point of view: East, A");
    await press("v", { shiftKey: true });
    expect(pov()).toBe("Point of view: West, C");
    expect(document.body.textContent).not.toContain("Player 4");
  });

  it("shows all hands and switches to the flat table with H and C", async () => {
    renderViewer();
    const hands = button("Show all hands");
    expect(hands.getAttribute("aria-pressed")).toBe("true");
    expect(stage().hasAttribute("data-walls")).toBe(false);
    await press("h");
    expect(hands.getAttribute("aria-pressed")).toBe("false");
    expect(stage().hasAttribute("data-walls")).toBe(true);
    await click(hands);
    expect(stage().hasAttribute("data-walls")).toBe(false);
    await press("c");
    expect(stage().getAttribute("data-view")).toBe("flat");
  });

  it("turns the waits aid off and on with W and says so in a toast", async () => {
    renderViewer();
    const toast = () => screen.queryByText(/^Waits and shanten/, { ignore: "[aria-live] *" });
    expect(toast()).toBeNull();
    expect(await press("w")).toBe(false);
    expect(stored().showWaits).toBe(false);
    expect(toast()?.textContent).toBe("Waits and shanten off");
    expect(liveText()).toBe("Waits and shanten off");
    await press("w");
    expect(stored().showWaits).toBe(true);
    expect(toast()?.textContent).toBe("Waits and shanten on");
  });

  it("says in the live region what a key changed on the table, without a toast", async () => {
    renderViewer({ start: at(0, 2) });
    const said: string[] = [];
    for (const [key, code] of [
      ["h"],
      ["h"],
      ["c"],
      ["c"],
      ["d"],
      ["2", "Digit2"],
      ["v"],
      ["+"],
    ] as const) {
      await press(key, { code });
      said.push(liveText());
    }
    expect(said).toEqual([
      "Other players' hands hidden",
      "All hands shown",
      "Flat table",
      "3D table",
      "Score differences on",
      "Point of view: South, B",
      "Point of view: West, C",
      "Autoplay speed: 2×",
    ]);
    expect(screen.queryByText("Autoplay speed: 2×", { ignore: "[aria-live] *" })).toBeNull();
    // A step gives the live region back to the table.
    await press("ArrowRight");
    expect(liveText()).not.toBe("Autoplay speed: 2×");
  });

  it("shows and hides the score differences with D and the console, without moving", async () => {
    renderViewer({ start: at(0, 2) });
    const diff = button("Show score differences");
    expect(diff.getAttribute("aria-pressed")).toBe("false");
    expect(await press("d")).toBe(false);
    expect(diff.getAttribute("aria-pressed")).toBe("true");
    await click(diff);
    expect(diff.getAttribute("aria-pressed")).toBe("false");
    expect(counter()).toBe("3 / 25");
  });

  it("does nothing on letter keys while single-key shortcuts are off", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 2, charKeys: false }));
    renderViewer();
    for (const key of ["h", "w", "d", "c", "r", " "]) {
      expect(await press(key), key).toBe(true);
    }
    expect(button("Show all hands").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("group", { name: "Rounds" })).toBeNull();
    await press("ArrowRight");
    expect(counter()).toBe("2 / 25");
  });
});

describe("Viewer arrangement", () => {
  const PARTS = ["Dora indicators", "Viewer tools", "Mahjong table", "Replay controls"];
  /** The viewer's four parts, as they come in the document. */
  const order = () =>
    [...document.querySelectorAll("[aria-label]")]
      .map((element) => element.getAttribute("aria-label") ?? "")
      .filter((label) => PARTS.includes(label));

  it.each<Arrangement>(["wide", "short", "stack"])(
    "tells the table it is %s and has one transport, in its place",
    (arrangement) => {
      arrange(arrangement);
      renderViewer();
      expect(stage().getAttribute("data-arrangement")).toBe(arrangement);
      expect(screen.getAllByRole("group", { name: "Replay controls" })).toHaveLength(1);
      expect(transport().getAttribute("data-arrangement")).toBe(arrangement);
      // On a wide screen the bar lies on the felt; otherwise the controls come after the stage.
      expect(stage().contains(transport())).toBe(arrangement === "wide");
      expect(
        stage().compareDocumentPosition(transport()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it("keeps one order in the document: info chip, toolbar, stage, transport", () => {
    for (const arrangement of ["wide", "short", "stack"] as const) {
      arrange(arrangement);
      renderViewer();
      expect(order()).toEqual(PARTS);
      cleanup();
    }
  });

  /** What Tab goes through, by name, with the stage (which takes the focus from code) marked. */
  const tabOrder = () =>
    [...document.querySelectorAll<HTMLElement>("button, input, [tabindex]")]
      .filter((element) => element.matches("[data-stage]") || element.tabIndex >= 0)
      .map((element) =>
        element.matches("[data-stage]")
          ? "(stage)"
          : (element.getAttribute("aria-label") ?? element.textContent),
      );
  const TRANSPORT = [
    "Step in this round",
    "Previous round",
    "East 1, round list",
    "Next round",
    "Previous own turn",
    "Next own turn",
    "Previous step",
    "Play",
    "Next step",
    "Autoplay speed: 1×",
  ];

  it.each<Arrangement>(["wide", "short", "stack"])(
    "keeps the focus order of the screen when %s: toolbar, stage, result card, transport",
    async (arrangement) => {
      arrange(arrangement);
      renderViewer({ start: at(0, 24) });
      const tools = ["Show all hands", "Point of view: East, A", "Menu", "(stage)"];
      // The card, over the stage, comes before the bar even where the bar lies on the felt.
      expect(tabOrder()).toEqual([...tools, "Show table", "Next round", ...TRANSPORT]);
      expect(transport().contains(card())).toBe(false);
      await press("Escape");
      // The console on the felt is in reach again, and Show result leads the transport.
      expect(tabOrder()).toEqual([...tools, "Show score differences", "Show result", ...TRANSPORT]);
    },
  );

  it("has a heading, and neither a side panel nor a step counter", () => {
    renderViewer();
    expect(document.querySelector("aside")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mahjong Paifu Viewer");
    expect(document.body.textContent).not.toMatch(/Step \d+ \/ \d+/);
  });
});

describe("Viewer without a round to show", () => {
  it.each<Arrangement>(["wide", "stack"])(
    "says so in the table's place and keeps its controls when %s",
    (arrangement) => {
      arrange(arrangement);
      const { focusRef } = renderViewer({ game: makeGame([]) });
      expect(focusRef.current).toBe(stage());
      expect(within(stage()).getByText(/^This round could not be replayed/)).toBeTruthy();
      expect(liveText()).toMatch(/^This round could not be replayed/);
      expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
      expect(screen.getAllByRole("group", { name: "Replay controls" })).toHaveLength(1);
      expect(button("Menu")).toBeTruthy();
      expect(counter()).toBe("1 / 1");
    },
  );
});

describe("Viewer info chip", () => {
  it("shows the round's honba and deposits, and nothing for none", () => {
    renderViewer({
      game: makeGame([sampleRound(), { ...sampleRound(), honba: 2, riichiSticks: 1 }]),
    });
    const counts = () =>
      screen.getByRole("group", { name: "Dora indicators" }).parentElement?.querySelector("p")
        ?.textContent ?? null;
    expect(counts()).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(counts()).toBe("2 honba · 1 deposit");
    expect(roundName()).toBe("East 1 · 2 honba");
  });
});

describe("Viewer hidden information", () => {
  it("keeps opponents' draws out of the live region and the slider's value text", () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 2, showAllHands: false }));
    // Step 4 of the fixture round: B draws 2 Pin.
    renderViewer({ game: fixtureGame, start: at(0, 3, 0) });
    expect(liveText()).toMatch(/B draws$/);
    expect(slider().getAttribute("aria-valuetext")).toMatch(/B draws$/);
    expect(slider().getAttribute("aria-valuetext")).not.toMatch(/Pin/);
  });

  it("names the draw once the hands are shown, and says only that they are", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 2, showAllHands: false }));
    renderViewer({ game: fixtureGame, start: at(0, 3, 0) });
    await press("h");
    // The step is not read out again as if it were a new one.
    expect(liveText()).toBe("All hands shown");
    expect(slider().getAttribute("aria-valuetext")).toMatch(/B draws 2 Pin$/);
  });
});

describe("Viewer result card", () => {
  it("comes up a moment after a step reaches the round's end, hides on Esc and comes back on End", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 23) });
    expect(queryCard()).toBeNull();
    expect(stage().hasAttribute("data-overlay")).toBe(false);
    await press("ArrowRight");
    // The result is read out at once; the card waits so the win itself is seen first.
    expect(liveText()).toMatch(/Result · A wins by ron off B/);
    expect(queryCard()).toBeNull();
    expect(screen.queryByRole("button", { name: "Show result" })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(RESULT_DELAY_MS - 1);
    });
    expect(queryCard()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(card().closest("[data-stage]")).toBe(stage());
    expect(card().closest('[data-gesture="ignore"]')).not.toBeNull();
    expect(liveText()).toMatch(/Result · A wins by ron off B/);
    // The card never takes the focus when it appears.
    expect(card().contains(document.activeElement)).toBe(false);

    await press("Escape");
    expect(queryCard()).toBeNull();
    expect(button("Show result")).toBeTruthy();
    await press("End");
    expect(queryCard()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Show result" })).toBeNull();
  });

  it("comes up at once on a step forward while it waits, without leaving the round", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 23) });
    await press("ArrowRight");
    expect(queryCard()).toBeNull();
    await press("ArrowRight");
    expect(queryCard()).not.toBeNull();
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
    cleanup();

    // A press on the table does the same.
    renderViewer({ start: at(0, 23) });
    await mouse(stage());
    expect(queryCard()).toBeNull();
    await mouse(stage());
    expect(queryCard()).not.toBeNull();
    expect(counter()).toBe("25 / 25");
  });

  it("comes up at once after a jump to the round's end", async () => {
    renderViewer({ start: at(0, 3) });
    await press("End");
    expect(queryCard()).not.toBeNull();
    cleanup();
    renderViewer({ start: at(0, 3) });
    await act(async () => {
      fireEvent.change(slider(), { target: { value: "25" } });
    });
    expect(queryCard()).not.toBeNull();
  });

  it("stays away when Esc or a step back comes while it waits", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 23) });
    await press("ArrowRight");
    await press("Escape");
    await act(async () => {
      vi.advanceTimersByTime(RESULT_DELAY_MS);
    });
    expect(queryCard()).toBeNull();
    expect(button("Show result")).toBeTruthy();
    cleanup();

    renderViewer({ start: at(0, 23) });
    await press("ArrowRight");
    await press("ArrowLeft");
    await act(async () => {
      vi.advanceTimersByTime(RESULT_DELAY_MS);
    });
    expect(queryCard()).toBeNull();
    expect(counter()).toBe("24 / 25");
  });

  it("hides from its Show table button, and the stage takes the focus", async () => {
    renderViewer({ start: at(0, 24) });
    const hide = within(card()).getByRole("button", { name: "Show table" });
    act(() => hide.focus());
    await click(hide);
    expect(queryCard()).toBeNull();
    expect(document.activeElement).toBe(stage());
    expect(counter()).toBe("25 / 25");
  });

  it("hides on a press on the stage outside the card, without stepping", async () => {
    renderViewer({ start: at(0, 24) });
    afterGuard();
    const layer = card().parentElement as HTMLElement;
    await act(async () => {
      fireEvent.pointerDown(layer, { button: 0, pointerId: 1, isPrimary: true });
      fireEvent.pointerUp(layer, { button: 0, pointerId: 1, isPrimary: true });
      fireEvent.click(layer);
    });
    expect(queryCard()).toBeNull();
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
  });

  it("hides on a press on the table beside its layer, and only the next press goes on", async () => {
    renderViewer({ start: at(0, 24) });
    await mouse(stage());
    expect(queryCard()).toBeNull();
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
    await mouse(stage());
    expect(roundName()).toBe("East 2");
  });

  it("hides on a swipe to the left beside it, and goes back a step on a swipe to the right", async () => {
    renderViewer({ start: at(0, 24) });
    const swipe = async (from: number, to: number) => {
      const layer = card().parentElement as HTMLElement;
      const event = { button: 0, pointerId: 1, isPrimary: true, pointerType: "touch" };
      await act(async () => {
        fireEvent.pointerDown(layer, { ...event, clientX: from, clientY: 300 });
        fireEvent.pointerUp(layer, { ...event, clientX: to, clientY: 300 });
      });
    };
    afterGuard();
    await swipe(400, 200);
    expect(queryCard()).toBeNull();
    expect(counter()).toBe("25 / 25");
    await press("End");
    afterGuard();
    await swipe(200, 400);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("24 / 25");
  });

  it("goes back a step on a right press on the table beside its layer", async () => {
    renderViewer({ start: at(0, 24) });
    await mouse(stage(), 2);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("24 / 25");
  });

  it("stays for a press inside the card, a right press and a drag out of the card", async () => {
    renderViewer({ start: at(0, 24) });
    afterGuard();
    const layer = card().parentElement as HTMLElement;
    await act(async () => {
      fireEvent.pointerDown(card(), { button: 0, pointerId: 1, isPrimary: true });
      fireEvent.click(card());
    });
    expect(queryCard()).not.toBeNull();
    await act(async () => {
      fireEvent.pointerDown(layer, { button: 2, pointerId: 1, isPrimary: true });
      fireEvent.click(layer);
    });
    expect(queryCard()).not.toBeNull();
    // A press that starts on the card and ends outside it: the click lands on the layer.
    await act(async () => {
      fireEvent.pointerDown(card(), { button: 0, pointerId: 1, isPrimary: true });
      fireEvent.click(layer);
    });
    expect(queryCard()).not.toBeNull();
    expect(counter()).toBe("25 / 25");
  });

  it("takes a tap in its first moment for one meant for the table, and the keys at once", async () => {
    renderViewer({ start: at(0, 23) });
    await mouse(stage());
    // The fourth tap of a quick run: it brings up the waiting card in the round.
    await mouse(stage());
    expect(queryCard()).not.toBeNull();
    const tap = async (target: Element) => {
      const event = { button: 0, pointerId: 1, isPrimary: true, pointerType: "touch" };
      await act(async () => {
        fireEvent.pointerDown(target, event);
        fireEvent.pointerUp(target, event);
        fireEvent.click(target, { detail: 1 });
      });
    };
    const next = within(card()).getByRole("button", { name: "Next round" });
    await tap(next);
    await tap(card().parentElement as HTMLElement);
    expect(queryCard()).not.toBeNull();
    expect(roundName()).toBe("East 1");
    // A key press is no stray tap.
    await click(next);
    expect(roundName()).toBe("East 2");
    cleanup();

    renderViewer({ start: at(0, 24) });
    afterGuard();
    await tap(within(card()).getByRole("button", { name: "Next round" }));
    expect(roundName()).toBe("East 2");
  });

  it("swallows a quick run of taps on the card however long it lasts, and takes one after a pause", async () => {
    renderViewer({ start: at(0, 24) });
    const start = performance.now();
    const now = vi.spyOn(performance, "now");
    const tapAt = async (ms: number) => {
      now.mockReturnValue(start + ms);
      const target = within(card()).getByRole("button", { name: "Next round" });
      const event = { button: 0, pointerId: 1, isPrimary: true, pointerType: "touch" };
      await act(async () => {
        fireEvent.pointerDown(target, event);
        fireEvent.pointerUp(target, event);
        fireEvent.click(target, { detail: 1 });
      });
    };
    // A tap every 400 ms: each lands within CARD_GUARD_MS of the one before.
    for (const ms of [300, 700, 1100, 1500]) {
      await tapAt(ms);
    }
    expect(roundName()).toBe("East 1");
    await tapAt(1500 + CARD_GUARD_MS);
    expect(roundName()).toBe("East 2");
  });

  it("leaves the round from its Next round button, and the stage takes the focus", async () => {
    renderViewer({ start: at(0, 24) });
    const next = within(card()).getByRole("button", { name: "Next round" });
    act(() => next.focus());
    await click(next);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    expect(document.activeElement).toBe(stage());
  });

  it("shows the card again from Show result, which then goes away", async () => {
    renderViewer({ start: at(0, 24) });
    await press("Escape");
    const show = button("Show result");
    expect(transport().contains(show)).toBe(true);
    act(() => show.focus());
    await click(show);
    expect(queryCard()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Show result" })).toBeNull();
    expect(document.activeElement).toBe(stage());
  });

  it("shows the card again after leaving the round and coming back", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 24) });
    await press("Escape");
    await press("ArrowLeft");
    await press("ArrowRight");
    await act(async () => {
      vi.advanceTimersByTime(RESULT_DELAY_MS);
    });
    expect(queryCard()).not.toBeNull();
  });

  it("gives the card the final scores only at the end of the game", () => {
    renderViewer({ game: fixtureGame, start: at(0, 99) });
    expect(within(card()).getByText("Final standings")).toBeTruthy();
    cleanup();
    renderViewer({ start: at(0, 24) });
    expect(within(card()).queryByText("Final standings")).toBeNull();
  });
});

describe("Viewer autoplay", () => {
  it("plays on Space and pauses at the round's result", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 20) });
    await press(" ", { code: "Space" });
    expect(button("Pause")).toBeTruthy();
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
    }
    expect(counter()).toBe("25 / 25");
    expect(roundName()).toBe("East 1");
    expect(button("Play")).toBeTruthy();
  });

  it("plays from the Play button and stops on Esc", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 2) });
    await click(button("Play"));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(counter()).not.toBe("3 / 25");
    await press("Escape");
    expect(button("Play")).toBeTruthy();
  });

  it("stores a speed change from the keys and the speed button, and starts with it", async () => {
    const speed = () => button(/^Autoplay speed:/);
    const { unmount } = renderViewer();
    expect(speed().getAttribute("aria-label")).toBe("Autoplay speed: 1×");
    expect(stored().autoplaySpeed).toBeUndefined();

    await press("+");
    expect(speed().getAttribute("aria-label")).toBe("Autoplay speed: 2×");
    expect(stored().autoplaySpeed).toBe(2);
    await press("-");
    await press("-");
    expect(speed().getAttribute("aria-label")).toBe("Autoplay speed: 0.5×");
    expect(stored().autoplaySpeed).toBe(0.5);
    // The button cycles upward: 0.5× → 1× → 2×.
    await click(speed());
    await click(speed());
    expect(speed().getAttribute("aria-label")).toBe("Autoplay speed: 2×");
    expect(stored().autoplaySpeed).toBe(2);

    unmount();
    renderViewer();
    expect(speed().getAttribute("aria-label")).toBe("Autoplay speed: 2×");
  });
});

describe("Viewer table input", () => {
  it("steps forward on a click on the table and back on a right click", async () => {
    renderViewer({ start: at(0, 2) });
    await mouse(stage());
    expect(counter()).toBe("4 / 25");
    await mouse(stage(), 2);
    expect(counter()).toBe("3 / 25");
    // With Shift: to the viewed player's next own turn (step 7).
    await mouse(stage(), 0, { shiftKey: true });
    expect(counter()).toBe("8 / 25");
  });

  it("crosses into the next round on a fresh click at the result, behind the card", async () => {
    renderViewer({ start: at(0, 24) });
    await press("Escape");
    await mouse(stage());
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
  });

  it("steps on the wheel over the table and over the transport", async () => {
    renderViewer({ start: at(0, 2) });
    await wheel(stage(), 100);
    expect(counter()).toBe("4 / 25");
    // A new turn of the wheel after a pause (a burst is rate-limited).
    await new Promise((resolve) => setTimeout(resolve, 250));
    await wheel(transport(), -100);
    expect(counter()).toBe("3 / 25");
  });

  it("steps once for a wheel turn over the bar on the felt", async () => {
    arrange("wide");
    renderViewer({ start: at(0, 2) });
    await wheel(button("Next step"), 100);
    expect(counter()).toBe("4 / 25");
  });

  it("stops a wheel burst at the round's result", async () => {
    renderViewer({ start: at(0, 23) });
    await wheel(stage(), 100);
    expect(counter()).toBe("25 / 25");
    await new Promise((resolve) => setTimeout(resolve, 60));
    await wheel(stage(), 100);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
  });

  it("puts the result card away on a new turn of the wheel, and goes on with the next", async () => {
    renderViewer({ start: at(0, 24) });
    await wheel(stage(), 100);
    expect(queryCard()).toBeNull();
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await wheel(stage(), 100);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
  });

  it("goes back a step on the wheel with the result card up", async () => {
    renderViewer({ start: at(0, 24) });
    await wheel(stage(), -100);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("24 / 25");
  });

  it("leaves the wheel alone over the result card and inside a popover", async () => {
    renderViewer({ start: at(0, 24) });
    await wheel(card(), -100);
    expect(counter()).toBe("25 / 25");
    await click(button(/, round list$/));
    await wheel(screen.getByRole("group", { name: "Rounds" }), -100);
    expect(counter()).toBe("25 / 25");
  });

  it("jumps to the moment before a discard on Alt+click, without stepping", async () => {
    renderViewer({ game: fixtureGame, start: at(0, 8, 0) });
    expect(counter()).toBe("9 / 12");
    // A's first discard was made at step 3 (index 2): the decision is the step before it.
    const tile = stage().querySelector('img[data-d="0:0"]') as HTMLElement;
    await mouse(tile, 0, { altKey: true });
    expect(counter()).toBe("2 / 12");
  });
});

describe("Viewer transport", () => {
  it("steps and jumps from its buttons", async () => {
    renderViewer({ start: at(0, 2) });
    await click(button("Next step"));
    expect(counter()).toBe("4 / 25");
    await click(button("Previous step"));
    expect(counter()).toBe("3 / 25");
    await click(button("Next own turn"));
    expect(counter()).toBe("8 / 25");
    await click(button("Previous own turn"));
    expect(counter()).toBe("2 / 25");
    await click(within(transport()).getByRole("button", { name: "Next round" }));
    expect(roundName()).toBe("East 2");
    await click(button("Next step"));
    // Previous round: the start of this round first, then the round before.
    await click(button("Previous round"));
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    await click(button("Previous round"));
    expect(roundName()).toBe("East 1");
  });

  it("shows the turn, and keeps it on the result step", async () => {
    renderViewer({ start: at(0, 22) });
    const turn = () => within(transport()).getByText(/^Turn \d+$/).textContent;
    expect(turn()).toBe("Turn 3");
    await press("End");
    expect(turn()).toBe("Turn 3");
    await press("Home");
    expect(turn()).toBe("Turn 1");
  });

  it("stops a held step button at the round's result", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 21) });
    const next = button("Next step");
    const held = { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse" };
    fireEvent.pointerDown(next, held);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.pointerUp(next, held);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
  });

  it("keeps a button focusable when it reaches its limit", async () => {
    renderViewer({ start: at(2, 2) });
    const next = button("Next step");
    act(() => next.focus());
    await click(next);
    expect(counter()).toBe("4 / 4");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(next);
    await click(next);
    expect(counter()).toBe("4 / 4");
  });
});

describe("Viewer round list", () => {
  const list = () => screen.queryByRole("group", { name: "Rounds" });

  it("opens from the round button on the round on the table, and jumps to a round's start", async () => {
    renderViewer({ start: at(1, 5) });
    await click(button(/, round list$/));
    const rows = within(list() as HTMLElement).getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      "East 1A ron off B · 12,000A +13,000",
      "East 2A ron off B · 12,000A +13,000",
      "East 3B ron off AC ron off AA −16,000",
      "Final standings",
    ]);
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1]?.getAttribute("aria-current")).toBe("true");
    await click(rows[2] as HTMLElement);
    expect(list()).toBeNull();
    expect(roundName()).toBe("East 3");
    expect(counter()).toBe("1 / 4");
    expect(document.activeElement).toBe(button(/, round list$/));
  });

  it("shows each round's change for the viewed player", async () => {
    renderViewer({ start: at(0, 0, 1) });
    await click(button(/, round list$/));
    const rows = within(list() as HTMLElement).getAllByRole("button");
    expect(rows.map((row) => row.querySelector("[data-sign]")?.textContent)).toEqual([
      "B −12,000",
      "B −12,000",
      "B +8,000",
      undefined,
    ]);
  });

  it("jumps to the end of the game from Final standings", async () => {
    renderViewer();
    await click(button(/, round list$/));
    await click(within(list() as HTMLElement).getByRole("button", { name: "Final standings" }));
    expect(roundName()).toBe("East 3");
    expect(counter()).toBe("4 / 4");
    expect(queryCard()).not.toBeNull();
  });

  it("opens and closes on R", async () => {
    renderViewer({ start: at(1, 0) });
    await press("r");
    expect(list()).not.toBeNull();
    expect(button(/, round list$/).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-current")).toBe("true");
    await press("r", { target: document.activeElement as Element });
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(button(/, round list$/));
  });
});

describe("Viewer popovers", () => {
  const openers = [/^Point of view:/, /^Menu$/, /, round list$/];

  it.each(openers)("ignores every shortcut while %s is open", async (name) => {
    renderViewer({ start: at(0, 2) });
    await click(button(name));
    const inside = document.activeElement as HTMLElement;
    expect(inside.closest('[data-gesture="ignore"]')).not.toBeNull();
    for (const key of ["ArrowRight", "ArrowLeft", "h", "c", "w", "d", "v", "2", "?", "+"]) {
      await press(key, { target: inside, code: key === "2" ? "Digit2" : undefined });
    }
    expect(counter()).toBe("3 / 25");
    expect(button("Show all hands").getAttribute("aria-pressed")).toBe("true");
    expect(stage().getAttribute("data-view")).toBe("3d");
    expect(button(/^Point of view:/).getAttribute("aria-label")).toBe("Point of view: East, A");
    expect(button(/^Autoplay speed/).getAttribute("aria-label")).toBe("Autoplay speed: 1×");
    expect(screen.getByTestId("dialog").textContent).toBe("");
    expect(screen.queryByText(/^Waits and shanten/)).toBeNull();
  });

  it.each(openers)(
    "closes %s on Esc before the card, and the card on the next Esc",
    async (name) => {
      renderViewer({ start: at(0, 24) });
      await click(button(name));
      await press("Escape", { target: document.activeElement as Element });
      expect(button(name).getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(button(name));
      expect(queryCard()).not.toBeNull();
      await press("Escape", { target: document.activeElement as Element });
      expect(queryCard()).toBeNull();
    },
  );

  it.each(openers)("closes %s on a press on the table, which does not step", async (name) => {
    renderViewer({ start: at(0, 2) });
    await click(button(name));
    await mouse(stage());
    expect(button(name).getAttribute("aria-expanded")).toBe("false");
    expect(counter()).toBe("3 / 25");
    // The item that had the focus is gone: the stage has it now.
    expect(document.activeElement).toBe(stage());
    await mouse(stage());
    expect(counter()).toBe("4 / 25");
  });

  it("closes a popover on a press on the console, which does not press it", async () => {
    renderViewer({ start: at(0, 2) });
    await click(button(/, round list$/));
    const diff = button("Show score differences");
    const event = { button: 0, pointerId: 1, isPrimary: true, pointerType: "mouse" };
    await act(async () => {
      fireEvent.pointerDown(diff, event);
      fireEvent.pointerUp(diff, event);
      fireEvent.click(diff, { detail: 1 });
    });
    expect(screen.queryByRole("group", { name: "Rounds" })).toBeNull();
    expect(diff.getAttribute("aria-pressed")).toBe("false");
    expect(counter()).toBe("3 / 25");
  });

  it("has one popover open at a time", async () => {
    renderViewer();
    await click(button(/^Point of view:/));
    expect(screen.getByRole("menu", { name: "Point of view" })).toBeTruthy();
    await click(button("Menu"));
    expect(screen.queryByRole("menu", { name: "Point of view" })).toBeNull();
    expect(screen.getByRole("menu", { name: "Menu" })).toBeTruthy();
    await click(button(/, round list$/));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("group", { name: "Rounds" })).toBeTruthy();
  });

  it("views from the seat chosen in the point-of-view menu, which lists the scores", async () => {
    renderViewer({ game: sanma });
    await click(button(/^Point of view:/));
    const seats = within(screen.getByRole("menu", { name: "Point of view" })).getAllByRole(
      "menuitemradio",
    );
    expect(seats.map((seat) => seat.getAttribute("aria-label"))).toEqual([
      "East, A, 35,000",
      "South, B, 35,000 (±0)",
      "West, C, 35,000 (±0)",
    ]);
    await click(seats[2] as HTMLElement);
    expect(button(/^Point of view:/).getAttribute("aria-label")).toBe("Point of view: West, C");
    expect(document.activeElement).toBe(button(/^Point of view:/));
  });

  it("asks for the shell's dialogs from the Menu, with the focus back on the Menu button", async () => {
    renderViewer();
    for (const [item, dialog] of [
      ["Open another log", "open"],
      ["Settings", "settings"],
      ["Controls", "help"],
    ]) {
      await click(button("Menu"));
      await click(screen.getByRole("menuitem", { name: item }));
      expect(screen.getByTestId("dialog").textContent).toBe(dialog);
      expect(document.activeElement).toBe(button("Menu"));
    }
  });

  it("opens the controls help on ?", async () => {
    renderViewer();
    await press("?");
    expect(screen.getByTestId("dialog").textContent).toBe("help");
  });
});

describe("Viewer history and links", () => {
  it("pushes a jump to another round as a history entry", async () => {
    const push = vi.spyOn(window.history, "pushState");
    renderViewer({ start: at(0, 5) });
    await click(within(transport()).getByRole("button", { name: "Next round" }));
    expect(roundName()).toBe("East 2");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("restores a position from Back and Forward without a caption", async () => {
    renderViewer({ start: at(0, 7) });
    const captions = () =>
      screen.queryAllByText("Riichi").filter((el) => el.closest('[aria-hidden="true"]'));
    await press("ArrowRight");
    expect(captions()).toHaveLength(1);
    const entry = window.history.state as { sid?: string };
    await press("ArrowDown");
    expect(roundName()).toBe("East 2");
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { v: 1, round: 0, step: 7, pov: 0, sid: entry.sid, n: 0 },
        }),
      );
    });
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("9 / 25");
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

  it("keeps parameters out of the address for a local log, and offers no link to copy", async () => {
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
    await click(button("Menu"));
    expect(screen.queryByRole("menuitem", { name: "Copy link to this moment" })).toBeNull();
  });

  it("copies a link to the clipboard and says so in a toast and the live region", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderViewer({ origin: { kind: "sample", id: "tenhou-json" }, start: at(0, 4) });
    await click(button("Menu"));
    await click(screen.getByRole("menuitem", { name: "Copy link to this moment" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toMatch(
      /\?sample=tenhou-json&round=1&step=5&pov=1$/,
    );
    const toast = () => screen.queryByText("Link copied", { ignore: "[aria-live] *" });
    expect(toast()?.getAttribute("aria-hidden")).toBe("true");
    expect(liveText()).toBe("Link copied");
    expect(document.activeElement).toBe(button("Menu"));

    // A step gives the live region back to the table; the toast stays its time.
    await press("ArrowRight");
    expect(liveText()).not.toBe("Link copied");
    expect(toast()).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(toast()).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(toast()).toBeNull();
  });

  it("says so when the link cannot be copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    renderViewer({ origin: { kind: "sample", id: "tenhou-json" } });
    await click(button("Menu"));
    await click(screen.getByRole("menuitem", { name: "Copy link to this moment" }));
    expect(liveText()).toBe("The link could not be copied");
  });

  it("announces the same message again when the link is copied twice", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    });
    renderViewer({ origin: { kind: "sample", id: "tenhou-json" } });
    const copy = async () => {
      await click(button("Menu"));
      await click(screen.getByRole("menuitem", { name: "Copy link to this moment" }));
    };
    const said = () => document.querySelector("[aria-live]")?.firstElementChild;
    await copy();
    const first = said();
    expect(liveText()).toBe("Link copied");
    await copy();
    expect(liveText()).toBe("Link copied");
    // A new node: a screen reader reads a live region's text again only when it changes.
    expect(said()).not.toBe(first);
  });
});

describe("Viewer focus and announcements", () => {
  it("has exactly one live region, which announces each step", async () => {
    renderViewer({ start: at(0, 24) });
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    await press("ArrowRight");
    expect(liveText()).toContain("East 2: starting hands dealt");
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(document.querySelector("[aria-live]")?.className).toBe("sr-only");
  });

  it("reads out a notice from around it in its one live region, until the replay moves", async () => {
    renderViewer({ notice: "Downloading the log…" });
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(liveText()).toBe("Downloading the log…");
    await press("ArrowRight");
    expect(liveText()).toBe("A draws East");
  });

  it("is quiet while steps fly by and announces where they settle", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 2) });
    const region = () => document.querySelector("[aria-live]");
    expect(region()?.getAttribute("aria-live")).toBe("polite");
    await press("ArrowRight", { repeat: true });
    expect(region()?.getAttribute("aria-live")).toBe("off");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(region()?.getAttribute("aria-live")).toBe("polite");
  });

  it("attaches the shell's focus ref to the stage", () => {
    const { focusRef } = renderViewer();
    expect(focusRef.current).toBe(stage());
  });

  it("gives every button a name and a tooltip", () => {
    renderViewer({ start: at(0, 24) });
    fireEvent.keyDown(window, { key: "Escape" });
    for (const control of within(transport()).getAllByRole("button")) {
      expect(control.getAttribute("aria-label") ?? control.textContent).toBeTruthy();
    }
    for (const control of [
      ...within(screen.getByRole("group", { name: "Viewer tools" })).getAllByRole("button"),
      ...within(transport())
        .getAllByRole("button")
        .filter((control) => control.textContent !== "Show result"),
    ]) {
      expect(control.getAttribute("aria-label"), control.outerHTML).toBeTruthy();
      expect(control.title, control.outerHTML).toBeTruthy();
    }
  });
});
