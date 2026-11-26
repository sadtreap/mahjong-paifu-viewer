// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { Welcome, type WelcomeCardProps } from "./Welcome";

function renderWelcome(overrides: Partial<WelcomeCardProps> = {}) {
  const props: WelcomeCardProps = {
    loading: false,
    error: null,
    onOpenFile: vi.fn(),
    onPaste: vi.fn(),
    onSample: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <Welcome {...props} />
    </I18nProvider>,
  );
  return props;
}

function card() {
  return screen.getByRole("region", { name: "Mahjong Paifu Viewer" });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Welcome", () => {
  it("is a labelled card that stage gestures ignore", () => {
    renderWelcome();
    expect(card().getAttribute("data-gesture")).toBe("ignore");
    expect(within(card()).getByRole("heading", { level: 1 }).textContent).toBe(
      "Mahjong Paifu Viewer",
    );
    expect(within(card()).getByText(/Drop a log file here/)).toBeTruthy();
  });

  it("opens a picked file", () => {
    const props = renderWelcome();
    const input = within(card()).getByLabelText("Open a file…") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("");
    const file = new File(["FIXTURE"], "game.json");
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onOpenFile).toHaveBeenCalledWith(file);
  });

  it("asks for the paste dialog and opens the samples", () => {
    const props = renderWelcome();
    fireEvent.click(within(card()).getByRole("button", { name: "Paste a link or log" }));
    expect(props.onPaste).toHaveBeenCalledTimes(1);
    const samples = within(card()).getByRole("group", { name: "Samples:" });
    fireEvent.click(within(samples).getByRole("button", { name: "4-player" }));
    fireEvent.click(within(samples).getByRole("button", { name: "3-player" }));
    expect(props.onSample).toHaveBeenNthCalledWith(1, "tenhou-json");
    expect(props.onSample).toHaveBeenNthCalledWith(2, "sanma");
  });

  it("is dismissed by Explore the sample and by Esc", () => {
    const props = renderWelcome();
    fireEvent.click(within(card()).getByRole("button", { name: "Explore the sample" }));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onDismiss).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "Escape", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(props.onDismiss).toHaveBeenCalledTimes(2);
  });

  it("ignores Esc pressed inside an open dialog", () => {
    const props = renderWelcome();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const field = document.createElement("textarea");
    dialog.append(field);
    document.body.append(dialog);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(props.onDismiss).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("cannot be dismissed when there is no sample under it", () => {
    const props = renderWelcome({ canExplore: false });
    expect(within(card()).queryByRole("button", { name: "Explore the sample" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onDismiss).not.toHaveBeenCalled();
  });

  it("shows the loading state and an error, and disables the actions while loading", () => {
    renderWelcome({ loading: true, error: <p role="alert">Broken</p> });
    expect(within(card()).getByRole("status").textContent).toBe("Loading the log…");
    expect(within(card()).getByRole("alert").textContent).toBe("Broken");
    expect(card().getAttribute("aria-busy")).toBe("true");
    expect(
      (within(card()).getByRole("button", { name: "Paste a link or log" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect((within(card()).getByLabelText("Open a file…") as HTMLInputElement).disabled).toBe(true);
  });

  it("switches the language", async () => {
    renderWelcome();
    await act(async () => {
      fireEvent.change(within(card()).getByLabelText("Language"), { target: { value: "ja" } });
    });
    expect(screen.getByRole("button", { name: "サンプルを見る" })).toBeTruthy();
  });

  it("lists the supported formats", () => {
    renderWelcome();
    const notes = within(card()).getByText("Supported formats");
    expect(notes.tagName).toBe("SUMMARY");
  });
});
