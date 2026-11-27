// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogErrorCode } from "../../formats/index";
import { MAX_LOG_SIZE } from "../../formats/index";
import { I18nProvider } from "../../i18n/I18nProvider";
import { en } from "../../i18n/messages/en";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game } from "../__fixtures__/game";
import { SettingsProvider } from "../settings/SettingsProvider";
import { useSettings } from "../settings/useSettings";
import { DOWNLOAD_TIMEOUT_MS } from "../useLogLoader";
import { Shell, type ShellViewerProps } from "./Shell";

// "FIXTURE" and "SANMA" stand for two logs, "THROW:<code>" for a log the parsers refuse with that
// code and "CRASH" for a bug in a parser; anything else goes to the real loader.
vi.mock("../../formats/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../formats/index")>();
  return {
    ...actual,
    loadLog: vi.fn(async (input: string | ArrayBuffer) => {
      const text = typeof input === "string" ? input : new TextDecoder().decode(input);
      if (text === "FIXTURE") {
        return game;
      }
      if (text === "SANMA") {
        return sanmaCrossFormatGame();
      }
      if (text.startsWith("THROW:")) {
        throw new actual.LogParseError(text.slice("THROW:".length) as LogErrorCode);
      }
      if (text === "CRASH") {
        throw new TypeError("boom");
      }
      return actual.loadLog(input);
    }),
  };
});

const TENHOU_ID = "2000010100gm-0089-0000-0123abcd";
const TENHOU_DATA_URL = `https://tenhou.net/0/log/?${TENHOU_ID}`;
const TENHOU_LINK = `https://tenhou.net/0/?log=${TENHOU_ID}`;
const SOUL_LINK =
  "https://game.mahjongsoul.com/?paipu=190428-0f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8_a123456789";

/** The viewer's stand-in: shows what the shell passes and offers the calls the real one makes. */
function StubViewer(props: ShellViewerProps) {
  const { openDialog } = useSettings();
  return (
    <section ref={props.focusRef} tabIndex={-1} aria-label="Stub viewer">
      <span data-testid="players">{props.game.playerCount}</span>
      <span data-testid="start">{JSON.stringify(props.start)}</span>
      <span data-testid="origin">{JSON.stringify(props.origin)}</span>
      <span data-testid="entry">{String(props.newEntry)}</span>
      <span data-testid="notice">{props.notice ?? ""}</span>
      <button type="button" onClick={() => openDialog("open")}>
        Menu: open
      </button>
      <button type="button" onClick={() => openDialog("settings")}>
        Menu: settings
      </button>
      <button type="button" onClick={() => openDialog("help")}>
        Menu: controls
      </button>
    </section>
  );
}

