// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LoadForm, type LoadFormProps } from "./LoadForm";

function renderForm(overrides: Partial<LoadFormProps> = {}) {
  const props: LoadFormProps = {
    loading: null,
    error: null,
    onFile: vi.fn(),
    onText: vi.fn(),
    onSample: vi.fn(),
    ...overrides,
  };
  const { container, rerender } = render(
    <I18nProvider>
      <LoadForm {...props} />
    </I18nProvider>,
  );
  const update = (next: Partial<LoadFormProps>) =>
    rerender(
      <I18nProvider>
        <LoadForm {...props} {...next} />
      </I18nProvider>,
    );
  return { props, container, update };
}

const formats = () => screen.getByText("Reads tenhou.net/6 JSON, mjai JSONL and Tenhou mjlog XML.");

const box = () =>
  screen.getByRole("textbox", { name: "Link or log to open" }) as HTMLTextAreaElement;

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("LoadForm", () => {
  it("has a paste box that says what it takes, with the formats under it", () => {
    renderForm();
    expect(box().placeholder).toBe("Tenhou link, log ID or log text");
    expect(box().getAttribute("aria-describedby")).toBe(formats().id);
    expect(screen.getByRole("button", { name: "Open" }).getAttribute("data-variant")).toBe(
      "primary",
    );
  });

  it("keeps each format's name on one line", () => {
    renderForm();
    for (const name of [
      "tenhou.net/6\u00a0JSON",
      "mjai\u00a0JSONL",
      "Tenhou\u00a0mjlog\u00a0XML",
    ]) {
      expect(formats().textContent).toContain(name);
    }
  });

  it("starts the box with the text it is given, and only when it appears", () => {
    const { update } = renderForm({ initialText: "https://tenhou.net/0/?log=x" });
    expect(box().value).toBe("https://tenhou.net/0/?log=x");
    update({ initialText: undefined });
    expect(box().value).toBe("https://tenhou.net/0/?log=x");
    expect(document.activeElement).not.toBe(box());
  });

  it("offers nothing but Open, Choose a file and the samples", () => {
    renderForm();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Open",
      "Choose a file",
      "4-player",
      "3-player",
    ]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the text with the Open button", () => {
    const { props } = renderForm();
    fireEvent.change(box(), { target: { value: "FIXTURE" } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(props.onText).toHaveBeenCalledWith("FIXTURE");
  });

  it("opens the text with Enter, keeping the line breaks of a pasted log", () => {
    const { props } = renderForm();
    const log = '{"type":"start_game"}\n{"type":"end_game"}';
    fireEvent.change(box(), { target: { value: log } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(props.onText).toHaveBeenCalledWith(log);
  });

  it("leaves Shift+Enter and the Enter of an IME composition to the box", () => {
    const { props } = renderForm();
    fireEvent.change(box(), { target: { value: "FIXTURE" } });
    expect(fireEvent.keyDown(box(), { key: "Enter", shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(box(), { key: "Enter", isComposing: true })).toBe(true);
    expect(props.onText).not.toHaveBeenCalled();
  });

  it("opens nothing from an empty box and moves the focus there instead", () => {
    const { props } = renderForm();
    fireEvent.change(box(), { target: { value: "  \n " } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(props.onText).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box());
  });

  it("opens a chosen file of any extension, and the same file again", () => {
    const { props, container } = renderForm();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe("");
    expect(input.hidden).toBe(true);
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));
    expect(click).toHaveBeenCalledTimes(1);
    const file = new File(["FIXTURE"], "game.mjlog");
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe("");
  });

  it("opens the samples from one labelled group", () => {
    const { props } = renderForm();
    const samples = screen.getByRole("group", { name: "Samples" });
    fireEvent.click(within(samples).getByRole("button", { name: "4-player" }));
    fireEvent.click(within(samples).getByRole("button", { name: "3-player" }));
    expect(props.onSample).toHaveBeenNthCalledWith(1, "tenhou-json");
    expect(props.onSample).toHaveBeenNthCalledWith(2, "sanma");
  });

  it("says that dropping a file works too", () => {
    renderForm();
    expect(screen.getByText("or drop one anywhere on the page")).toBeTruthy();
  });

  it("shows a download in place of the formats, and nothing for a file being read", () => {
    const { container } = renderForm({ loading: "download" });
    expect(screen.getByRole("status").textContent).toBe("Downloading the log…");
    expect(screen.queryByText(/^Reads/)).toBeNull();
    expect(box().hasAttribute("aria-describedby")).toBe(false);
    expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    cleanup();

    const reading = renderForm({ loading: "read" });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/^Reads/)).toBeTruthy();
    expect(reading.container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
  });

  it("shows the error of the last load under the box, where it does not move the box", () => {
    renderForm({ error: { code: "invalid", logId: null } });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("The log is damaged or incomplete.");
    expect(box().compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      alert.compareDocumentPosition(formats()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("brings a new error into view, keeping the focus and the text in the box", () => {
    const scrolled: Element[] = [];
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (
      this: HTMLElement,
    ) {
      scrolled.push(this);
    });
    const { update } = renderForm();
    fireEvent.change(box(), { target: { value: "hello" } });
    box().focus();
    update({ error: { code: "unrecognized", logId: null } });
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrolled[0]?.contains(screen.getByRole("alert"))).toBe(true);
    expect(document.activeElement).toBe(box());
    expect(box().value).toBe("hello");
  });
});
