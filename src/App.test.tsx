// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { GameLog, Round } from "./core/model";
import { MAX_LOG_SIZE } from "./formats/index";
import { I18nProvider } from "./i18n/I18nProvider";
import { ja } from "./i18n/messages/ja";
import { shown, spoken } from "./test/dom-text";
import { makeGame, makeSanmaGame, sampleRound, sampleSanmaRound } from "./test/round-builder";
import { game as shortGame } from "./ui/__fixtures__/game";
import { doubleRonRound } from "./ui/viewer/__fixtures__/games";

/**
 * Three rounds told apart by their names: East 1 (sampleRound, 25 steps: 7 draw A, 8 riichi A,
 * 24 ron), East 2 (the same round) and East 3 (a double ron in 4 steps).
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

/** A game as recorded from another seat: seat `hidden`'s own tiles are unknown ("?"). */
function hideSeat(source: GameLog, hidden: number): GameLog {
  const rounds = source.rounds.map(
    (round): Round => ({
      ...round,
      hands: round.hands.map((hand, seat) =>
        seat === hidden ? hand.map(() => "?" as const) : hand,
      ) as Round["hands"],
      events: round.events.map((event) =>
        event.type === "draw" && event.seat === hidden ? { ...event, tile: "?" } : event,
      ),
    }),
  );
  return { ...source, rounds };
}

/**
 * The logs the tests open, by the text that stands for each: the UI is tested against hand-built
 * games, and parsing is covered by the parsers' own tests. HIDDEN is one round of twelve steps
 * that ends the game, recorded from another seat. Any other text goes to the real loader.
 */
const LOGS: Record<string, () => GameLog> = {
  GAME: () => threeRounds,
  HIDDEN: () => hideSeat(shortGame, 1),
  SANMA: () => sanma,
};

vi.mock("./formats/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./formats/index")>();
  return {
    ...actual,
    loadLog: vi.fn(async (input: string | ArrayBuffer) => {
      const text = typeof input === "string" ? input : new TextDecoder().decode(input);
      return LOGS[text]?.() ?? actual.loadLog(input);
    }),
  };
});

const TENHOU_ID = "2000010100gm-0089-0000-0123abcd";
const TENHOU_DATA_URL = `https://tenhou.net/0/log/?${TENHOU_ID}`;
const SAMPLE_URL = /(^|\/)samples\/ranked_game\.json$/;
const SANMA_URL = /(^|\/)samples\/sanma\.json$/;

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}

/** fetch answering "SANMA" for the three-player sample and `body` for everything else. */
function stubFetch(body: string | Error = "GAME") {
  const fetchMock = vi.fn(async (url: string) => {
    if (body instanceof Error) {
      throw body;
    }
    return new Response(SANMA_URL.test(url) ? "SANMA" : body);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const fetched = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map((call) => call[0]);

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function fakeTransfer(data: { text?: string; files?: File[] }) {
  const files = data.files ?? [];
  return {
    files,
    types: files.length > 0 ? ["Files"] : ["text/plain"],
    getData: (type: string) => (type === "text/plain" ? (data.text ?? "") : ""),
    dropEffect: "none",
  };
}

async function pasteAnywhere(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: fakeTransfer({ text }) });
  await act(async () => {
    document.body.dispatchEvent(event);
  });
  await settle();
}

async function drag(type: "dragenter" | "drop", data: { text?: string; files?: File[] }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: fakeTransfer(data) });
  await act(async () => {
    document.body.dispatchEvent(event);
  });
  await settle();
}

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
  await settle();
}

const landing = () => screen.queryByRole("region", { name: "Mahjong Paifu Viewer" });
const table = () => screen.findByRole("region", { name: "Mahjong table" });
const stage = () => screen.getByRole("region", { name: "Mahjong table" });
const noTable = () => expect(screen.queryByRole("region", { name: "Mahjong table" })).toBeNull();
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const pasteBox = (root: HTMLElement = document.body) =>
  within(root).getByRole("textbox", { name: "Link or log to open" }) as HTMLTextAreaElement;