/** fetch answering "FIXTURE" for the four-player sample and Tenhou, "SANMA" for the sanma sample. */
function stubFetch(fail: (url: string) => boolean = () => false) {
  const fetchMock = vi.fn(async (url: string) => {
    if (fail(url)) {
      throw new TypeError("Failed to fetch");
    }
    return new Response(url.endsWith("sanma.json") ? "SANMA" : "FIXTURE");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** fetch that answers only when the test says so. */
function stubSlowFetch() {
  let answer: (body: string | Error) => void = () => {};
  const fetchMock = vi.fn(
    (_url: string, _init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        answer = (body) => (body instanceof Error ? reject(body) : resolve(new Response(body)));
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    answer: async (body: string | Error) => {
      await act(async () => {
        answer(body);
      });
      await settle();
    },
  };
}

function renderShell() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <Shell renderViewer={(props) => <StubViewer {...props} />} />
      </SettingsProvider>
    </I18nProvider>,
  );
}

/** Starts with the four-player sample named in the address, so a game is shown. */
async function renderWithGame() {
  window.history.replaceState(null, "", "/?sample=tenhou-json");
  const fetchMock = stubFetch();
  renderShell();
  await viewer();
  return fetchMock;
}

const landing = () => screen.queryByRole("region", { name: "Mahjong Paifu Viewer" });
const viewer = () => screen.findByRole("region", { name: "Stub viewer" });
const noViewer = () => expect(screen.queryByRole("region", { name: "Stub viewer" })).toBeNull();
const output = (id: string) => screen.getByTestId(id).textContent;
const pasteBox = (root: HTMLElement = document.body) =>
  within(root).getByRole("textbox", { name: "Link or log to open" }) as HTMLTextAreaElement;
const fileInput = (root: HTMLElement = document.body) =>
  root.querySelector('input[type="file"]') as HTMLInputElement;
const openDialog = () => screen.getByRole("dialog", { name: "Open a log" });
const alertText = (root: HTMLElement) => within(root).getByRole("alert").textContent;

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

/** Types into the paste box of the card or the dialog and presses its Open button. */
async function submitText(text: string, root: HTMLElement = document.body) {
  fireEvent.change(pasteBox(root), { target: { value: text } });
  await act(async () => {
    fireEvent.click(within(root).getByRole("button", { name: "Open" }));
  });
  await settle();
}

async function chooseFile(file: File, root: HTMLElement = document.body) {
  await act(async () => {
    fireEvent.change(fileInput(root), { target: { files: [file] } });
  });
  await settle();
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("Shell without a log in the address", () => {
  it("shows the landing card with the load form and loads nothing", async () => {
    const fetchMock = stubFetch();
    renderShell();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    const card = landing() as HTMLElement;
    expect(within(card).getByRole("heading", { level: 1 }).textContent).toBe(
      "Mahjong Paifu Viewer",
    );
    expect(pasteBox(card)).toBeTruthy();
    expect(within(card).queryByRole("status")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    noViewer();
    expect(window.location.search).toBe("");
  });
});

describe("Shell loading from the landing card", () => {
  it("opens a chosen file and hands the focus to the stage", async () => {
    stubFetch();
    renderShell();
    screen.getByRole("button", { name: "Choose a file" }).focus();
    await chooseFile(new File(["SANMA"], "s.json"));
    expect(landing()).toBeNull();
    expect(output("players")).toBe("3");
    expect(output("origin")).toBe("null");
    expect(output("entry")).toBe("false");
    expect(document.activeElement).toBe(await viewer());
  });

  it("opens log text typed or pasted into the box", async () => {
    const fetchMock = stubFetch();
    renderShell();
    await submitText("SANMA");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(output("players")).toBe("3");
    expect(output("origin")).toBe("null");
  });

  it("downloads a Tenhou link from the box and opens it where the link says", async () => {
    const fetchMock = stubFetch();
    renderShell();
    fireEvent.change(pasteBox(), {
      target: { value: `https://tenhou.net/0/?log=${TENHOU_ID}&tw=2&ts=1` },
    });
    await act(async () => {
      fireEvent.keyDown(pasteBox(), { key: "Enter" });
    });
    await settle();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([TENHOU_DATA_URL]);
    expect(output("origin")).toBe(JSON.stringify({ kind: "tenhou", logId: TENHOU_ID }));
    expect(output("start")).toBe(JSON.stringify({ round: 1, step: 0, pov: 2 }));
  });

  it("downloads a bare log id", async () => {
    const fetchMock = stubFetch();
    renderShell();
    await submitText(TENHOU_ID);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([TENHOU_DATA_URL]);
    expect(output("origin")).toBe(JSON.stringify({ kind: "tenhou", logId: TENHOU_ID }));
    expect(output("start")).toBe("null");
  });

  it("loads a log pasted anywhere on the page, as the first entry", async () => {
    stubFetch();
    renderShell();
    await pasteAnywhere(`https://tenhou.net/0/?log=${TENHOU_ID}&tw=2&ts=1`);
    expect(landing()).toBeNull();
    expect(output("origin")).toBe(JSON.stringify({ kind: "tenhou", logId: TENHOU_ID }));
    expect(output("start")).toBe(JSON.stringify({ round: 1, step: 0, pov: 2 }));
    expect(output("entry")).toBe("false");
  });

  it("leaves a paste into the box to the box", async () => {
    stubFetch();
    renderShell();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: fakeTransfer({ text: "SANMA" }) });
    await act(async () => {
      pasteBox().dispatchEvent(event);
    });
    await settle();
    expect(event.defaultPrevented).toBe(false);
    noViewer();
  });

  it("loads a dropped file, showing the overlay while it is dragged over the window", async () => {
    stubFetch();
    renderShell();
    const files = [new File(["SANMA"], "sanma.json")];
    await drag("dragenter", { files });
    expect(screen.getByText("Drop the log to open it")).toBeTruthy();
    await drag("drop", { files });
    expect(screen.queryByText("Drop the log to open it")).toBeNull();
    expect(output("players")).toBe("3");
    expect(output("origin")).toBe("null");
  });

  it("loads dropped text", async () => {
    stubFetch();
    renderShell();
    await drag("drop", { text: "FIXTURE" });
    expect(output("players")).toBe("4");
  });

  it.each([
    ["4-player", "tenhou-json", "4", /samples\/ranked_game\.json$/],
    ["3-player", "sanma", "3", /samples\/sanma\.json$/],
  ])("loads the %s sample", async (name, id, players, url) => {
    const fetchMock = stubFetch();
    renderShell();
    await click(screen.getByRole("button", { name }));
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([expect.stringMatching(url)]);
    expect(output("players")).toBe(players);
    expect(output("origin")).toBe(JSON.stringify({ kind: "sample", id }));
    expect(landing()).toBeNull();
  });

  it("says a download is on its way without switching the form off", async () => {
    const { answer } = stubSlowFetch();
    renderShell();
    await click(screen.getByRole("button", { name: "4-player" }));
    const card = landing() as HTMLElement;
    expect(within(card).getByRole("status").textContent).toBe("Downloading the log…");
    expect(pasteBox(card).disabled).toBe(false);
    expect(
      (within(card).getByRole("button", { name: "3-player" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await answer("FIXTURE");
    expect(output("players")).toBe("4");
  });

  it("keeps only the latest of two loads", async () => {
    const { answer } = stubSlowFetch();
    renderShell();
    await click(screen.getByRole("button", { name: "4-player" }));
    await submitText("SANMA");
    expect(output("players")).toBe("3");
    await answer("FIXTURE");
    expect(output("players")).toBe("3");
  });
});

describe("Shell with a log in the address", () => {
  it("opens the sample at its 1-based round, step and seat", async () => {
    window.history.replaceState(null, "", "/?sample=sanma&round=2&step=3&pov=2");
    const fetchMock = stubFetch();
    renderShell();
    await viewer();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(/samples\/sanma\.json$/),
    ]);
    expect(landing()).toBeNull();
    expect(output("players")).toBe("3");
    expect(output("start")).toBe(JSON.stringify({ round: 1, step: 2, pov: 1 }));
    expect(output("origin")).toBe(JSON.stringify({ kind: "sample", id: "sanma" }));
    expect(output("entry")).toBe("false");
  });

  it("opens the Tenhou log", async () => {
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}&round=3`);
    const fetchMock = stubFetch();
    renderShell();
    await viewer();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([TENHOU_DATA_URL]);
    expect(output("start")).toBe(JSON.stringify({ round: 2, step: 0, pov: null }));
    expect(output("origin")).toBe(JSON.stringify({ kind: "tenhou", logId: TENHOU_ID }));
  });

  it("shows only the app's name, the download status and Cancel until the log arrives", async () => {
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}`);
    const { answer } = stubSlowFetch();
    renderShell();
    const card = landing() as HTMLElement;
    expect(within(card).getByRole("heading", { level: 1 }).textContent).toBe(
      "Mahjong Paifu Viewer",
    );
    expect(within(card).getByRole("status").textContent).toBe("Downloading the log…");
    expect(within(card).queryByRole("textbox")).toBeNull();
    expect(
      within(card)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Cancel"]);
    expect(within(card).queryByRole("combobox")).toBeNull();
    await settle();
    expect(within(card).getByRole("status").textContent).toBe("Downloading the log…");
    await answer("FIXTURE");
    expect(landing()).toBeNull();
    expect(output("players")).toBe("4");
  });

  it("shows the load form with the error when the log cannot be downloaded", async () => {
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}`);
    const { answer } = stubSlowFetch();
    renderShell();
    await answer(new TypeError("Failed to fetch"));
    const card = landing() as HTMLElement;
    expect(alertText(card)).toContain(en.errors.codes.tenhouFetchFailed);
    expect(within(card).queryByRole("status")).toBeNull();
    expect(pasteBox(card)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    noViewer();
  });

  it("puts the address's Tenhou link in the box, so trying again is one press of Open", async () => {
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}&round=3&pov=2`);
    const { answer } = stubSlowFetch();
    renderShell();
    await answer(new TypeError("Failed to fetch"));
    const card = landing() as HTMLElement;
    expect(pasteBox(card).value).toBe(`${TENHOU_LINK}&tw=1&ts=2`);
    // The focus stays where it was: in the box, a phone's keyboard would come up unasked.
    expect(document.activeElement).not.toBe(pasteBox(card));
    stubFetch();
    await click(within(card).getByRole("button", { name: "Open" }));
    expect(output("origin")).toBe(JSON.stringify({ kind: "tenhou", logId: TENHOU_ID }));
    expect(output("start")).toBe(JSON.stringify({ round: 2, step: 0, pov: 1 }));
  });

  it("stops the download with Cancel and shows the load form", async () => {
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}`);
    const { fetchMock, answer } = stubSlowFetch();
    renderShell();
    await settle();
    const cancel = within(landing() as HTMLElement).getByRole("button", { name: "Cancel" });
    cancel.focus();
    await click(cancel);
    const card = landing() as HTMLElement;
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(within(card).queryByRole("status")).toBeNull();
    expect(within(card).queryByRole("alert")).toBeNull();
    expect(pasteBox(card).value).toBe(TENHOU_LINK);
    expect(document.activeElement).toBe(card);
    await answer("FIXTURE");
    noViewer();
  });

  it("gives up a download that does not answer, and says so", async () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}`);
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
            }),
        ),
      );
      renderShell();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS - 1);
      });
      expect(within(landing() as HTMLElement).getByRole("status")).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      const card = landing() as HTMLElement;
      expect(alertText(card)).toContain(en.errors.codes.tenhouFetchFailed);
      expect(within(card).queryByRole("status")).toBeNull();
      expect(pasteBox(card).value).toBe(TENHOU_LINK);
    } finally {
      vi.useRealTimers();
    }
  });

  it("goes back to the form, not to the status, when the next load is the user's", async () => {
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    stubFetch(() => true);
    renderShell();
    await settle();
    const { answer } = stubSlowFetch();
    await click(screen.getByRole("button", { name: "3-player" }));
    const card = landing() as HTMLElement;
    expect(pasteBox(card)).toBeTruthy();
    expect(within(card).getByRole("status").textContent).toBe("Downloading the log…");
    expect(within(card).queryByRole("alert")).toBeNull();
    await answer("SANMA");
    expect(output("players")).toBe("3");
  });

  it("drops the status for what the user opens while the address's log is on its way", async () => {
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}`);
    const { fetchMock, answer } = stubSlowFetch();
    renderShell();
    await pasteAnywhere("hello");
    const card = landing() as HTMLElement;
    expect(alertText(card)).toContain(en.errors.codes.unrecognized);
    // The error is about the paste, so the box does not offer the address's link.
    expect(pasteBox(card).value).toBe("");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await answer("FIXTURE");
    noViewer();
  });
});

describe("Shell errors on the landing card", () => {
  const onCard = () => alertText(landing() as HTMLElement);

  it.each([
    "empty",
    "unrecognized",
    "urlOnly",
    "decompress",
    "invalid",
    "unsupportedPlayers",
    "tooLarge",
  ] as const)("says in one sentence that a log is refused as %s", async (code) => {
    stubFetch();
    renderShell();
    await submitText(`THROW:${code}`);
    expect(onCard()).toBe(en.errors.codes[code]);
    expect(pasteBox().value).toBe(`THROW:${code}`);
    expect(screen.queryByRole("dialog")).toBeNull();
    noViewer();
  });

  it("reports text that is not a log", async () => {
    stubFetch();
    renderShell();
    await pasteAnywhere("hello");
    expect(onCard()).toBe("This is not a game log the viewer can read.");
  });

  it("reports an empty file", async () => {
    stubFetch();
    renderShell();
    await chooseFile(new File([""], "empty.json"));
    expect(onCard()).toBe("The file or the pasted text is empty.");
  });

  it("refuses a file larger than any log without reading it", async () => {
    stubFetch();
    renderShell();
    const file = new File(["x"], "huge.json");
    Object.defineProperty(file, "size", { value: MAX_LOG_SIZE + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    await chooseFile(file);
    expect(onCard()).toBe("This is too large to be a game log.");
    expect(read).not.toHaveBeenCalled();
  });

  it("reports a file that cannot be read", async () => {
    stubFetch();
    renderShell();
    const file = new File(["x"], "gone.json");
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("gone"));
    await chooseFile(file);
    expect(onCard()).toBe("The file could not be read.");
  });

  it("reports a sample that cannot be downloaded", async () => {
    stubFetch(() => true);
    renderShell();
    await click(screen.getByRole("button", { name: "4-player" }));
    expect(onCard()).toBe("The log could not be downloaded; check your connection.");
  });

  it("reports a Tenhou log that cannot be downloaded, with a link to its data", async () => {
    stubFetch(() => true);
    renderShell();
    await submitText(`https://tenhou.net/0/?log=${TENHOU_ID}`);
    expect(onCard()).toContain(
      "The log could not be downloaded from tenhou.net; check the link and your connection.",
    );
    const link = within(landing() as HTMLElement).getByRole("link", {
      name: "Log data on tenhou.net (opens in a new tab)",
    }) as HTMLAnchorElement;
    expect(link.href).toBe(TENHOU_DATA_URL);
    expect(link.target).toBe("_blank");
  });

  it("reports a Tenhou download that is not a log as a failed download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>no such log</html>")),
    );
    renderShell();
    await submitText(TENHOU_ID);
    expect(onCard()).toContain(en.errors.codes.tenhouFetchFailed);
  });

  it("does not try to download another site's link", async () => {
    const fetchMock = stubFetch();
    renderShell();
    await submitText("https://example.com/log/123");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCard()).toBe(
      "Only Tenhou links can be downloaded; for another site, open or paste the log data itself.",
    );
  });

  it.each([
    SOUL_LINK,
    "mahjongsoul.game.yo-star.com/?paipu=190428-0f1a2b3c_a1",
    "https://game.maj-soul.com/1/?paipu=190428-0f1a2b3c_a1",
    "https://game.maj-soul.net/1/?paipu=190428-0f1a2b3c_a1",
  ])("points a Mahjong Soul link (%s) at the converter", async (text) => {
    const fetchMock = stubFetch();
    renderShell();
    await submitText(text);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCard()).toContain(
      "Mahjong Soul links cannot be opened; convert the log to tenhou.net/6 JSON with tensoul first.",
    );
    const link = within(landing() as HTMLElement).getByRole("link", {
      name: "tensoul on GitHub (opens in a new tab)",
    }) as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/Equim-chan/tensoul");
  });

  it("reports a bug in a parser as something that went wrong", async () => {
    stubFetch();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShell();
    await submitText("CRASH");
    expect(onCard()).toBe("Something went wrong while opening the log.");
    expect(logged).toHaveBeenCalled();
  });

  it("clears the error when the next load starts", async () => {
    const { answer } = stubSlowFetch();
    renderShell();
    await pasteAnywhere("hello");
    expect(within(landing() as HTMLElement).queryByRole("alert")).toBeTruthy();
    await click(screen.getByRole("button", { name: "4-player" }));
    expect(within(landing() as HTMLElement).queryByRole("alert")).toBeNull();
    await answer("FIXTURE");
  });
});

