// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { GameLog, Round } from "./core/model";
import { MAX_LOG_SIZE } from "./formats/index";
import { I18nProvider } from "./i18n/I18nProvider";
import { game } from "./ui/__fixtures__/game";

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

async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(window, { key });
  });
}

function stubFetch(body: string | Error) {
  const fetchMock = vi.fn(async (_url: string) => {
    if (body instanceof Error) {
      throw body;
    }
    return new Response(body);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("shows a localized error for text that is not a log", async () => {
    renderApp();
    fireEvent.change(screen.getByLabelText("Paste the log data or a Tenhou link"), {
      target: { value: "hello" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("not a log format");
  });

  it("downloads the log of a pasted Tenhou link from tenhou.net", async () => {
    const fetchMock = stubFetch("FIXTURE");
    renderApp();
    await pasteAnywhere("https://tenhou.net/0/?log=2000010100gm-0089-0000-0123abcd&tw=1");
    expect(await screen.findByRole("region", { name: "Mahjong table" })).toBeTruthy();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([TENHOU_DATA_URL]);
  });

  it("downloads the log for a bare log id, a link without https:// and a dropped link", async () => {
    const fetchMock = stubFetch("FIXTURE");
    renderApp();
    fireEvent.change(screen.getByLabelText("Paste the log data or a Tenhou link"), {
      target: { value: ` ${TENHOU_ID}\n` },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load" }));
    });
    expect(await screen.findByRole("region", { name: "Mahjong table" })).toBeTruthy();

    await pasteAnywhere(`tenhou.net/0/?log=${TENHOU_ID}&tw=2`);
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: fakeTransfer({ text: `https://tenhou.net/0/?log=${TENHOU_ID}` }),
    });
    await act(async () => {
      document.body.dispatchEvent(drop);
    });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      TENHOU_DATA_URL,
      TENHOU_DATA_URL,
      TENHOU_DATA_URL,
    ]);
  });

  it("explains how to save the log when tenhou.net cannot be reached", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    renderApp();
    await pasteAnywhere(`https://tenhou.net/0/?log=${TENHOU_ID}&tw=1`);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be downloaded from tenhou.net");
    expect(alert.textContent).toContain("Ctrl+S");
    const link = within(alert).getByRole("link");
    expect(link.getAttribute("href")).toBe(TENHOU_DATA_URL);
    expect(link.textContent).toBe(TENHOU_DATA_URL);
    expect(screen.queryByRole("region", { name: "Mahjong table" })).toBeNull();
  });

  it("does not try to download other sites' links and says what to do instead", async () => {
    const fetchMock = stubFetch("FIXTURE");
    renderApp();
    await pasteAnywhere("https://game.mahjongsoul.com/?paipu=230101-0123abcd-4567-89ef_a12345678");
    const alert = await screen.findByRole("alert");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(alert.textContent).toContain("link to a log");
    expect(alert.textContent).toContain("Mahjong Soul");
    expect(alert.textContent).not.toMatch(/browsers do not let/i);
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("loads a pasted log, steps through it and shows the result", async () => {
    renderApp();
    await pasteAnywhere("FIXTURE");
    expect(await screen.findByRole("region", { name: "Mahjong table" })).toBeTruthy();
    expect(screen.getByText("East 1, 1 honba: starting hands dealt")).toBeTruthy();

    await press("ArrowRight");
    expect(screen.getByText("A draws Haku")).toBeTruthy();
    await press("ArrowRight");
    expect(screen.getByText("A discards Haku right after drawing it")).toBeTruthy();

    await press("End");
    expect(screen.getByText("B wins by ron off A")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Round result" })).toBeTruthy();
    expect(screen.getByText("Riichi")).toBeTruthy();
    expect(screen.getByText("2 han · 40 fu · 3,900 points")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Final standings" })).toBeTruthy();

    await press("Home");
    expect(screen.getByText("East 1, 1 honba: starting hands dealt")).toBeTruthy();
  });

  it("switches the language of the viewer", async () => {
    renderApp();
    await pasteAnywhere("FIXTURE");
    await screen.findByRole("region", { name: "Mahjong table" });
    const info = () => screen.getByRole("region", { name: /^(Game information|対局情報)$/ });
    expect(
      within(info()).getByText("Phoenix room · East-South game · Open tanyao · Red fives"),
    ).toBeTruthy();
    expect(within(info()).getByText("4 dan R1913")).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Language"), { target: { value: "ja" } });
    });
    expect(screen.getAllByText("東1局 1本場").length).toBeGreaterThan(0);
    expect(screen.getAllByAltText("赤五萬").length).toBeGreaterThan(0);
    expect(within(info()).getByText("鳳凰卓 · 東南戦 · 喰いタンあり · 赤あり")).toBeTruthy();
    expect(within(info()).getByText("四段 R1913")).toBeTruthy();
  });

  it("opens a dropped file and shows the overlay while dragging", async () => {
    renderApp();
    const file = new File(["FIXTURE"], "game.json");
    const dragEnter = new Event("dragenter", { bubbles: true, cancelable: true });
    Object.defineProperty(dragEnter, "dataTransfer", { value: fakeTransfer({ files: [file] }) });
    await act(async () => {
      document.body.dispatchEvent(dragEnter);
    });
    expect(screen.getByText("Drop the log file to open it")).toBeTruthy();

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: fakeTransfer({ files: [file] }) });
    await act(async () => {
      document.body.dispatchEvent(drop);
    });
    expect(await screen.findByRole("region", { name: "Mahjong table" })).toBeTruthy();
    expect(screen.queryByText("Drop the log file to open it")).toBeNull();
  });

  it("refuses a file larger than any log without reading it", async () => {
    renderApp();
    const file = new File(["FIXTURE"], "huge.mjlog");
    Object.defineProperty(file, "size", { value: MAX_LOG_SIZE + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
    });
    expect((await screen.findByRole("alert")).textContent).toContain("too large to be a game log");
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Mahjong table" })).toBeNull();
  });

  it("lets any file be chosen, since the format is detected from the content", () => {
    renderApp();
    expect(screen.getByLabelText("Choose a file").hasAttribute("accept")).toBe(false);
  });

  it("opens a sample from the load screen", async () => {
    const fetchMock = stubFetch("FIXTURE");
    renderApp();
    const samples = screen.getByRole("region", { name: "Try a sample" });
    expect(
      within(samples)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Short game (tenhou.net/6 JSON)"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Short game (tenhou.net/6 JSON)" }));
    });
    expect(await screen.findByRole("region", { name: "Mahjong table" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/(^|\/)samples\/ranked_game\.json$/);
    expect(screen.getByText("East 1, 1 honba: starting hands dealt")).toBeTruthy();
  });

  it("opens the sample named in the URL at the given round and step", async () => {
    const fetchMock = stubFetch("FIXTURE");
    window.history.replaceState(null, "", "/?sample=tenhou-json&round=1&step=3");
    renderApp();
    expect(await screen.findByRole("region", { name: "Mahjong table" })).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/(^|\/)samples\/ranked_game\.json$/);
    expect(screen.getByText("A discards Haku right after drawing it")).toBeTruthy();
    expect(screen.getByText(/^Step 3 \//)).toBeTruthy();
  });

  it("leaves the focus on the page for a sample opened from the address", async () => {
    stubFetch("FIXTURE");
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    renderApp();
    expect(await screen.findByRole("region", { name: "Mahjong table" })).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });

  it("clamps a position past the end of the game and ignores invalid values", async () => {
    stubFetch("FIXTURE");
    window.history.replaceState(null, "", "/?sample=tenhou-json&round=7&step=999");
    renderApp();
    expect(await screen.findByText("B wins by ron off A")).toBeTruthy();
    cleanup();

    window.history.replaceState(null, "", "/?sample=tenhou-json&round=two&step=-");
    renderApp();
    expect(await screen.findByText("East 1, 1 honba: starting hands dealt")).toBeTruthy();
  });

  it("stays on the load screen for an unknown sample and reports a failed download", async () => {
    const fetchMock = stubFetch(new TypeError("Failed to fetch"));
    window.history.replaceState(null, "", "/?sample=nope");
    renderApp();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Short game (tenhou.net/6 JSON)" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("could not be downloaded");
    expect(screen.queryByRole("region", { name: "Mahjong table" })).toBeNull();
  });

  it("keeps the keyboard focus on the page when views and errors change", async () => {
    stubFetch("FIXTURE");
    renderApp();
    const sample = screen.getByRole("button", { name: "Short game (tenhou.net/6 JSON)" });
    act(() => sample.focus());
    await act(async () => {
      fireEvent.click(sample);
    });
    await screen.findByRole("region", { name: "Mahjong table" });
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Game information" }));

    // An error while a game is open: Dismiss hands the focus to the next control.
    await pasteAnywhere("hello");
    const dismiss = within(await screen.findByRole("alert")).getByRole("button", {
      name: "Dismiss",
    });
    act(() => dismiss.focus());
    await act(async () => {
      fireEvent.click(dismiss);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Round"));

    const newLog = screen.getByRole("button", { name: "Open another log" });
    act(() => newLog.focus());
    await act(async () => {
      fireEvent.click(newLog);
    });
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Open a game log" }));

    // On the load screen, Dismiss moves on to the file picker.
    await pasteAnywhere("hello");
    const dismissAgain = within(await screen.findByRole("alert")).getByRole("button", {
      name: "Dismiss",
    });
    act(() => dismissAgain.focus());
    await act(async () => {
      fireEvent.click(dismissAgain);
    });
    expect(document.activeElement).toBe(screen.getByLabelText("Choose a file"));
  });

  it("shows the hands the round end reveals with only one player's hand shown", async () => {
    renderApp();
    await pasteAnywhere("HIDDEN");
    await screen.findByRole("region", { name: "Mahjong table" });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Show all hands"));
    });
    const altsOf = (name: string) =>
      within(screen.getByRole("group", { name }))
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt"));
    expect(new Set(altsOf("B's hand"))).toEqual(new Set(["Face-down tile"]));

    await press("End");
    expect(screen.getByText("B wins by ron off A")).toBeTruthy();
    const winner = altsOf("B's hand");
    expect(winner).toHaveLength(13);
    expect(winner).not.toContain("Face-down tile");
    expect(winner).toContain("5 Pin (red)");
    expect(new Set(altsOf("C's hand"))).toEqual(new Set(["Face-down tile"]));
  });
});