const fileInput = (root: HTMLElement = document.body) =>
  root.querySelector('input[type="file"]') as HTMLInputElement;
const slider = () => screen.getByRole("slider", { name: "Step in this round" }) as HTMLInputElement;
/** The position in the round as the step slider has it: "step / steps", 1-based. */
const counter = () => `${slider().value} / ${slider().max}`;
const liveText = () => document.querySelector("[aria-live]")?.textContent ?? "";

// ---- the panel beside the table, top to bottom
const panel = () => screen.getByRole("complementary", { name: "Game" });
/** The round on the table, as the panel's head names it. */
const roundName = () =>
  within(panel().querySelector("header") as HTMLElement).getByRole("heading", { level: 2 })
    .textContent;
const result = () => screen.getByRole("region", { name: "Round result" });
const players = () => screen.getByRole("region", { name: "Players" });
const playerRows = () => within(players()).getAllByRole("button");
const hands = () => screen.getByRole("checkbox", { name: "Show all hands" }) as HTMLInputElement;
/** The viewed player as the player list marks it: the pressed row's wind and name, "East A". */
const pov = () =>
  spoken(within(players()).getByRole("button", { pressed: true })).replace(/ Point of view.*$/, "");
const roundRows = () =>
  within(screen.getByRole("region", { name: "Rounds" })).getAllByRole("button");
/** One of the app's actions at the panel's foot. */
const action = (name: string) =>
  within(screen.getByRole("group", { name: "Menu" })).getByRole("button", { name });
/** Whose hand lies at the bottom of the table, as its group is named: "A's hand". */
const ownHand = () =>
  stage().querySelector("[data-own-hand] [role='group']")?.getAttribute("aria-label") ?? null;

/** Types into the paste box of the card or a dialog and presses its Open button. */
async function submitText(text: string, root: HTMLElement = document.body) {
  fireEvent.change(pasteBox(root), { target: { value: text } });
  await click(within(root).getByRole("button", { name: "Open" }));
}

/**
 * Opens the app on a game: the four-player sample named in the address, at the 1-based position
 * in `query`, answered with the log `body` stands for.
 */
async function openGame(query = "", body = "GAME") {
  window.history.replaceState(null, "", `/?sample=tenhou-json${query}`);
  const fetchMock = stubFetch(body);
  renderApp();
  await table();
  await settle();
  return fetchMock;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("App without a log in the address", () => {
  it("shows the landing card and loads nothing", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    const card = landing() as HTMLElement;
    expect(within(card).getByRole("heading", { level: 1 }).textContent).toBe(
      "Mahjong Paifu Viewer",
    );
    expect(pasteBox(card)).toBeTruthy();
    expect(within(card).getByRole("combobox", { name: "Language" })).toBeTruthy();
    noTable();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a sample from the card, names it in the address and gives the stage the focus", async () => {
    const fetchMock = stubFetch();
    renderApp();
    const sample = button("4-player");
    act(() => sample.focus());
    await click(sample);
    expect(await table()).toBeTruthy();
    expect(fetched(fetchMock)).toEqual([expect.stringMatching(SAMPLE_URL)]);
    expect(landing()).toBeNull();
    expect(window.location.search).toContain("sample=tenhou-json");
    expect(document.activeElement).toBe(stage());
    await press("ArrowRight");
    expect(liveText()).toBe("A draws East");
  });
});

