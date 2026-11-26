// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { OpenDialog, type OpenDialogProps } from "./OpenDialog";
import { PasteDialog } from "./PasteDialog";

afterEach(cleanup);

describe("PasteDialog", () => {
  function renderPaste(loading = false) {
    const onText = vi.fn();
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <PasteDialog open onClose={onClose} loading={loading} onText={onText} />
      </I18nProvider>,
    );
    return { onText, onClose, dialog: screen.getByRole("dialog", { name: /Paste a Tenhou link/ }) };
  }

  it("loads the pasted text", async () => {
    const { onText, dialog } = renderPaste();
    const load = within(dialog).getByRole("button", { name: "Load" }) as HTMLButtonElement;
    expect(load.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Paste the log data or a Tenhou link"), {
      target: { value: "FIXTURE" },
    });
    expect(load.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(load);
    });
    expect(onText).toHaveBeenCalledWith("FIXTURE");
  });

  it("keeps Load off while a log is loading", () => {
    const { dialog } = renderPaste(true);
    fireEvent.change(within(dialog).getByLabelText("Paste the log data or a Tenhou link"), {
      target: { value: "FIXTURE" },
    });
    expect(
      (within(dialog).getByRole("button", { name: "Load" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("closes with Esc and the close button", () => {
    const { onClose, dialog } = renderPaste();
    fireEvent.keyDown(within(dialog).getByRole("textbox"), { key: "Escape" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("OpenDialog", () => {
  function renderOpen(overrides: Partial<OpenDialogProps> = {}) {
    const props: OpenDialogProps = {
      open: true,
      onClose: vi.fn(),
      loading: false,
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
    return { props, dialog: screen.getByRole("dialog", { name: "Open a game log" }) };
  }

  it("offers a file, pasted text and the samples, and says drop and paste work anywhere", async () => {
    const { props, dialog } = renderOpen();
    expect(within(dialog).getByText(/drop a log file anywhere on the page/)).toBeTruthy();
    const file = new File(["x"], "x.xml");
    fireEvent.change(within(dialog).getByLabelText("Open a file…"), { target: { files: [file] } });
    expect(props.onFile).toHaveBeenCalledWith(file);
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "FIXTURE" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Load" }));
    });
    expect(props.onText).toHaveBeenCalledWith("FIXTURE");
    fireEvent.click(within(dialog).getByRole("button", { name: "3-player" }));
    expect(props.onSample).toHaveBeenCalledWith("sanma");
  });

  it("shows an error and the loading state", () => {
    const { dialog } = renderOpen({ loading: true, error: <p role="alert">Nope</p> });
    expect(within(dialog).getByRole("alert").textContent).toBe("Nope");
    expect(within(dialog).getByRole("status").textContent).toBe("Loading the log…");
  });

  it("is not shown while closed", () => {
    render(
      <I18nProvider>
        <OpenDialog
          open={false}
          onClose={vi.fn()}
          loading={false}
          error={null}
          onFile={vi.fn()}
          onText={vi.fn()}
          onSample={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
