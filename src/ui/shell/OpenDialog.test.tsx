// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { OpenDialog, type OpenDialogProps } from "./OpenDialog";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** Makes the page answer media queries the way a phone does: only the touch query matches. */
function stubTouchDevice() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(hover: none) and (pointer: coarse)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderOpen(overrides: Partial<OpenDialogProps> = {}) {
  const props: OpenDialogProps = {
    open: true,
    onClose: vi.fn(),
    loading: null,
    error: null,
    onFile: vi.fn(),
    onText: vi.fn(),
    onSample: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <OpenDialog {...props} />
    </I18nProvider>,
  );
  return props;
}

const dialog = () => screen.getByRole("dialog", { name: "Open a log" });

describe("OpenDialog", () => {
  it("holds the load form: a file, pasted text and the samples", () => {
    const props = renderOpen();
    const file = new File(["x"], "x.xml");
    fireEvent.change(dialog().querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });
    expect(props.onFile).toHaveBeenCalledWith(file);
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: "FIXTURE" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Open" }));
    expect(props.onText).toHaveBeenCalledWith("FIXTURE");
    fireEvent.click(within(dialog()).getByRole("button", { name: "3-player" }));
    expect(props.onSample).toHaveBeenCalledWith("sanma");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes with Esc from the paste box and with the close button", () => {
    const props = renderOpen();
    fireEvent.keyDown(within(dialog()).getByRole("textbox"), { key: "Escape" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the error and the download status of the load form", () => {
    renderOpen({ loading: "download", error: { code: "mahjongSoul", logId: null } });
    expect(within(dialog()).getByRole("alert").textContent).toContain("Mahjong Soul links");
    expect(within(dialog()).getByRole("status").textContent).toBe("Downloading the log…");
  });

  it("gives the paste box the focus when it opens", () => {
    renderOpen();
    expect(document.activeElement).toBe(within(dialog()).getByRole("textbox"));
  });

  it("leaves the focus off the paste box on a touch device, so no keyboard covers the form", () => {
    stubTouchDevice();
    renderOpen();
    expect(document.activeElement).not.toBe(within(dialog()).getByRole("textbox"));
  });

  it("is not shown while closed", () => {
    renderOpen({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