describe("App loading", () => {
  it("opens a chosen file, which has no address and no link to copy", async () => {
    stubFetch();
    renderApp();
    const input = fileInput();
    expect(input.hasAttribute("accept")).toBe(false);
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["GAME"], "game.json")] } });
    });
    await table();
    expect(landing()).toBeNull();
    expect(window.location.search).toBe("");
    expect(action("Open another log")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy link to this moment" })).toBeNull();
  });

  it("opens log text typed into the box", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await submitText("SANMA");
    await table();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pov()).toBe("East A");
    expect(playerRows()).toHaveLength(3);
  });

  it("downloads a pasted Tenhou link from tenhou.net and views from the link's seat", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await pasteAnywhere(`https://tenhou.net/0/?log=${TENHOU_ID}&tw=1`);
    await table();
    expect(fetched(fetchMock)).toEqual([TENHOU_DATA_URL]);
    expect(pov()).toBe("South B");
    expect(ownHand()).toBe("B's hand");
    expect(window.location.search).toContain(`tenhou=${TENHOU_ID}`);
    // A log with an address has a link to copy.
    expect(action("Copy link to this moment")).toBeTruthy();
  });

  it("opens a dropped file and shows the overlay while it is dragged over the window", async () => {
    stubFetch();
    renderApp();
    const file = new File(["GAME"], "game.json");
    await drag("dragenter", { files: [file] });
    expect(screen.getByText("Drop the log to open it")).toBeTruthy();
    await drag("drop", { files: [file] });
    expect(screen.queryByText("Drop the log to open it")).toBeNull();
    expect(await table()).toBeTruthy();
  });

  it("keeps drop and paste working while a game is shown", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await drag("drop", { text: `https://tenhou.net/0/?log=${TENHOU_ID}` });
    await table();
    expect(pov()).toBe("East A");
    await pasteAnywhere(`tenhou.net/0/?log=${TENHOU_ID}&tw=2`);
    expect(fetched(fetchMock)).toEqual([TENHOU_DATA_URL, TENHOU_DATA_URL]);
    expect(pov()).toBe("West C");
  });

  it("opens the sample the address names at its round, step and seat", async () => {
    const fetchMock = await openGame("&round=2&step=3&pov=4");
    expect(fetched(fetchMock)).toEqual([expect.stringMatching(SAMPLE_URL)]);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("3 / 25");
    expect(pov()).toBe("North D");
    expect(ownHand()).toBe("D's hand");
    expect(roundRows().map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      "true",
      null,
      null,
    ]);
    // Nothing was pressed: the focus stays on the page.
    expect(document.activeElement).toBe(document.body);
  });

  it("opens the Tenhou log the address names", async () => {
    const fetchMock = stubFetch();
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}&round=1&step=2&pov=2`);
    renderApp();
    await table();
    expect(fetched(fetchMock)).toEqual([TENHOU_DATA_URL]);
    expect(liveText()).toBe("A draws East");
    expect(pov()).toBe("South B");
  });

  it("clamps a position past the end of the game and ignores invalid values", async () => {
    await openGame("&round=7&step=999");
    expect(roundName()).toBe("East 3");
    expect(counter()).toBe("4 / 4");
    cleanup();
    await openGame("&round=two&step=-");
    expect(roundName()).toBe("East 1");
    expect(counter()).toBe("1 / 25");
  });

  it("shows only the download status until the address's log arrives", async () => {
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    renderApp();
    await settle();
    const card = landing() as HTMLElement;
    expect(within(card).getByRole("status").textContent).toBe("Downloading the log…");
    expect(within(card).queryByRole("textbox")).toBeNull();
    await act(async () => {
      answer(new Response("GAME"));
    });
    expect(await table()).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("App load errors", () => {
  it("says on the card that pasted text is not a log", async () => {
    stubFetch();
    renderApp();
    await submitText("hello");
    const alert = within(landing() as HTMLElement).getByRole("alert");
    expect(alert.textContent).toContain("This is not a game log the viewer can read.");
    noTable();
  });

  it("refuses a file larger than any log without reading it", async () => {
    stubFetch();
    renderApp();
    const file = new File(["GAME"], "huge.mjlog");
    Object.defineProperty(file, "size", { value: MAX_LOG_SIZE + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });
    expect((await screen.findByRole("alert")).textContent).toContain("too large to be a game log");
    expect(read).not.toHaveBeenCalled();
  });

  it("links to the log's data when tenhou.net cannot be reached", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    renderApp();
    await pasteAnywhere(`https://tenhou.net/0/?log=${TENHOU_ID}&tw=1`);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be downloaded from tenhou.net");
    const link = within(alert).getByRole("link");
    expect(link.getAttribute("href")).toBe(TENHOU_DATA_URL);
    expect(link.textContent).toContain("Log data on tenhou.net");
  });

  it("does not download a Mahjong Soul link and says how to convert it", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await pasteAnywhere("https://game.mahjongsoul.com/?paipu=230101-0123abcd-4567-89ef_a12345678");
    const alert = await screen.findByRole("alert");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(alert.textContent).toContain("Mahjong Soul links cannot be opened");
    expect(within(alert).getByRole("link").textContent).toContain("tensoul on GitHub");
  });

  it("shows the load form with the error when the address's log cannot be downloaded", async () => {
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    stubFetch(new TypeError("Failed to fetch"));
    renderApp();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be downloaded");
    expect(pasteBox(landing() as HTMLElement)).toBeTruthy();
    noTable();
  });

  it("reports a failed load over a game in the Open dialog and keeps the game", async () => {
    await openGame("&round=1&step=5");
    await pasteAnywhere("hello");
    const dialog = await screen.findByRole("dialog", { name: "Open a log" });
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "This is not a game log the viewer can read.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(counter()).toBe("5 / 25");
  });
});

