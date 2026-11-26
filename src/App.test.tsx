// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { GameLog, Round } from "./core/model";
import { MAX_LOG_SIZE } from "./formats/index";
import { I18nProvider } from "./i18n/I18nProvider";
import { game } from "./ui/__fixtures__/game";
import { resetBreakpointCache } from "./ui/useBreakpoint";

// The UI is tested against a hand-built game; parsing is covered by the parsers' own tests.
vi.mock("./formats/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./formats/index")>();
  return {
    ...actual,
    loadLog: vi.fn(async (input: string | ArrayBuffer) => {
      const text = typeof input === "string" ? input : new TextDecoder().decode(input);
      if (text === "FIXTURE") {
        return game;
      }
      return text === "HIDDEN" ? hideSeat(game, 1) : actual.loadLog(input);
    }),
  };
});

/** The fixture game as recorded from another seat: seat `hidden`'s own tiles are unknown ("?"). */
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

const TENHOU_ID = "2000010100gm-0089-0000-0123abcd";
const TENHOU_DATA_URL = `https://tenhou.net/0/log/?${TENHOU_ID}`;
const SAMPLE_URL = /(^|\/)samples\/ranked_game\.json$/;

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
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
}

async function dropAnywhere(data: { text?: string; files?: File[] }) {
  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: fakeTransfer(data) });
  await act(async () => {
    document.body.dispatchEvent(drop);
  });
}

async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(window, { key });
  });
}

