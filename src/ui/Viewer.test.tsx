// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLog } from "../core/model";
import { I18nProvider } from "../i18n/I18nProvider";
import { readStorage, writeStorage } from "../storage";
import { shown, spoken } from "../test/dom-text";
import {
  draw,
  makeGame,
  makeRound,
  makeSanmaGame,
  ryukyoku,
  sampleRound,
  sampleSanmaRound,
  tsumogiri,
} from "../test/round-builder";
import { game as fixtureGame } from "./__fixtures__/game";
import { SettingsProvider } from "./settings/SettingsProvider";
import { SETTINGS_STORAGE_NAME } from "./settings/settings";
import { useDialogs } from "./settings/useSettings";
import { Viewer } from "./Viewer";
import { doubleRonRound } from "./viewer/__fixtures__/games";
import type { LinkSource, ViewerStart } from "./viewer/types";
import { TOAST_MS } from "./viewer/useToast";

/**
 * Three rounds told apart by their names: East 1 (sampleRound, 25 steps: 7 draw S0, 8 riichi S0,
 * 11 open kan S2, 24 ron), East 2 (the same round) and East 3 (a double ron in 4 steps).
 */
const threeRounds: GameLog = makeGame([
  sampleRound(),
  { ...sampleRound(), number: 2 },
  { ...doubleRonRound(), number: 3 },
]);

/** Two three-player rounds (24 steps each), with the final scores a complete log carries. */
const sanma: GameLog = makeSanmaGame([sampleSanmaRound(), { ...sampleSanmaRound(), number: 2 }], {
  finalScores: [35000, 28800, 41200, 0],
});

/**
 * East 1 ends in an exhaustive draw after one discard (4 steps) with A (waiting on every Man tile)
 * and D (waiting on Chun) tenpai; East 2 is sampleRound.
 */
const drawGame: GameLog = makeGame([
  makeRound({
    events: [
      draw(0, "5z"),
      tsumogiri(0, "5z"),
      ryukyoku("exhaustive", [1500, -1500, -1500, 1500], { tenpai: [0, 3] }),
    ],
  }),
  { ...sampleRound(), number: 2 },
]);

const SAMPLE: LinkSource = { kind: "sample", id: "tenhou-json" };

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
const liveText = () => document.querySelector("[aria-live]")?.textContent ?? "";
const stored = () =>
  JSON.parse(readStorage(SETTINGS_STORAGE_NAME) ?? "{}") as Record<string, unknown>;

// ---- the page's parts
const stage = () => screen.getByRole("region", { name: "Mahjong table" });
const transport = () => screen.getByRole("group", { name: "Replay controls" });
const panel = () => screen.getByRole("complementary", { name: "Game" });

// ---- the panel's parts, top to bottom
const header = () => panel().querySelector("header") as HTMLElement;
/** The round on the table, as the panel's head names it. */
const roundName = () => within(header()).getByRole("heading", { level: 2 }).textContent;
/** The line under the round's name: "Turn 3 · 61 tiles left · 1 deposit". */
const facts = () => header().querySelector("p")?.textContent ?? null;
const roundButton = (name: "Previous round" | "Next round") =>
  within(header()).getByRole("button", { name });
const result = () => screen.getByRole("region", { name: "Round result" });
const queryResult = () => screen.queryByRole("region", { name: "Round result" });
const players = () => screen.getByRole("region", { name: "Players" });
const playerRows = () => within(players()).getAllByRole("button");
const hands = () => screen.getByRole("checkbox", { name: "Show all hands" }) as HTMLInputElement;
/** The viewed player as the player list marks it: the pressed row's wind and name, "East A". */
const pov = () =>
  spoken(within(players()).getByRole("button", { pressed: true })).replace(/ Point of view.*$/, "");
const rounds = () => screen.getByRole("region", { name: "Rounds" });
/** The rows of the round list: one per round, then "Final standings". */
const roundRows = () => within(rounds()).getAllByRole("button");
const menu = () => screen.getByRole("group", { name: "Menu" });

/** Whose hand lies at the bottom of the table, as its group is named: "A's hand". */
const ownHand = () =>
  stage().querySelector("[data-own-hand] [role='group']")?.getAttribute("aria-label") ?? null;
const handOf = (name: string) => within(stage()).queryByRole("group", { name });

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

const TOUCH = { button: 0, pointerId: 1, isPrimary: true, pointerType: "touch" };

/** A finger put down on an element at `from` and lifted at `to` (x, on one line). */
async function swipe(target: Element, from: number, to: number) {
  await act(async () => {
    fireEvent.pointerDown(target, { ...TOUCH, clientX: from, clientY: 300 });
    fireEvent.pointerUp(target, { ...TOUCH, clientX: to, clientY: 300 });
  });
}

