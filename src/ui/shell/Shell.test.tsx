// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game } from "../__fixtures__/game";
import { SettingsProvider } from "../settings/SettingsProvider";
import { useDialogs } from "../settings/useSettings";
import { Shell, type ShellViewerProps } from "./Shell";

vi.mock("../../formats/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../formats/index")>();
  return {
    ...actual,
    loadLog: vi.fn(async (input: string | ArrayBuffer) => {
      const text = typeof input === "string" ? input : new TextDecoder().decode(input);
      if (text === "FIXTURE") {
        return game;
      }
      return text === "SANMA" ? sanmaCrossFormatGame() : actual.loadLog(input);
    }),
  };
});

const TENHOU_ID = "2000010100gm-0089-0000-0123abcd";

/** The viewer's stand-in: shows what the shell passes and offers the calls the real one makes. */
function StubViewer(props: ShellViewerProps) {
  const { openDialog } = useDialogs();
  return (
    <section ref={props.focusRef} tabIndex={-1} aria-label="Stub viewer" data-scene="player">
      <output data-testid="players">{props.game.playerCount}</output>
      <output data-testid="start">{JSON.stringify(props.start)}</output>
      <output data-testid="origin">{JSON.stringify(props.origin)}</output>
      <output data-testid="entry">{String(props.newEntry)}</output>
      <button type="button" onClick={props.onDismissWelcome}>
        Step
      </button>
      <button type="button" onClick={() => openDialog("open")}>
        Open
      </button>
      <button type="button" onClick={() => openDialog("settings")}>
        Settings
      </button>
      <button type="button" onClick={() => openDialog("help")}>
        Help
      </button>
      {props.welcome}
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

function renderShell(welcomeSample?: "tenhou-json" | null) {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <Shell
          renderViewer={(props) => <StubViewer {...props} />}
          {...(welcomeSample === undefined ? {} : { welcomeSample })}
        />
      </SettingsProvider>
    </I18nProvider>,
  );
}

const welcome = () => screen.queryByRole("region", { name: "Mahjong Paifu Viewer" });
const viewer = () => screen.findByRole("region", { name: "Stub viewer" });
const output = (id: string) => screen.getByTestId(id).textContent;

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
  window.history.replaceState(null, "", "/");
});

describe("Shell on a first visit", () => {
  it("opens the four-player sample under the welcome card with a bare address", async () => {
    const fetchMock = stubFetch();
    renderShell();
    await viewer();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(/samples\/ranked_game\.json$/),
    ]);
    expect(
      within(await viewer()).getByRole("region", { name: "Mahjong Paifu Viewer" }),
    ).toBeTruthy();
    expect(output("origin")).toBe("null");
    expect(output("entry")).toBe("false");
  });

  it("drops the card on the first table step, and the sample becomes linkable", async () => {
    stubFetch();
    renderShell();
    await viewer();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Step" }));
    });
    expect(welcome()).toBeNull();
    expect(output("origin")).toBe(JSON.stringify({ kind: "sample", id: "tenhou-json" }));
  });

  it("drops the card on Explore the sample, moving the focus to the stage", async () => {
    stubFetch();
    renderShell();
    await viewer();
    const explore = screen.getByRole("button", { name: "Explore the sample" });
    explore.focus();
    await act(async () => {
      fireEvent.click(explore);
    });
    expect(welcome()).toBeNull();
    expect(document.activeElement).toBe(await viewer());
  });

  it("shows the card over an empty table when the sample cannot load", async () => {
    stubFetch(() => true);
    renderShell();
    await settle();
    const card = welcome();
    expect(card).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Stub viewer" })).toBeNull();
    expect(within(card as HTMLElement).getByRole("alert").textContent).toContain(
      "could not be downloaded",
    );
    expect(screen.queryByRole("button", { name: "Explore the sample" })).toBeNull();
  });

  it("can start without a sample", async () => {
    const fetchMock = stubFetch();
    renderShell(null);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(welcome()).toBeTruthy();
  });
});