/** fetch answering with `body` (the sample under the welcome card included), or failing. */
function stubFetch(body: string | Error = "FIXTURE") {
  const fetchMock = vi.fn(async (_url: string) => {
    if (body instanceof Error) {
      throw body;
    }
    return new Response(body);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const table = () => screen.findByRole("region", { name: "Mahjong table" });
const status = () => document.querySelector('[aria-live="polite"]')?.textContent ?? "";
const counter = () => screen.getByText(/^Step \d+ \/ \d+$/).textContent;
const welcomeCard = () => screen.queryByRole("region", { name: "Mahjong Paifu Viewer" });
const nonSampleCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map((call) => call[0]).filter((url) => !SAMPLE_URL.test(url));

beforeEach(() => {
  resetBreakpointCache();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  delete document.documentElement.dataset.theme;
});

describe("App: first visit", () => {
  it("opens the four-player sample under the welcome card", async () => {
    const fetchMock = stubFetch();
    renderApp();
    expect(await table()).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(SAMPLE_URL);
    expect(welcomeCard()).toBeTruthy();
    expect(within(welcomeCard() as HTMLElement).getByText("Open a file…")).toBeTruthy();

    // The first table step drops the card.
    await press("ArrowRight");
    expect(welcomeCard()).toBeNull();
    expect(status()).toContain("A draws Haku");
  });

  it("shows the card over an empty table when the sample cannot load", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    renderApp();
    expect((await screen.findByRole("alert")).textContent).toContain("could not be downloaded");
    expect(welcomeCard()).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Mahjong table" })).toBeNull();
  });

  it("shows a localized error for pasted text that is not a log", async () => {
    stubFetch();
    renderApp();
    await table();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paste a link or log" }));
    });
    fireEvent.change(screen.getByLabelText("Paste the log data or a Tenhou link"), {
      target: { value: "hello" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("not a log format");
  });

  it("refuses a file larger than any log without reading it", async () => {
    stubFetch();
    renderApp();
    await table();
    const file = new File(["FIXTURE"], "huge.mjlog");
    Object.defineProperty(file, "size", { value: MAX_LOG_SIZE + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    const input = within(welcomeCard() as HTMLElement).getByLabelText("Open a file…");
    expect(input.hasAttribute("accept")).toBe(false);
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect((await screen.findByRole("alert")).textContent).toContain("too large to be a game log");
    expect(read).not.toHaveBeenCalled();
  });
});

describe("App: loading", () => {
  it("downloads the log of a pasted Tenhou link from tenhou.net", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await table();
    await pasteAnywhere("https://tenhou.net/0/?log=2000010100gm-0089-0000-0123abcd&tw=1");
    expect(nonSampleCalls(fetchMock)).toEqual([TENHOU_DATA_URL]);
    expect(welcomeCard()).toBeNull();
    // tw=1: the second seat's point of view.
    expect(screen.getByRole("button", { name: "Point of view: B" })).toBeTruthy();
  });

  it("downloads the log of a dropped link and keeps drop and paste working while viewing", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await table();
    await dropAnywhere({ text: `https://tenhou.net/0/?log=${TENHOU_ID}` });
    await pasteAnywhere(`tenhou.net/0/?log=${TENHOU_ID}&tw=2`);
    expect(nonSampleCalls(fetchMock)).toEqual([TENHOU_DATA_URL, TENHOU_DATA_URL]);
  });

  it("explains how to save the log when tenhou.net cannot be reached", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await table();
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    await pasteAnywhere(`https://tenhou.net/0/?log=${TENHOU_ID}&tw=1`);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be downloaded from tenhou.net");
    expect(alert.textContent).toContain("Ctrl+S");
    expect(within(alert).getByRole("link").getAttribute("href")).toBe(TENHOU_DATA_URL);
  });

  it("does not try to download other sites' links and says what to do instead", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await table();
    await pasteAnywhere("https://game.mahjongsoul.com/?paipu=230101-0123abcd-4567-89ef_a12345678");
    const alert = await screen.findByRole("alert");
    expect(nonSampleCalls(fetchMock)).toEqual([]);
    expect(alert.textContent).toContain("Mahjong Soul");
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("opens a dropped file and shows the overlay while dragging", async () => {
    stubFetch();
    renderApp();
    await table();
    const file = new File(["FIXTURE"], "game.json");
    const dragEnter = new Event("dragenter", { bubbles: true, cancelable: true });
    Object.defineProperty(dragEnter, "dataTransfer", { value: fakeTransfer({ files: [file] }) });
    await act(async () => {
      document.body.dispatchEvent(dragEnter);
    });
    expect(screen.getByText("Drop the log file to open it")).toBeTruthy();
    await dropAnywhere({ files: [file] });
    expect(screen.queryByText("Drop the log file to open it")).toBeNull();
    expect(welcomeCard()).toBeNull();
  });

  it("opens the sample named in the URL at the given round and step", async () => {
    const fetchMock = stubFetch();
    window.history.replaceState(null, "", "/?sample=tenhou-json&round=1&step=3");
    renderApp();
    await table();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(SAMPLE_URL);
    expect(welcomeCard()).toBeNull();
    expect(status()).toContain("A discards Haku right after drawing it");
    expect(counter()).toMatch(/^Step 3 \//);
    // The focus stays on the page for a sample opened from the address.
    expect(document.activeElement).toBe(document.body);
  });

  it("opens the Tenhou log named in the URL at the given round, step and seat", async () => {
    const fetchMock = stubFetch();
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}&round=1&step=2&pov=2`);
    renderApp();
    await table();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([TENHOU_DATA_URL]);
    expect(status()).toContain("A draws Haku");
    expect(screen.getByRole("button", { name: "Point of view: B" })).toBeTruthy();
  });

  it("clamps a position past the end of the game and ignores invalid values", async () => {
    stubFetch();
    window.history.replaceState(null, "", "/?sample=tenhou-json&round=7&step=999");
    renderApp();
    await table();
    expect(status()).toContain("B wins by ron off A");
    cleanup();

    window.history.replaceState(null, "", "/?sample=tenhou-json&round=two&step=-");
    renderApp();
    await table();
    expect(status()).toContain("East 1, 1 honba: starting hands dealt");
  });

  it("applies the stored theme to the page", () => {
    stubFetch();
    localStorage.setItem(
      "mahjong-paifu-viewer:settings",
      JSON.stringify({ version: 1, theme: "dark" }),
    );
    renderApp();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("App: viewing", () => {
  it("steps through a pasted log and shows the result and the final standings", async () => {
    stubFetch();
    renderApp();
    await table();
    await pasteAnywhere("FIXTURE");
    expect(status()).toContain("East 1, 1 honba: starting hands dealt");

    await press("ArrowRight");
    expect(status()).toContain("A draws Haku");
    await press("ArrowRight");
    expect(status()).toContain("A discards Haku right after drawing it");

    await press("End");
    expect(status()).toContain("B wins by ron off A");
    const card = screen.getByRole("region", { name: "Round result" });
    expect(within(card).getByText("Riichi")).toBeTruthy();
    expect(within(card).getByText("2 han · 40 fu · 3,900 points")).toBeTruthy();
    expect(within(card).getByRole("heading", { name: "Final standings" })).toBeTruthy();

    await press("Home");
    expect(status()).toContain("East 1, 1 honba: starting hands dealt");
  });

  it("switches the language of the viewer from the settings", async () => {
    stubFetch();
    renderApp();
    await table();
    await pasteAnywhere("FIXTURE");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    });
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText("Language"), { target: { value: "ja" } });
    });
    expect(status()).toContain("東1局 1本場");
    expect(screen.getAllByAltText("赤五萬").length).toBeGreaterThan(0);
  });

  it("shows the hands the round end reveals with only one player's hand shown", async () => {
    stubFetch();
    renderApp();
    await table();
    await pasteAnywhere("HIDDEN");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show all hands" }));
    });
    expect(screen.getByRole("group", { name: "B's hand, 13 tiles face down" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "B's hand" })).toBeNull();

    await press("End");
    expect(status()).toContain("B wins by ron off A");
    const winner = within(screen.getByRole("group", { name: "B's hand" }))
      .getAllByRole("img")
      .map((img) => img.getAttribute("alt"));
    expect(winner).toHaveLength(13);
    expect(winner).not.toContain("Face-down tile");
    expect(winner).toContain("5 Pin (red)");
    expect(screen.getByRole("group", { name: /^C's hand, \d+ tiles face down$/ })).toBeTruthy();
  });

  it("opens another log from the toolbar and moves the focus to the stage", async () => {
    const fetchMock = stubFetch();
    renderApp();
    await table();
    await press("ArrowRight");
    const open = screen.getByRole("button", { name: "Open another log" });
    act(() => open.focus());
    await act(async () => {
      fireEvent.click(open);
    });
    const dialog = screen.getByRole("dialog", { name: "Open a game log" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /3-player/ }));
    });
    expect(fetchMock.mock.calls.at(-1)?.[0]).toMatch(/(^|\/)samples\/sanma\.json$/);
    expect(document.activeElement).toBe(await table());
  });
});
