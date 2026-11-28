// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Locale } from "../../i18n/locales";
import { writeStorage } from "../../storage";
import type { PanelActionsProps } from "../viewer/types";
import { PanelActions } from "./PanelActions";

function renderActions(patch: Partial<PanelActionsProps> = {}, locale?: Locale) {
  if (locale) {
    writeStorage("locale", locale);
  }
  const props: PanelActionsProps = {
    linkable: true,
    onOpenLog: vi.fn(),
    onCopyLink: vi.fn(),
    onSettings: vi.fn(),
    onHelp: vi.fn(),
    ...patch,
  };
  render(
    <I18nProvider>
      <PanelActions {...props} />
    </I18nProvider>,
  );
  return props;
}

const group = (name = "Menu") => screen.getByRole("group", { name });
const buttons = (name?: string) => within(group(name)).getAllByRole("button");
const labels = (name?: string) => buttons(name).map((button) => button.textContent);

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("PanelActions", () => {
  it("is a named group of the app's actions, in order", () => {
    renderActions();
    expect(labels()).toEqual([
      "Open another log",
      "Copy link to this moment",
      "Settings",
      "Controls",
    ]);
  });

  it("lists Copy link only for a log that has an address", () => {
    renderActions({ linkable: false });
    expect(labels()).toEqual(["Open another log", "Settings", "Controls"]);
  });

  it("is plain buttons that are always there, not a menu to open", () => {
    renderActions();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    for (const button of buttons()) {
      expect(button.getAttribute("type")).toBe("button");
      expect(button.hasAttribute("tabindex")).toBe(false);
      expect(button.hasAttribute("aria-haspopup")).toBe(false);
      expect(button.hasAttribute("aria-expanded")).toBe(false);
      // The words are the name: nothing is drawn as an icon alone.
      expect(button.hasAttribute("aria-label")).toBe(false);
    }
  });

  it("runs the pressed action, once, and no other", () => {
    const props = renderActions();
    const actions = [
      ["Open another log", props.onOpenLog],
      ["Copy link to this moment", props.onCopyLink],
      ["Settings", props.onSettings],
      ["Controls", props.onHelp],
    ] as const;
    for (const [name, action] of actions) {
      fireEvent.click(within(group()).getByRole("button", { name }));
      expect(action, name).toHaveBeenCalledTimes(1);
    }
    for (const [name, action] of actions) {
      expect(action, name).toHaveBeenCalledTimes(1);
    }
  });

  it("words the actions in Korean and Japanese", () => {
    renderActions({}, "ko");
    expect(labels("메뉴")).toEqual(["다른 패보 열기", "이 장면 링크 복사", "설정", "조작 방법"]);
    cleanup();

    renderActions({}, "ja");
    expect(labels("メニュー")).toEqual([
      "別の牌譜を開く",
      "この場面へのリンクをコピー",
      "設定",
      "操作方法",
    ]);
  });
});
