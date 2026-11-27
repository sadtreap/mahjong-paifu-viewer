// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { Landing, type LandingProps } from "./Landing";

function renderLanding(overrides: Partial<LandingProps> = {}) {
  const props: LandingProps = {
    arriving: false,
    onCancel: vi.fn(),
    loading: null,
    error: null,
    onFile: vi.fn(),
    onText: vi.fn(),
    onSample: vi.fn(),
    ...overrides,
  };
  const { rerender } = render(
    <I18nProvider>
      <Landing {...props} />
    </I18nProvider>,
  );
  const update = (next: Partial<LandingProps>) =>
    rerender(
      <I18nProvider>
        <Landing {...props} {...next} />
      </I18nProvider>,
    );
  return { ...props, update };
}

const card = () => screen.getByRole("region", { name: "Mahjong Paifu Viewer" });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Landing", () => {
  it("is one card in the page's main landmark, named by the app", () => {
    renderLanding();
    expect(screen.getByRole("main").contains(card())).toBe(true);
    expect(within(card()).getByRole("heading", { level: 1 }).textContent).toBe(
      "Mahjong Paifu Viewer",
    );
  });

  it("says in one sentence what the app is and that files stay in the browser", () => {
    renderLanding();
    const tagline = within(card()).getByText(/^Replay Tenhou and mjai game logs/);
    expect(tagline.textContent).toMatch(/your files stay in your browser\.$/);
    expect(tagline.textContent?.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it("holds the load form", () => {
    const props = renderLanding();
    fireEvent.change(within(card()).getByRole("textbox"), { target: { value: "FIXTURE" } });
    fireEvent.click(within(card()).getByRole("button", { name: "Open" }));
    expect(props.onText).toHaveBeenCalledWith("FIXTURE");
    fireEvent.click(within(card()).getByRole("button", { name: "3-player" }));
    expect(props.onSample).toHaveBeenCalledWith("sanma");
  });

  it("switches the language", async () => {
    renderLanding();
    const picker = within(card()).getByRole("combobox", { name: "Language" });
    expect(within(picker).getAllByRole("option")).toHaveLength(3);
    await act(async () => {
      fireEvent.change(picker, { target: { value: "ja" } });
    });
    expect(screen.getByRole("region", { name: "麻雀牌譜ビューア" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ファイルを選択" })).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "言語" }), { target: { value: "ko" } });
    });
    expect(screen.getByRole("button", { name: "파일 선택" })).toBeTruthy();
  });

  it("shows the error of a failed load on the card", () => {
    renderLanding({ error: { code: "fetchFailed", logId: null } });
    expect(within(card()).getByRole("alert").textContent).toBe(
      "The log could not be downloaded; check your connection.",
    );
  });

  it("shows only its name, the download status and Cancel while the address's log is on its way", () => {
    const props = renderLanding({ arriving: true, loading: "download" });
    expect(within(card()).getByRole("heading", { level: 1 })).toBeTruthy();
    expect(within(card()).getByRole("status").textContent).toBe("Downloading the log…");
    expect(within(card()).queryByRole("textbox")).toBeNull();
    expect(within(card()).queryByRole("combobox")).toBeNull();
    expect(within(card()).queryByText(/^Replay Tenhou/)).toBeNull();
    const buttons = within(card()).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Cancel"]);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("hands the focus to the card when Cancel goes away with the status", () => {
    const { update } = renderLanding({ arriving: true, loading: "download" });
    within(card()).getByRole("button", { name: "Cancel" }).focus();
    update({ arriving: false, loading: null });
    expect(document.activeElement).toBe(card());
    // The paste box does not take it: on a phone that would raise the keyboard unasked.
    expect(within(card()).getByRole("textbox")).not.toBe(document.activeElement);
  });

  it("leaves the focus alone when the status goes away without having had it", () => {
    const { update } = renderLanding({ arriving: true, loading: "download" });
    update({ arriving: false, loading: null, error: { code: "fetchFailed", logId: null } });
    expect(document.activeElement).toBe(document.body);
  });
});