/** Turns the wheel over an element; false when a handler took it (the page does not scroll). */
async function wheel(target: Element, deltaY: number): Promise<boolean> {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
  // happy-dom's WheelEvent is not a MouseEvent: give it the modifier keys a browser's has.
  for (const key of ["shiftKey", "ctrlKey", "metaKey", "altKey"] as const) {
    Object.defineProperty(event, key, { value: false });
  }
  await act(async () => {
    target.dispatchEvent(event);
  });
  return !event.defaultPrevented;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  it("stops key auto-repeat at the round's result, and a fresh press goes on", async () => {
    renderViewer({ start: at(0, 21) });
    for (let i = 0; i < 6; i++) {
      await press("ArrowRight", { repeat: true });
    }
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
    // The result is in the panel as soon as its step is on the table.
    expect(queryResult()).not.toBeNull();
    // Nothing waits for a second press: the next one leaves the round.
    await press("ArrowRight");
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    expect(queryResult()).toBeNull();
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

  it("has no key for a table view or a round list any more: C and R are the browser's", async () => {
    renderViewer({ start: at(0, 2) });
    for (const [key, code] of [
      ["c", "KeyC"],
      ["r", "KeyR"],
    ] as const) {
      expect(await press(key, { code }), key).toBe(true);
    }
    expect(counter()).toBe("3 / 25");
    expect(liveText()).toBe("A discards 3 Man");
    expect(document.activeElement).toBe(document.body);
  });

  it("views from seats 1 to 3 in a three-player game and ignores 4", async () => {
    renderViewer({ game: sanma });
    expect(playerRows()).toHaveLength(3);
    expect(pov()).toBe("East A");
    await press("2", { code: "Digit2" });
    expect(pov()).toBe("South B");
    await press("3", { code: "Digit3" });
    expect(pov()).toBe("West C");
    expect(ownHand()).toBe("C's hand");
    await press("4", { code: "Digit4" });
    expect(pov()).toBe("West C");
    await press("v");
    expect(pov()).toBe("East A");
    await press("v", { shiftKey: true });
    expect(pov()).toBe("West C");
    expect(document.body.textContent).not.toContain("Player 4");
  });

  it("hides and shows the other players' hands with H", async () => {
    renderViewer();
    expect(hands().checked).toBe(true);
    expect(handOf("B's hand")).not.toBeNull();
    await press("h");
    expect(hands().checked).toBe(false);
    expect(handOf("B's hand")).toBeNull();
    expect(handOf("B's hand, 13 tiles face down")).not.toBeNull();
    // The viewed player's own hand stays face up.
    expect(ownHand()).toBe("A's hand");
    expect(stored().showAllHands).toBe(false);
    await press("h");
    expect(hands().checked).toBe(true);
    expect(handOf("B's hand")).not.toBeNull();
  });

  it("turns the waits aid off and on with W and says so in a toast", async () => {
    renderViewer();
    const toast = () => screen.queryByText(/^Waits and shanten/, { ignore: "[aria-live] *" });
    expect(toast()).toBeNull();
    expect(spoken(playerRows()[0] as HTMLElement)).toBe("East A Point of view 25,000 1-shanten");
    expect(await press("w")).toBe(false);
    expect(stored().showWaits).toBe(false);
    expect(toast()?.textContent).toBe("Waits and shanten off");
    expect(liveText()).toBe("Waits and shanten off");
    // The player list drops what every hand is waiting on.
    expect(playerRows().map(spoken)).toEqual([
      "East A Point of view 25,000",
      "South B 25,000",
      "West C 25,000",
      "North D 25,000",
    ]);
    await press("w");
    expect(stored().showWaits).toBe(true);
    expect(toast()?.textContent).toBe("Waits and shanten on");
    expect(spoken(playerRows()[0] as HTMLElement)).toBe("East A Point of view 25,000 1-shanten");
  });

  it("says in the live region what a key changed on the table, without a toast", async () => {
    renderViewer({ start: at(0, 2) });
    const said: string[] = [];
    for (const [key, code] of [
      ["h"],
      ["h"],
      ["d"],
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
      "Score differences on",
      "Score differences off",
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

  it("does nothing on character keys while single-key shortcuts are off", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 3, charKeys: false }));
    renderViewer();
    for (const key of ["h", "w", "d", "v", "?", " "]) {
      expect(await press(key), key).toBe(true);
    }
    expect(await press("2", { code: "Digit2" })).toBe(true);
    expect(hands().checked).toBe(true);
    expect(pov()).toBe("East A");
    expect(button("Play")).toBeTruthy();
    expect(screen.getByTestId("dialog").textContent).toBe("");
    await press("ArrowRight");
    expect(counter()).toBe("2 / 25");
  });

  it("leaves Esc to the browser while nothing plays: the result has nothing to hide", async () => {
    renderViewer({ start: at(0, 24) });
    expect(await press("Escape")).toBe(true);
    expect(queryResult()).not.toBeNull();
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
  });
});

describe("Viewer page", () => {
  /** True when `later` comes after `earlier` in the document. */
  const follows = (earlier: Element, later: Element) =>
    (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it("holds the stage, the transport, the panel and its one live region, in that order", () => {
    renderViewer();
    const main = screen.getByRole("main");
    const live = document.querySelector("[aria-live]") as HTMLElement;
    const parts = [stage(), transport(), panel(), live];
    for (const [index, part] of parts.entries()) {
      expect(main.contains(part)).toBe(true);
      const next = parts[index + 1];
      if (next) {
        expect(follows(part, next), `part ${index}`).toBe(true);
        // Side by side on the page: none of them lies in, or over, another.
        expect(part.contains(next)).toBe(false);
      }
    }
    expect(screen.getAllByRole("group", { name: "Replay controls" })).toHaveLength(1);
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
  });

  it("has a heading for the page and one for each section of the panel, top to bottom", async () => {
    renderViewer({ start: at(0, 23) });
    const sections = () =>
      within(panel())
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mahjong Paifu Viewer");
    expect(sections()).toEqual(["East 1", "Players", "Rounds"]);
    expect(follows(rounds(), menu())).toBe(true);
    expect(panel().contains(menu())).toBe(true);
    // At a round's result, the result comes between the round and the players.
    await press("ArrowRight");
    expect(sections()).toEqual(["East 1", "Round result", "Players", "Rounds"]);
    expect(within(panel()).getByRole("heading", { level: 3 }).textContent).toBe("A Ron off B");
  });

  it("keeps the focus order of the screen: the table, the transport, then the panel", () => {
    renderViewer({ start: at(0, 24), origin: SAMPLE });
    /** What Tab goes through, by name, with the stage (which takes the focus from code) marked. */
    const nameOf = (control: HTMLElement): string => {
      if (control.matches("[data-stage]")) {
        return "(stage)";
      }
      if (players().contains(control) && control.tagName === "BUTTON") {
        return pov() === spoken(control).replace(/ Point of view.*$/, "")
          ? "(viewed player)"
          : "(player)";
      }
      if (control.hasAttribute("data-round")) {
        return "(round)";
      }
      return (
        control.getAttribute("aria-label") ??
        control.closest("label")?.textContent ??
        spoken(control)
      );
    };
    const tabOrder = [...document.querySelectorAll<HTMLElement>("button, input, [tabindex]")]
      .filter((control) => control.matches("[data-stage]") || control.tabIndex >= 0)
      .map(nameOf);
    expect(tabOrder).toEqual([
      "(stage)",
      "Show score differences",
      "Previous own turn",
      "Previous step",
      "Play",
      "Next step",
      "Next own turn",
      "Step in this round",
      "Autoplay speed: 1×",
      "Previous round",
      "Next round",
      // The result's own way on to the next round.
      "Next round",
      "Show all hands",
      "(viewed player)",
      "(player)",
      "(player)",
      "(player)",
      "(round)",
      "(round)",
      "(round)",
      "Final standings",
      "Open another log",
      "Copy link to this moment",
      "Settings",
      "Controls",
    ]);
  });

  it("has no toolbar, no popover and nothing to press on the table but the console", () => {
    renderViewer({ start: at(0, 24) });
    expect(screen.queryByRole("group", { name: "Viewer tools" })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.querySelector("[aria-expanded], [aria-haspopup]")).toBeNull();
    for (const name of ["Show table", "Show result", /, round list$/, /^Point of view:/]) {
      expect(screen.queryByRole("button", { name }), String(name)).toBeNull();
    }
    // The round's result is words in the panel: nothing covers the table, at a result either.
    expect(within(stage()).getAllByRole("button")).toEqual([button("Show score differences")]);
    expect(stage().querySelector('[data-gesture="ignore"]')).toBeNull();
    expect(stage().contains(result())).toBe(false);
    // One table, seen from above: no view to switch, no arrangement told to the parts.
    expect(stage().hasAttribute("data-view")).toBe(false);
    expect(stage().hasAttribute("data-arrangement")).toBe(false);
    expect(transport().hasAttribute("data-arrangement")).toBe(false);
  });
});

describe("Viewer without a round to show", () => {
  it("says so in the table's place and keeps its controls, which go nowhere", async () => {
    const { focusRef } = renderViewer({ game: makeGame([]) });
    const failed = () => within(stage()).getByText(/^This round could not be replayed/);
    expect(focusRef.current).toBe(stage());
    expect(failed()).toBeTruthy();
    expect(liveText()).toMatch(/^This round could not be replayed/);
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Replay controls" })).toHaveLength(1);
    expect(counter()).toBe("1 / 1");
    for (const name of ["Previous step", "Play", "Next step"]) {
      expect(button(name).getAttribute("aria-disabled"), name).toBe("true");
    }
    // The panel has no round to name and nobody to list, and still the way to another log.
    expect(panel().querySelector("header")).toBeNull();
    expect(within(players()).queryAllByRole("button")).toHaveLength(0);
    expect(roundRows().map((row) => row.textContent)).toEqual(["Final standings"]);
    expect(within(menu()).getByRole("button", { name: "Open another log" })).toBeTruthy();
    await press("ArrowRight");
    await press("End");
    await press("ArrowDown");
    await click(button("Final standings"));
    await mouse(stage());
    expect(counter()).toBe("1 / 1");
    expect(failed()).toBeTruthy();
    expect(queryResult()).toBeNull();
  });
});

describe("Viewer round header", () => {
  it("names the round with its honba, and counts the turn, the tiles left and the deposits", async () => {
    renderViewer({
      game: makeGame([sampleRound(), { ...sampleRound(), honba: 2, riichiSticks: 1 }]),
    });
    expect(roundName()).toBe("East 1");
    expect(facts()).toBe("Turn 1 · 70 tiles left");
    await press("ArrowDown");
    expect(roundName()).toBe("East 1, 2 honba");
    expect(facts()).toBe("Turn 1 · 70 tiles left · 1 deposit");
    // A's riichi (step 8) adds a deposit; the winner takes them all.
    for (let i = 0; i < 8; i++) {
      await press("ArrowRight");
    }
    expect(facts()).toBe("Turn 1 · 68 tiles left · 2 deposits");
    await press("End");
    expect(roundName()).toBe("East 1, 2 honba");
    expect(facts()).toBe("Turn 3 · 61 tiles left");
  });

  it("shows the turn, and keeps it on the result step", async () => {
    renderViewer({ start: at(0, 22) });
    const turn = () => facts()?.split(" · ")[0];
    expect(turn()).toBe("Turn 3");
    await press("End");
    expect(turn()).toBe("Turn 3");
    await press("Home");
    expect(turn()).toBe("Turn 1");
  });

  it("goes to the round before and after from its buttons, which keep the focus at a limit", async () => {
    renderViewer({ start: at(1, 2) });
    expect(roundButton("Previous round").title).toBe("Previous round (↑)");
    expect(roundButton("Next round").title).toBe("Next round (↓)");
    // Previous round: the start of this round first, then the round before.
    await click(roundButton("Previous round"));
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    await click(roundButton("Previous round"));
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("1 / 25");
    const previous = roundButton("Previous round");
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    expect(previous.hasAttribute("disabled")).toBe(false);
    act(() => previous.focus());
    await click(previous);
    expect(roundName()).toBe("East 1");
    expect(document.activeElement).toBe(roundButton("Previous round"));

    await press("ArrowRight");
    await click(roundButton("Next round"));
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    const next = roundButton("Next round");
    act(() => next.focus());
    await click(next);
    expect(roundName()).toBe("East 3");
    expect(roundButton("Next round").getAttribute("aria-disabled")).toBe("true");
    expect(roundButton("Previous round").getAttribute("aria-disabled")).toBe("false");
    await click(roundButton("Next round"));
    expect(roundName()).toBe("East 3");
    expect(counter()).toBe("1 / 4");
    expect(document.activeElement).toBe(roundButton("Next round"));
  });
});

describe("Viewer hidden information", () => {
  it("keeps opponents' draws out of the live region and the slider's value text", () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 3, showAllHands: false }));
    // Step 4 of the fixture round: B draws 2 Pin.
    renderViewer({ game: fixtureGame, start: at(0, 3, 0) });
    expect(liveText()).toMatch(/B draws$/);
    expect(slider().getAttribute("aria-valuetext")).toMatch(/B draws$/);
    expect(slider().getAttribute("aria-valuetext")).not.toMatch(/Pin/);
  });

  it("names the draw once the hands are shown, and says only that they are", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 3, showAllHands: false }));
    renderViewer({ game: fixtureGame, start: at(0, 3, 0) });
    await press("h");
    // The step is not read out again as if it were a new one.
    expect(liveText()).toBe("All hands shown");
    expect(slider().getAttribute("aria-valuetext")).toMatch(/B draws 2 Pin$/);
  });

  it("keeps the other players' waits out of the player list while their hands are hidden", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 3, showAllHands: false }));
    renderViewer({ start: at(0, 8) });
    expect(hands().checked).toBe(false);
    expect(playerRows().map(spoken)).toEqual([
      "East A Point of view 24,000 Waits 9 Man and Hatsu, 4 left",
      "South B 25,000",
      "West C 25,000",
      "North D 25,000",
    ]);
    await click(hands());
    expect(playerRows().map(spoken)).toEqual([
      "East A Point of view 24,000 Waits 9 Man and Hatsu, 4 left",
      "South B 25,000 Waits 8 Pin and 1 Sou, 4 left",
      "West C 25,000",
      "North D 25,000 Waits 2 Man and 5 Man, 6 left, furiten",
    ]);
  });

  it("reads a version 2 blob, whose table view is gone, for the settings it still has", () => {
    writeStorage(
      SETTINGS_STORAGE_NAME,
      JSON.stringify({ version: 2, view: "3d", showAllHands: false, autoplaySpeed: 2 }),
    );
    renderViewer();
    expect(hands().checked).toBe(false);
    expect(button(/^Autoplay speed:/).getAttribute("aria-label")).toBe("Autoplay speed: 2×");
    expect(stored()).toEqual({
      version: 3,
      showAllHands: false,
      showWaits: true,
      charKeys: true,
      autoplaySpeed: 2,
    });
  });
});