describe("App point of view and hands", () => {
  it("hides the other hands with H and with the Show all hands check box, and remembers it", async () => {
    await openGame();
    expect(hands().checked).toBe(true);
    expect(within(stage()).getByRole("group", { name: "B's hand" })).toBeTruthy();
    await press("h");
    expect(hands().checked).toBe(false);
    expect(within(stage()).queryByRole("group", { name: "B's hand" })).toBeNull();
    expect(
      within(stage()).getByRole("group", { name: "B's hand, 13 tiles face down" }),
    ).toBeTruthy();
    await click(hands());
    expect(hands().checked).toBe(true);
    expect(within(stage()).getByRole("group", { name: "B's hand" })).toBeTruthy();
    await click(hands());
    cleanup();
    await openGame();
    expect(hands().checked).toBe(false);
  });

  it("views from the player pressed in the player list, and the address follows", async () => {
    await openGame("&round=1&step=3");
    expect(pov()).toBe("East A");
    const row = playerRows()[2] as HTMLElement;
    act(() => row.focus());
    await click(row);
    expect(pov()).toBe("West C");
    expect(ownHand()).toBe("C's hand");
    expect(document.activeElement).toBe(playerRows()[2]);
    expect(window.location.search).toContain("sample=tenhou-json");
    expect(window.location.search).toContain("step=3");
    expect(window.location.search).toContain("pov=3");
    // The round list shows this player's changes now: C wins 8,000 in East 3.
    expect(roundRows().map((round) => round.querySelector("[data-sign]")?.textContent)).toEqual([
      undefined,
      undefined,
      "C +8,000",
      undefined,
    ]);
  });

  it("shows the hands the round end reveals in a log recorded from one seat", async () => {
    await openGame("", "HIDDEN");
    // B's tiles are unknown to the log: with every hand shown, the player list still has nothing
    // to say about that one.
    expect(spoken(playerRows()[1] as HTMLElement)).toBe("South B 25,000");
    await press("h");
    expect(
      within(stage()).getByRole("group", { name: "B's hand, 13 tiles face down" }),
    ).toBeTruthy();
    await press("End");
    expect(liveText()).toContain("B wins by ron off A");
    // Nothing covers the table at the result: the winner's hand lies open on it.
    const winner = within(within(stage()).getByRole("group", { name: "B's hand" }))
      .getAllByRole("img")
      .map((img) => img.getAttribute("alt"));
    expect(winner).toHaveLength(13);
    expect(winner).not.toContain("Face-down tile");
    expect(winner).toContain("5 Pin (red)");
    expect(
      within(stage()).getByRole("group", { name: /^C's hand, \d+ tiles face down$/ }),
    ).toBeTruthy();
    // The panel shows the same hand with the tile it won on.
    const hand = within(within(result()).getByRole("group", { name: "Winning hand" }))
      .getAllByRole("img")
      .map((img) => img.getAttribute("alt"));
    expect(hand).toHaveLength(14);
    expect(hand.at(-1)).toBe("Winning tile: 1 Pin");
    // One round, so the game ends here: the standings, and no way on.
    expect(within(result()).getByRole("table", { name: "Final standings" })).toBeTruthy();
    expect(within(result()).queryByRole("button", { name: "Next round" })).toBeNull();
  });
});

describe("App dialogs", () => {
  it.each([
    ["Open another log", "Open a log"],
    ["Settings", "Settings"],
    ["Controls", "Controls"],
  ])("opens %s from the panel and gives the focus back to its button", async (item, name) => {
    await openGame();
    const opener = action(item);
    act(() => opener.focus());
    await click(opener);
    const dialog = screen.getByRole("dialog", { name });
    await click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(action(item));
  });

  it("opens the controls on ? and keeps the viewer's keys from the table under it", async () => {
    await openGame("&round=1&step=3");
    await press("?");
    const dialog = screen.getByRole("dialog", { name: "Controls" });
    const keys = within(dialog).getByRole("region", { name: "Keyboard" });
    for (const key of ["ArrowRight", "h", "d", "End"]) {
      await press(key, { target: dialog });
    }
    expect(counter()).toBe("3 / 25");
    expect(hands().checked).toBe(true);
    // The help lists the keys there are: Esc only stops autoplay, and no key switches a table
    // view or opens a round list.
    expect(keys.textContent).toContain("Stop autoplay");
    expect(keys.textContent).not.toMatch(/Close menus|round result, stop|3D|Round list/);
  });

  it("switches the aid and the language from the settings", async () => {
    await openGame("&round=1&step=9");
    const notes = () => playerRows().map((row) => spoken(row));
    expect(notes()).toEqual([
      "East A Point of view 24,000 Waits 9 Man and Hatsu, 4 left",
      "South B 25,000 Waits 8 Pin and 1 Sou, 4 left",
      "West C 25,000",
      "North D 25,000 Waits 2 Man and 5 Man, 6 left, furiten",
    ]);
    await click(action("Settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    // The table has one view: the settings have none to choose.
    expect(within(dialog).queryByRole("radio")).toBeNull();
    await click(within(dialog).getByRole("checkbox", { name: "Show waits and shanten" }));
    expect(notes()).toEqual([
      "East A Point of view 24,000",
      "South B 25,000",
      "West C 25,000",
      "North D 25,000",
    ]);
    await act(async () => {
      fireEvent.change(within(dialog).getByRole("combobox", { name: "Language" }), {
        target: { value: "ja" },
      });
    });
    expect(liveText()).toBe("A リーチ宣言：東");
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();
    expect(screen.getAllByAltText("一萬").length).toBeGreaterThan(0);
    // The panel speaks the language too.
    const translated = screen.getByRole("complementary", { name: ja.panel.label });
    expect(within(translated).getByRole("heading", { name: ja.panel.players })).toBeTruthy();
    expect(within(translated).getByRole("heading", { name: ja.rounds.label })).toBeTruthy();
    expect(within(translated).getByRole("checkbox", { name: ja.viewer.showAllHands })).toBeTruthy();
    expect(within(translated).getByRole("button", { name: ja.menu.open })).toBeTruthy();
  });

  it("turns the single-key shortcuts off, and the controls say so", async () => {
    await openGame("&round=1&step=3");
    await click(action("Settings"));
    const settings = screen.getByRole("dialog", { name: "Settings" });
    await click(within(settings).getByRole("checkbox", { name: "Single-key shortcuts" }));
    await click(within(settings).getByRole("button", { name: "Close" }));
    for (const key of ["h", "d", "v", " "]) {
      expect(await press(key), key).toBe(true);
    }
    expect(hands().checked).toBe(true);
    expect(pov()).toBe("East A");
    expect(button("Play")).toBeTruthy();
    await press("ArrowRight");
    expect(counter()).toBe("4 / 25");
    // What the keys did, the panel still does.
    await click(hands());
    expect(hands().checked).toBe(false);
    await click(action("Controls"));
    const keys = within(screen.getByRole("dialog", { name: "Controls" })).getByRole("region", {
      name: "Keyboard",
    });
    expect(keys.textContent).toContain("Single-key shortcuts are off");
    expect(keys.textContent).toContain("(disabled)");
  });
});

describe("App history", () => {
  it("reopens another game when Back returns to its address", async () => {
    const fetchMock = await openGame("&round=2&step=3");
    window.history.replaceState(
      { v: 1, round: 1, step: 4, pov: 2 },
      "",
      "/?sample=sanma&round=2&step=5&pov=3",
    );
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    await settle();
    expect(fetched(fetchMock)).toEqual([
      expect.stringMatching(SAMPLE_URL),
      expect.stringMatching(SANMA_URL),
    ]);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("5 / 24");
    expect(pov()).toBe("West C");
    expect(playerRows()).toHaveLength(3);
  });
});

describe("App with a three-player game", () => {
  async function openSanma(query = "") {
    window.history.replaceState(null, "", `/?sample=sanma${query}`);
    const fetchMock = stubFetch();
    renderApp();
    await table();
    await settle();
    return fetchMock;
  }

  it("shows the Norths set aside and a result for three", async () => {
    await openSanma("&round=1&step=7");
    expect(liveText()).toBe("B sets aside a North tile (kita)");
    expect(
      within(stage()).getByRole("group", { name: "B's kita: 1 North tile set aside" }),
    ).toBeTruthy();
    expect(playerRows().map((row) => shown(row).split(" ").slice(0, 2).join(" "))).toEqual([
      "E A",
      "S B",
      "W C",
    ]);
    await press("End");
    expect(liveText()).toContain("Result · C wins by ron off B");
    expect(spoken(within(result()).getByRole("article"))).toBe(
      "C Ron off B 5,200 points 3 han · 40 fu Ittsu 2 han Aka Dora 1 han",
    );
    // The player list is the score table: three rows, with the round's change before the score.
    const rows = playerRows().map((row) => shown(row));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^E A Point of view 35,000( |$)/);
    expect(rows[1]).toMatch(/^S B −5,200 28,800( |$)/);
    expect(rows[2]).toMatch(/^W C \+6,200 41,200( |$)/);
    const next = within(result()).getByRole("button", { name: "Next round" });
    act(() => next.focus());
    await click(next);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 24");
    expect(document.activeElement).toBe(stage());
  });

  it("jumps from the round list, and ranks three players at the game's end", async () => {
    await openSanma();
    await click(roundRows()[1] as HTMLElement);
    expect(roundName()).toBe("East 2");
    expect(counter()).toBe("1 / 24");
    await click(button("Final standings"));
    expect(counter()).toBe("24 / 24");
    expect(
      within(within(result()).getByRole("table", { name: "Final standings" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => spoken(row)),
    ).toEqual(["1st C 41,200", "2nd A 35,000", "3rd B 28,800"]);
  });
});

describe("App focus", () => {
  it("moves the focus to the stage when another log replaces the game", async () => {
    const fetchMock = await openGame("&round=1&step=4");
    const opener = action("Open another log");
    act(() => opener.focus());
    await click(opener);
    const dialog = screen.getByRole("dialog", { name: "Open a log" });
    await click(within(dialog).getByRole("button", { name: "3-player" }));
    expect(fetched(fetchMock).at(-1)).toMatch(SANMA_URL);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(counter()).toBe("1 / 24");
    expect(document.activeElement).toBe(await table());
    // A new game starts with plain scores on the console.
    expect(
      within(stage())
        .getByRole("button", { name: "Show score differences" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