describe("Shell loading", () => {
  it("opens the sample an address names at its 1-based round, step and seat", async () => {
    window.history.replaceState(null, "", "/?sample=sanma&round=2&step=3&pov=2");
    const fetchMock = stubFetch();
    renderShell();
    await viewer();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(/samples\/sanma\.json$/),
    ]);
    expect(welcome()).toBeNull();
    expect(output("players")).toBe("3");
    expect(output("start")).toBe(JSON.stringify({ round: 1, step: 2, pov: 1 }));
    expect(output("origin")).toBe(JSON.stringify({ kind: "sample", id: "sanma" }));
  });

  it("opens the Tenhou log an address names", async () => {
    window.history.replaceState(null, "", `/?tenhou=${TENHOU_ID}&round=3`);
    const fetchMock = stubFetch();
    renderShell();
    await viewer();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `https://tenhou.net/0/log/?${TENHOU_ID}`,
    ]);
    expect(output("start")).toBe(JSON.stringify({ round: 2, step: 0, pov: null }));
    expect(output("origin")).toBe(JSON.stringify({ kind: "tenhou", logId: TENHOU_ID }));
  });

  it("loads a log pasted anywhere, closing the card, and pushes its first entry", async () => {
    stubFetch();
    renderShell();
    await viewer();
    await pasteAnywhere(`https://tenhou.net/0/?log=${TENHOU_ID}&tw=2&ts=1`);
    await settle();
    expect(welcome()).toBeNull();
    expect(output("origin")).toBe(JSON.stringify({ kind: "tenhou", logId: TENHOU_ID }));
    expect(output("start")).toBe(JSON.stringify({ round: 1, step: 0, pov: 2 }));
    expect(output("entry")).toBe("true");
  });

  it("keeps the window drop working while a game is shown", async () => {
    stubFetch();
    renderShell();
    await viewer();
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: fakeTransfer({ files: [new File(["SANMA"], "sanma.json")] }),
    });
    await act(async () => {
      document.body.dispatchEvent(drop);
    });
    await settle();
    expect(output("players")).toBe("3");
    expect(output("origin")).toBe("null");
  });

  it("opens a file from the card and hands the focus to the stage", async () => {
    stubFetch();
    renderShell();
    await viewer();
    const input = screen.getByLabelText("Open a file…") as HTMLInputElement;
    input.focus();
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["SANMA"], "s.json")] } });
    });
    await settle();
    expect(welcome()).toBeNull();
    expect(output("players")).toBe("3");
    expect(document.activeElement).toBe(await viewer());
  });

  it("pastes through the card's paste dialog", async () => {
    stubFetch();
    renderShell();
    await viewer();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paste a link or log" }));
    });
    const dialog = screen.getByRole("dialog", { name: "Paste a Tenhou link or log data" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "SANMA" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Load" }));
    });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(output("players")).toBe("3");
    expect(welcome()).toBeNull();
  });

  it("shows the sample already on the table instead of reloading it, and loads the other", async () => {
    const fetchMock = stubFetch();
    renderShell();
    await viewer();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "4-player" }));
    });
    expect(welcome()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads the three-player sample from the card", async () => {
    stubFetch();
    renderShell();
    await viewer();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "3-player" }));
    });
    await settle();
    expect(output("players")).toBe("3");
    expect(output("origin")).toBe(JSON.stringify({ kind: "sample", id: "sanma" }));
    expect(welcome()).toBeNull();
  });

  it("reports a failed load while viewing in the Open dialog", async () => {
    stubFetch();
    renderShell();
    await viewer();
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    await pasteAnywhere("hello");
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Open a game log" });
    expect(within(dialog).getByRole("alert").textContent).toContain("not a log format");
    expect(output("players")).toBe("4");
  });

  it("opens a sample from the toolbar's Open dialog", async () => {
    stubFetch();
    renderShell();
    await viewer();
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    const open = screen.getByRole("button", { name: "Open" });
    open.focus();
    await act(async () => {
      fireEvent.click(open);
    });
    const dialog = screen.getByRole("dialog", { name: "Open a game log" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "3-player" }));
    });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(output("players")).toBe("3");
    expect(document.activeElement).toBe(await viewer());
  });

  it("opens the settings and help dialogs on request", async () => {
    stubFetch();
    renderShell();
    await viewer();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    });
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Help" }));
    });
    expect(screen.getByRole("dialog", { name: "Controls" })).toBeTruthy();
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