describe("Viewer round result", () => {
  it("is in the panel as soon as a step reaches the round's end, and gone a step back", async () => {
    // No clock runs: the result does not wait for a moment to pass.
    vi.useFakeTimers();
    renderViewer({ start: at(0, 23) });
    expect(queryResult()).toBeNull();
    await press("ArrowRight");
    expect(liveText()).toBe("Result · A wins by ron off B · 4 han · 40 fu · 12,000 points");
    expect(panel().contains(result())).toBe(true);
    expect(stage().contains(result())).toBe(false);
    // The result never takes the focus when it appears.
    expect(result().contains(document.activeElement)).toBe(false);
    // The table under it shows the win: the winner's caption, upright over the felt.
    expect(within(stage()).getByText("Ron").closest('[aria-hidden="true"]')).not.toBeNull();
    await press("ArrowLeft");
    expect(queryResult()).toBeNull();
    expect(counter()).toBe("24 / 25");
  });

  it("is there after a jump or a scrub to the round's end, and when the game opens there", async () => {
    renderViewer({ start: at(0, 3) });
    await press("End");
    expect(queryResult()).not.toBeNull();
    await press("Home");
    expect(queryResult()).toBeNull();
    await act(async () => {
      fireEvent.change(slider(), { target: { value: "25" } });
    });
    expect(queryResult()).not.toBeNull();
    cleanup();
    renderViewer({ start: at(1, 24) });
    expect(queryResult()).not.toBeNull();
    // A step back from the next round's start is the way back to it.
    await press("ArrowRight");
    expect(roundName()).toBe("East 3");
    expect(queryResult()).toBeNull();
    await press("ArrowLeft");
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("25 / 25");
    expect(within(result()).getByRole("article", { name: "A Ron off B" })).toBeTruthy();
  });

  it("says who won, off whom and for how much, with the hand, the dora and the yaku", () => {
    renderViewer({ game: fixtureGame, start: at(0, 99) });
    const win = within(result()).getByRole("article", { name: "B Ron off A" });
    expect(spoken(win)).toBe("B Ron off A 3,900 points 2 han · 40 fu Riichi 1 han Aka Dora 1 han");
    const tiles = (name: string) =>
      within(within(win).getByRole("group", { name }))
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt"));
    expect(tiles("Winning hand")).toEqual([
      "2 Pin",
      "2 Pin",
      "3 Pin",
      "4 Pin",
      "5 Pin (red)",
      "6 Pin",
      "7 Pin",
      "8 Pin",
      "9 Pin",
      "1 Sou",
      "1 Sou",
      "2 Sou",
      "3 Sou",
      "Winning tile: 1 Pin",
    ]);
    expect(tiles("Dora indicators")).toEqual(["3 Man"]);
    expect(tiles("Ura Dora indicators")).toEqual(["5 Sou"]);
    expect(
      within(within(win).getByRole("list", { name: "Yaku" }))
        .getAllByRole("listitem")
        .map(spoken),
    ).toEqual(["Riichi 1 han", "Aka Dora 1 han"]);
  });

  it("shows the winner's calls with the hand, and the dora indicators turned over by then", () => {
    renderViewer({ start: at(0, 24) });
    const win = within(result()).getByRole("article", { name: "A Ron off B" });
    const hand = within(win).getByRole("group", { name: "Winning hand" });
    expect(
      within(hand).getByRole("group", { name: "Closed kan: 2 Sou, 2 Sou, 2 Sou, 2 Sou" }),
    ).toBeTruthy();
    expect(
      within(within(win).getByRole("group", { name: "Dora indicators" }))
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["South", "3 Pin", "8 Sou", "1 Man"]);
  });

  it("stacks the wins of a multiple ron", () => {
    renderViewer({ start: at(2, 99) });
    expect(
      within(result())
        .getAllByRole("article")
        .map((win) => spoken(win)),
    ).toEqual(["B Ron off A", "C Ron off A"]);
    expect(liveText()).toBe("Result · B wins by ron off A / C wins by ron off A");
  });

  it("names a draw, and the player list says who was tenpai and on what", () => {
    renderViewer({ game: drawGame, start: at(0, 99) });
    expect(liveText()).toBe("Result · Exhaustive draw · tenpai: A and D");
    expect(spoken(result())).toBe("Round result Next round Exhaustive draw");
    expect(within(result()).queryByRole("article")).toBeNull();
    expect(playerRows().map(spoken)).toEqual([
      "East A Point of view +1,500 26,500 Tenpai Waits: 1 Man, 2 Man, 3 Man, 4 Man, 5 Man, 6 Man, 7 Man, 8 Man and 9 Man",
      "South B −1,500 23,500 Noten",
      "West C −1,500 23,500 Noten",
      "North D +1,500 26,500 Tenpai Waits: Chun",
    ]);
    // For the eye the waits are tiles after the word.
    expect(playerRows().map(shown)).toEqual([
      "E A Point of view +1,500 26,500 Tenpai",
      "S B −1,500 23,500 Noten",
      "W C −1,500 23,500 Noten",
      "N D +1,500 26,500 Tenpai",
    ]);
    expect(playerRows().map((row) => row.querySelectorAll("img").length)).toEqual([9, 0, 0, 1]);
  });

  it("says tenpai or noten only at the draw: a step back the rows show the hands' waits again", async () => {
    renderViewer({ game: drawGame, start: at(0, 99) });
    await press("ArrowLeft");
    expect(queryResult()).toBeNull();
    const rows = playerRows().map(spoken);
    expect(rows[1]).toBe(
      "South B 25,000 Waits 1 Pin, 2 Pin, 3 Pin, 4 Pin, 5 Pin, 6 Pin, 7 Pin, 8 Pin and 9 Pin, 23 left",
    );
    expect(rows.join(" ")).not.toMatch(/Tenpai|Noten/);
  });

  it("shows each player's point change in the player list at a result, and only there", async () => {
    renderViewer({ start: at(0, 23) });
    const changes = () =>
      playerRows().map((row) => {
        const change = row.querySelector("[data-sign]");
        return change ? `${change.getAttribute("data-sign")} ${change.textContent}` : null;
      });
    expect(changes()).toEqual([null, null, null, null]);
    expect(playerRows().map(shown)).toEqual([
      "E A Point of view 24,000 Wait 3 left",
      "S B 25,000 Wait 3 left",
      "W C 25,000 Wait 4 left",
      "N D 25,000 Wait 5 left Furiten",
    ]);
    await press("ArrowRight");
    // A player the round did not touch has no change to show.
    expect(changes()).toEqual(["gain +13,000", "loss −12,000", null, null]);
    expect(playerRows().map(shown)).toEqual([
      "E A Point of view +13,000 37,000 Wait 3 left",
      "S B −12,000 13,000 Wait 3 left",
      "W C 25,000 Wait 4 left",
      "N D 25,000 Wait 5 left Furiten",
    ]);
    await press("ArrowRight");
    expect(roundName()).toBe("East 2");
    expect(changes()).toEqual([null, null, null, null]);
  });

  it("adds up the changes of a multiple ron", () => {
    renderViewer({ start: at(2, 99) });
    expect(
      playerRows().map((row) => row.querySelector("[data-sign]")?.textContent ?? null),
    ).toEqual(["−16,000", "+8,000", "+8,000", null]);
  });

  it("goes on from its Next round button, and the stage takes the focus", async () => {
    renderViewer({ start: at(0, 24) });
    const next = within(result()).getByRole("button", { name: "Next round" });
    expect(next.title).toBe("Next round (↓)");
    expect(next.getAttribute("data-variant")).toBe("primary");
    act(() => next.focus());
    await click(next);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    expect(queryResult()).toBeNull();
    expect(document.activeElement).toBe(stage());
  });

  it("hands the focus to the stage when a key leaves the result while its button has it", async () => {
    renderViewer({ start: at(0, 24) });
    const next = within(result()).getByRole("button", { name: "Next round" });
    act(() => next.focus());
    await press("ArrowLeft", { target: next });
    expect(counter()).toBe("24 / 25");
    expect(document.activeElement).toBe(stage());
  });

  it("leaves the focus where it is when the result goes away under another control", async () => {
    renderViewer({ start: at(0, 24) });
    const row = roundRows()[0] as HTMLElement;
    act(() => row.focus());
    await press("ArrowRight", { target: row });
    expect(roundName()).toBe("East 2");
    expect(document.activeElement).toBe(roundRows()[0]);
    // Nothing had the focus: nothing takes it.
    cleanup();
    renderViewer({ start: at(0, 24) });
    await press("ArrowRight");
    expect(roundName()).toBe("East 2");
    expect(document.activeElement).toBe(document.body);
  });

  it("shows the final standings in place of Next round after the game's last round", () => {
    renderViewer({ start: at(2, 99) });
    expect(within(result()).queryByRole("button", { name: "Next round" })).toBeNull();
    const table = within(result()).getByRole("table", { name: "Final standings" });
    expect(
      within(table)
        .getAllByRole("row")
        .map((row) => spoken(row)),
    ).toEqual([
      "Rank Player Points",
      "1st B 33,000",
      "2nd C 33,000",
      "3rd D 25,000",
      "4th A 9,000",
    ]);
    cleanup();
    renderViewer({ start: at(0, 24) });
    expect(within(result()).queryByRole("table")).toBeNull();
    expect(within(result()).queryByText("Final standings")).toBeNull();
    expect(within(result()).getByRole("button", { name: "Next round" })).toBeTruthy();
  });

  it("ranks three players after a three-player game", () => {
    renderViewer({ game: sanma, start: at(1, 99) });
    const table = within(result()).getByRole("table", { name: "Final standings" });
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => spoken(row)),
    ).toEqual(["1st C 41,200", "2nd A 35,000", "3rd B 28,800"]);
  });

  it("ranks the players by the scores the player list ends the game with", () => {
    renderViewer({ start: at(2, 99) });
    const ranked = within(within(result()).getByRole("table", { name: "Final standings" }))
      .getAllByRole("row")
      .slice(1)
      .map((row) => spoken(row).replace(/^\S+ /, ""));
    // "A 9,000", from a row that reads "East A Point of view −16,000 9,000 …".
    const listed = playerRows().map((row) => {
      const [, name, score] = /^\S+ (\S+)(?: Point of view)?(?: [+−][\d,]+)? ([\d,]+)/.exec(
        spoken(row),
      ) ?? ["", "", ""];
      return `${name} ${score}`;
    });
    expect(listed).toEqual(["A 9,000", "B 33,000", "C 33,000", "D 25,000"]);
    expect([...ranked].sort()).toEqual([...listed].sort());
  });
});