describe("Shell while a game is shown", () => {
  it("loads a log pasted anywhere and pushes its first entry", async () => {
    await renderWithGame();
    await pasteAnywhere(`https://tenhou.net/0/?log=${TENHOU_ID}&tw=2&ts=1`);
    expect(output("origin")).toBe(JSON.stringify({ kind: "tenhou", logId: TENHOU_ID }));
    expect(output("start")).toBe(JSON.stringify({ round: 1, step: 0, pov: 2 }));
    expect(output("entry")).toBe("true");
  });

  it("loads a dropped file", async () => {
    await renderWithGame();
    await drag("drop", { files: [new File(["SANMA"], "sanma.json")] });
    expect(output("players")).toBe("3");
    expect(output("origin")).toBe("null");
  });

  it("shows a download over the game as a bar, and the viewer reads it out", async () => {
    await renderWithGame();
    const bar = () => document.querySelector("[data-download]");
    expect(output("notice")).toBe("");
    const { answer } = stubSlowFetch();
    await pasteAnywhere(TENHOU_ID);
    expect(bar()?.getAttribute("aria-hidden")).toBe("true");
    expect(output("notice")).toBe("Downloading the log…");
    // The viewer's live region is the page's only one.
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await answer("SANMA");
    expect(bar()).toBeNull();
    expect(output("notice")).toBe("");
    expect(output("players")).toBe("3");
  });

  it("reports a failed load in the Open dialog and keeps the game", async () => {
    await renderWithGame();
    await pasteAnywhere("hello");
    expect(alertText(openDialog())).toBe(en.errors.codes.unrecognized);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(output("players")).toBe("4");
  });

  it("forgets the error when the Open dialog closes", async () => {
    await renderWithGame();
    await pasteAnywhere(SOUL_LINK);
    await click(within(openDialog()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await click(screen.getByRole("button", { name: "Menu: open" }));
    expect(within(openDialog()).queryByRole("alert")).toBeNull();
  });

  it("opens another log from the Open dialog and moves the focus to the stage", async () => {
    await renderWithGame();
    const opener = screen.getByRole("button", { name: "Menu: open" });
    opener.focus();
    await click(opener);
    await click(within(openDialog()).getByRole("button", { name: "3-player" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(output("players")).toBe("3");
    expect(output("entry")).toBe("true");
    expect(document.activeElement).toBe(await viewer());
  });

  it.each([
    ["a file", (dialog: HTMLElement) => chooseFile(new File(["SANMA"], "s.json"), dialog)],
    ["pasted text", (dialog: HTMLElement) => submitText("SANMA", dialog)],
  ])("opens %s from the Open dialog", async (_name, open) => {
    await renderWithGame();
    await click(screen.getByRole("button", { name: "Menu: open" }));
    await open(openDialog());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(output("players")).toBe("3");
  });

  it("keeps the Open dialog and what was typed when its load fails", async () => {
    await renderWithGame();
    const opener = screen.getByRole("button", { name: "Menu: open" });
    opener.focus();
    await click(opener);
    await submitText(SOUL_LINK, openDialog());
    expect(alertText(openDialog())).toContain(en.errors.codes.mahjongSoul);
    expect(pasteBox(openDialog()).value).toBe(SOUL_LINK);
    expect(output("players")).toBe("4");
    await submitText("SANMA", openDialog());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(output("players")).toBe("3");
  });

  it("shows a download started from the Open dialog in the dialog only", async () => {
    await renderWithGame();
    await click(screen.getByRole("button", { name: "Menu: open" }));
    const { answer } = stubSlowFetch();
    await click(within(openDialog()).getByRole("button", { name: "3-player" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(within(openDialog()).getByRole("status").textContent).toBe("Downloading the log…");
    expect(output("notice")).toBe("");
    await answer("SANMA");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the settings and the controls, and gives the focus back when they close", async () => {
    await renderWithGame();
    for (const [menu, name] of [
      ["Menu: settings", "Settings"],
      ["Menu: controls", "Controls"],
    ] as const) {
      const opener = screen.getByRole("button", { name: menu });
      opener.focus();
      await click(opener);
      const dialog = screen.getByRole("dialog", { name });
      await click(within(dialog).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    }
  });

  it("closes the dialog that is open when another game arrives", async () => {
    await renderWithGame();
    const opener = screen.getByRole("button", { name: "Menu: settings" });
    opener.focus();
    await click(opener);
    await drag("drop", { files: [new File(["SANMA"], "sanma.json")] });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(output("players")).toBe("3");
    expect(document.activeElement).toBe(await viewer());
  });
});

describe("Shell history", () => {
  it("reopens another sample that Back returns to, at the entry's position", async () => {
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    const fetchMock = stubFetch();
    renderShell();
    await viewer();
    window.history.replaceState(
      { v: 1, round: 1, step: 4, pov: 2 },
      "",
      "/?sample=sanma&round=2&step=5&pov=3",
    );
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(output("players")).toBe("3");
    expect(output("start")).toBe(JSON.stringify({ round: 1, step: 4, pov: 2 }));
    expect(output("entry")).toBe("false");
  });

  it("leaves entries of the same game to the viewer", async () => {
    window.history.replaceState(null, "", "/?sample=tenhou-json");
    const fetchMock = stubFetch();
    renderShell();
    await viewer();
    window.history.replaceState({ v: 1, round: 0, step: 4, pov: 0 }, "", "/?sample=tenhou-json");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