describe("Viewer autoplay", () => {
  it("plays on Space and pauses at the round's result, which the panel shows", async () => {
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
    expect(queryResult()).not.toBeNull();
  });

  it("plays from the Play button and stops on Esc, which is the viewer's only then", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 2) });
    await click(button("Play"));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(counter()).not.toBe("3 / 25");
    expect(await press("Escape")).toBe(false);
    expect(button("Play")).toBeTruthy();
    const stoppedAt = counter();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(counter()).toBe(stoppedAt);
    expect(await press("Escape")).toBe(true);
  });

  it("goes on to the next round when started at a round's result", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 24) });
    await click(button("Play"));
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
    expect(button("Pause")).toBeTruthy();
    expect(queryResult()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(counter()).toBe("2 / 25");
  });

  it("has nothing to play at the game's end", async () => {
    renderViewer({ start: at(2, 99) });
    const play = button("Play");
    expect(play.getAttribute("aria-disabled")).toBe("true");
    await click(play);
    await press(" ", { code: "Space" });
    expect(button("Play")).toBeTruthy();
    expect(counter()).toBe("4 / 4");
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
    expect(speed().textContent).toBe("2×");
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

  it("goes on to the next round on a click at the result, and back a step on a right click", async () => {
    renderViewer({ start: at(0, 24) });
    await mouse(stage(), 2);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("24 / 25");
    await mouse(stage());
    expect(counter()).toBe("25 / 25");
    expect(queryResult()).not.toBeNull();
    // One press: there is no card to put away first.
    await mouse(stage());
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
  });

  it("steps on a swipe across the table: left for the next step, right for the one before", async () => {
    renderViewer({ start: at(0, 2) });
    await swipe(stage(), 400, 200);
    expect(counter()).toBe("4 / 25");
    await swipe(stage(), 200, 400);
    expect(counter()).toBe("3 / 25");
  });

  it("presses the console on a tap without stepping, and steps on a swipe that starts on it", async () => {
    renderViewer({ start: at(0, 2) });
    const diff = button("Show score differences");
    await act(async () => {
      fireEvent.pointerDown(diff, TOUCH);
      fireEvent.pointerUp(diff, TOUCH);
      fireEvent.click(diff, { detail: 1 });
    });
    expect(diff.getAttribute("aria-pressed")).toBe("true");
    expect(counter()).toBe("3 / 25");
    await swipe(diff, 400, 200);
    expect(counter()).toBe("4 / 25");
    expect(diff.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not step on a press on the transport or the panel", async () => {
    renderViewer({ start: at(0, 2) });
    for (const part of [transport(), panel(), players(), rounds(), header()]) {
      await mouse(part);
      await mouse(part, 2);
      await swipe(part, 400, 200);
    }
    expect(counter()).toBe("3 / 25");
    // The right button is a step back on the table only: elsewhere it opens the browser's menu.
    expect(fireEvent.contextMenu(stage())).toBe(false);
    expect(fireEvent.contextMenu(transport())).toBe(true);
    expect(fireEvent.contextMenu(roundRows()[0] as HTMLElement)).toBe(true);
  });

  it("steps on the wheel over the table, and keeps the page from scrolling", async () => {
    renderViewer({ start: at(0, 2) });
    expect(await wheel(stage(), 100)).toBe(false);
    expect(counter()).toBe("4 / 25");
    // A new turn of the wheel after a pause (a burst is rate-limited).
    await pause(250);
    expect(await wheel(button("Show score differences"), -100)).toBe(false);
    expect(counter()).toBe("3 / 25");
  });

  it("leaves the wheel to the page over the transport and the panel", async () => {
    renderViewer({ start: at(0, 24) });
    for (const part of [transport(), button("Next step"), panel(), result(), rounds()]) {
      expect(await wheel(part, -100)).toBe(true);
    }
    expect(counter()).toBe("25 / 25");
  });

  it("stops a wheel burst at the round's result", async () => {
    renderViewer({ start: at(0, 23) });
    await wheel(stage(), 100);
    expect(counter()).toBe("25 / 25");
    await pause(60);
    await wheel(stage(), 100);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("25 / 25");
  });

  it("goes on to the next round on a new turn of the wheel at the result", async () => {
    renderViewer({ start: at(0, 24) });
    await wheel(stage(), 100);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
  });

  it("goes back a step on the wheel at the result", async () => {
    renderViewer({ start: at(0, 24) });
    await wheel(stage(), -100);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("24 / 25");
    expect(queryResult()).toBeNull();
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
  it("steps and skips to own turns from its buttons", async () => {
    renderViewer({ start: at(0, 2) });
    await click(button("Next step"));
    expect(counter()).toBe("4 / 25");
    await click(button("Previous step"));
    expect(counter()).toBe("3 / 25");
    await click(button("Next own turn"));
    expect(counter()).toBe("8 / 25");
    await click(button("Previous own turn"));
    expect(counter()).toBe("2 / 25");
  });

  it("holds the step and turn buttons, the slider and the speed, and no round buttons", () => {
    renderViewer({ start: at(0, 24) });
    expect(
      [...transport().querySelectorAll("button, input")].map((control) =>
        control.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Previous own turn",
      "Previous step",
      "Play",
      "Next step",
      "Next own turn",
      "Step in this round",
      "Autoplay speed: 1×",
    ]);
  });

  it("shows the step's number beside the slider, for the eye only", async () => {
    renderViewer({ start: at(0, 2) });
    const number = within(transport()).getByText("3 / 25");
    expect(number.getAttribute("aria-hidden")).toBe("true");
    expect(slider().getAttribute("aria-valuetext")).toBe("Step 3 of 25, turn 1: A discards 3 Man");
    await click(button("Next step"));
    expect(number.textContent).toBe("4 / 25");
    await press("ArrowDown");
    await press("End");
    expect(number.textContent).toBe("25 / 25");
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
    expect(queryResult()).not.toBeNull();
  });

  it("stops a held own-turn button at the round's start", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(1, 9) });
    const previous = button("Previous own turn");
    const held = { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse" };
    fireEvent.pointerDown(previous, held);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.pointerUp(previous, held);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 25");
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

describe("Viewer players", () => {
  it("lists the players in seat order with wind, name, score and what the hand waits on", () => {
    renderViewer({ start: at(0, 8) });
    expect(playerRows().map(shown)).toEqual([
      "E A Point of view 24,000 Wait 4 left",
      "S B 25,000 Wait 4 left",
      "W C 25,000",
      "N D 25,000 Wait 6 left Furiten",
    ]);
    expect(playerRows().map(spoken)).toEqual([
      "East A Point of view 24,000 Waits 9 Man and Hatsu, 4 left",
      "South B 25,000 Waits 8 Pin and 1 Sou, 4 left",
      "West C 25,000",
      "North D 25,000 Waits 2 Man and 5 Man, 6 left, furiten",
    ]);
    expect(playerRows().map((row) => row.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(playerRows().map((row) => row.title)).toEqual([
      "Point of view (1)",
      "Point of view (2)",
      "Point of view (3)",
      "Point of view (4)",
    ]);
  });

  it("views the table from the player whose row is pressed", async () => {
    renderViewer({ start: at(0, 2) });
    expect(pov()).toBe("East A");
    expect(ownHand()).toBe("A's hand");
    const row = playerRows()[2] as HTMLElement;
    act(() => row.focus());
    await click(row);
    expect(pov()).toBe("West C");
    expect(ownHand()).toBe("C's hand");
    expect(playerRows().map((player) => player.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(within(players()).getAllByText("Point of view")).toHaveLength(1);
    // The row stays, with the focus, and the replay where it was.
    expect(document.activeElement).toBe(playerRows()[2]);
    expect(counter()).toBe("3 / 25");
    // Own turns are now this player's: C's open kan is step 11.
    await press("ArrowRight", { shiftKey: true });
    expect(counter()).toBe("12 / 25");
    // The row of the viewed player changes nothing.
    await click(playerRows()[2] as HTMLElement);
    expect(pov()).toBe("West C");
    expect(counter()).toBe("12 / 25");
  });

  it("keeps the rows in seat order whoever is viewed, and the round list follows the view", async () => {
    renderViewer({ start: at(0, 2) });
    await click(playerRows()[1] as HTMLElement);
    expect(playerRows().map((row) => spoken(row).split(" ").slice(0, 2).join(" "))).toEqual([
      "East A",
      "South B",
      "West C",
      "North D",
    ]);
    expect(shown(rounds())).toMatch(/^Rounds Change for B /);
    expect(roundRows().map((round) => round.querySelector("[data-sign]")?.textContent)).toEqual([
      "B −12,000",
      "B −12,000",
      "B +8,000",
      undefined,
    ]);
  });

  it("does not stop autoplay when the view changes", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 2) });
    await click(button("Play"));
    await click(playerRows()[3] as HTMLElement);
    expect(pov()).toBe("North D");
    expect(button("Pause")).toBeTruthy();
  });

  it("lists three players in a three-player game", () => {
    renderViewer({ game: sanma });
    expect(playerRows().map(shown)).toEqual([
      "E A Point of view 35,000 Wait 4 left",
      "S B 35,000",
      "W C 35,000 Wait 3 left",
    ]);
    expect(playerRows().map((row) => row.title)).toEqual([
      "Point of view (1)",
      "Point of view (2)",
      "Point of view (3)",
    ]);
  });

  it("hides and shows the other hands from its checkbox, and remembers it", async () => {
    const { unmount } = renderViewer();
    expect(hands().checked).toBe(true);
    expect(players().contains(hands())).toBe(true);
    expect(hands().closest("label")?.title).toBe("Show all hands (H)");
    await click(hands());
    expect(hands().checked).toBe(false);
    expect(handOf("B's hand")).toBeNull();
    expect(handOf("B's hand, 13 tiles face down")).not.toBeNull();
    expect(stored().showAllHands).toBe(false);
    unmount();
    renderViewer();
    expect(hands().checked).toBe(false);
    await click(hands());
    expect(hands().checked).toBe(true);
    expect(handOf("B's hand")).not.toBeNull();
    expect(stored().showAllHands).toBe(true);
  });
});

describe("Viewer round list", () => {
  it("lists every round with how it ended and the viewed player's change, the one on the table marked", () => {
    renderViewer({ start: at(1, 5) });
    expect(roundRows().map(spoken)).toEqual([
      "East 1 A ron off B A +13,000",
      "East 2 A ron off B A +13,000",
      "East 3 B ron off A C ron off A A −16,000",
      "Final standings",
    ]);
    expect(roundRows().map(shown)).toEqual([
      "East 1 A ron off B +13,000",
      "East 2 A ron off B +13,000",
      "East 3 B ron off A C ron off A −16,000",
      "Final standings",
    ]);
    expect(shown(rounds())).toMatch(/^Rounds Change for A /);
    expect(roundRows().map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      "true",
      null,
      null,
    ]);
  });

  it("names a draw and leaves out a change of nothing", () => {
    renderViewer({ game: drawGame, start: at(0, 0, 2) });
    expect(roundRows().map(spoken)).toEqual([
      "East 1 Draw C −1,500",
      "East 2 A ron off B",
      "Final standings",
    ]);
  });

  it("jumps to the start of the round whose row is pressed, and the row keeps the focus", async () => {
    const push = vi.spyOn(window.history, "pushState");
    renderViewer({ start: at(1, 5) });
    const row = roundRows()[2] as HTMLElement;
    act(() => row.focus());
    await click(row);
    expect(roundName()).toBe("East 3");
    expect(counter()).toBe("1 / 4");
    expect(roundRows().map((round) => round.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "true",
      null,
    ]);
    // The list is always there: nothing closes, nothing takes the focus away.
    expect(document.activeElement).toBe(roundRows()[2]);
    // A jump is a history entry.
    expect(push).toHaveBeenCalledTimes(1);
    // The row of the round on the table goes back to its start.
    await press("ArrowRight");
    await press("ArrowRight");
    await click(roundRows()[2] as HTMLElement);
    expect(counter()).toBe("1 / 4");
    await click(roundRows()[0] as HTMLElement);
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("1 / 25");
  });

  it("stops autoplay when a row is pressed", async () => {
    vi.useFakeTimers();
    renderViewer({ start: at(0, 2) });
    await click(button("Play"));
    await click(roundRows()[1] as HTMLElement);
    expect(roundName()).toBe("East 2");
    expect(button("Play")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(counter()).toBe("1 / 25");
  });

  it("jumps to the end of the game from Final standings, where the standings are", async () => {
    renderViewer();
    await click(button("Final standings"));
    expect(roundName()).toBe("East 3");
    expect(counter()).toBe("4 / 4");
    expect(within(result()).getByRole("table", { name: "Final standings" })).toBeTruthy();
    expect(roundRows().map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "true",
      null,
    ]);
  });

  it("keeps the shortcuts working while the focus is in the panel", async () => {
    renderViewer({ start: at(0, 2) });
    const row = roundRows()[0] as HTMLElement;
    act(() => row.focus());
    expect(await press("ArrowRight", { target: row })).toBe(false);
    expect(counter()).toBe("4 / 25");
    await press("h", { target: row });
    expect(hands().checked).toBe(false);
    await press("2", { code: "Digit2", target: row });
    expect(pov()).toBe("South B");
    // Space presses the focused row; it does not start autoplay under it.
    expect(await press(" ", { code: "Space", target: row })).toBe(true);
    expect(button("Play")).toBeTruthy();
    // The check box takes Space too, and leaves the arrows to the viewer.
    act(() => hands().focus());
    expect(await press(" ", { code: "Space", target: hands() })).toBe(true);
    expect(await press("ArrowLeft", { target: hands() })).toBe(false);
    expect(counter()).toBe("3 / 25");
  });
});

describe("Viewer panel actions", () => {
  const actions = () =>
    within(menu())
      .getAllByRole("button")
      .map((action) => action.textContent);

  it("offers a link to copy only for a log that has an address", () => {
    renderViewer();
    expect(actions()).toEqual(["Open another log", "Settings", "Controls"]);
    cleanup();
    renderViewer({ origin: SAMPLE });
    expect(actions()).toEqual([
      "Open another log",
      "Copy link to this moment",
      "Settings",
      "Controls",
    ]);
  });

  it("asks for the shell's dialogs, with the focus still on the button pressed", async () => {
    renderViewer();
    for (const [item, dialog] of [
      ["Open another log", "open"],
      ["Settings", "settings"],
      ["Controls", "help"],
    ] as const) {
      const action = within(menu()).getByRole("button", { name: item });
      act(() => action.focus());
      await click(action);
      expect(screen.getByTestId("dialog").textContent).toBe(dialog);
      expect(document.activeElement).toBe(action);
    }
    expect(counter()).toBe("1 / 25");
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
    await click(roundButton("Next round"));
    expect(roundName()).toBe("East 2");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("pushes the result's Next round as a history entry, but not a step past the result", async () => {
    const push = vi.spyOn(window.history, "pushState");
    renderViewer({ start: at(0, 24) });
    await press("ArrowRight");
    expect(roundName()).toBe("East 2");
    expect(push).not.toHaveBeenCalled();
    await press("End");
    push.mockClear();
    // Jumps within a second of each other are one entry: let that second pass after End.
    vi.spyOn(performance, "now").mockReturnValue(performance.now() + 2000);
    await click(within(result()).getByRole("button", { name: "Next round" }));
    expect(roundName()).toBe("East 3");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("pushes a change of the point of view from the player list, with the seat in the address", async () => {
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    const push = vi.spyOn(window.history, "pushState");
    renderViewer({ origin: SAMPLE, start: at(0, 4) });
    await click(playerRows()[1] as HTMLElement);
    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0]?.[2]);
    expect(url).toContain("sample=tenhou-json");
    expect(url).toContain("step=5");
    expect(url).toContain("pov=2");
  });

  it("restores a position from Back and Forward without a caption", async () => {
    renderViewer({ start: at(0, 7) });
    const captions = () =>
      within(stage())
        .queryAllByText("Riichi")
        .filter((el) => el.closest('[aria-hidden="true"]'));
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
    expect(roundRows()[0]?.getAttribute("aria-current")).toBe("true");
  });

  it("restores the point of view of the entry Back returns to", async () => {
    renderViewer({ start: at(0, 7) });
    const entry = window.history.state as { sid?: string };
    await click(playerRows()[2] as HTMLElement);
    expect(pov()).toBe("West C");
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { v: 1, round: 0, step: 7, pov: 0, sid: entry.sid, n: 0 },
        }),
      );
    });
    expect(pov()).toBe("East A");
    expect(ownHand()).toBe("A's hand");
    expect(counter()).toBe("8 / 25");
  });

  it("writes the sample and position into the address after single steps", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    const replace = vi.spyOn(window.history, "replaceState");
    renderViewer({ origin: SAMPLE });
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
    expect(screen.queryByRole("button", { name: "Copy link to this moment" })).toBeNull();
  });

  it("copies a link to the clipboard and says so in a toast and the live region", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderViewer({ origin: SAMPLE, start: at(0, 4) });
    const copy = button("Copy link to this moment");
    act(() => copy.focus());
    await click(copy);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toMatch(
      /\?sample=tenhou-json&round=1&step=5&pov=1$/,
    );
    const toast = () => screen.queryByText("Link copied", { ignore: "[aria-live] *" });
    expect(toast()?.getAttribute("aria-hidden")).toBe("true");
    // The toast floats by the table; it is not one of the panel's words.
    expect(panel().contains(toast())).toBe(false);
    expect(liveText()).toBe("Link copied");
    expect(document.activeElement).toBe(copy);

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

  it("copies the link of the view on the table: the seat chosen in the player list", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderViewer({ origin: SAMPLE, start: at(1, 24) });
    await click(playerRows()[3] as HTMLElement);
    await click(button("Copy link to this moment"));
    expect(String(writeText.mock.calls[0]?.[0])).toMatch(
      /\?sample=tenhou-json&round=2&step=25&pov=4$/,
    );
  });

  it("says so when the link cannot be copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    renderViewer({ origin: SAMPLE });
    await click(button("Copy link to this moment"));
    expect(liveText()).toBe("The link could not be copied");
  });

  it("announces the same message again when the link is copied twice", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    });
    renderViewer({ origin: SAMPLE });
    const copy = () => click(button("Copy link to this moment"));
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
    expect(liveText()).toMatch(/^Result · A wins by ron off B/);
    await press("ArrowRight");
    expect(liveText()).toContain("East 2: starting hands dealt");
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(document.querySelector("[aria-live]")?.className).toBe("sr-only");
    // The result in the panel is not a second announcement of it.
    expect(panel().querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();
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
    expect(stage().tabIndex).toBe(-1);
  });

  it("gives every button a name, and a tooltip with its key where it has one", () => {
    renderViewer({ start: at(0, 24), origin: SAMPLE });
    const all = within(screen.getByRole("main")).getAllByRole("button");
    for (const control of all) {
      expect(control.getAttribute("aria-label") ?? spoken(control), control.outerHTML).toBeTruthy();
    }
    // A button that is only an icon says in a tooltip what it is.
    const icons = all.filter((control) => control.hasAttribute("data-icon"));
    expect(icons).toHaveLength(7);
    for (const control of icons) {
      expect(control.getAttribute("aria-label"), control.outerHTML).toBeTruthy();
      expect(control.title, control.outerHTML).toContain(control.getAttribute("aria-label"));
    }
    for (const control of [
      ...within(transport()).getAllByRole("button"),
      ...within(stage()).getAllByRole("button"),
      ...playerRows(),
      within(result()).getByRole("button", { name: "Next round" }),
    ]) {
      expect(control.title, control.outerHTML).toMatch(/ \(.+\)$/);
    }
  });
});
