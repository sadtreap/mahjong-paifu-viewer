// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { MoreMenuProps } from "../viewer/types";
import { MoreMenu } from "./MoreMenu";

function props(patch: Partial<MoreMenuProps> = {}): MoreMenuProps {
  return {
    open: true,
    onClose: vi.fn(),
    linkable: true,
    speed: 1,
    showAllHands: true,
    view: "3d",
    onOpenLog: vi.fn(),
    onCopyLink: vi.fn(),
    onSpeed: vi.fn(),
    onNav: vi.fn(),
    onToggleHands: vi.fn(),
    onToggleView: vi.fn(),
    onSettings: vi.fn(),
    onHelp: vi.fn(),
    anchorRef: createRef<HTMLElement>(),
    ...patch,
  };
}

function renderMenu(patch: Partial<MoreMenuProps> = {}) {
  const anchorRef = createRef<HTMLButtonElement>();
  const all = props({ anchorRef, ...patch });
  render(
    <I18nProvider>
      <button type="button" ref={anchorRef} aria-haspopup="menu">
        More
      </button>
      <p>outside</p>
      <MoreMenu {...all} />
    </I18nProvider>,
  );
  return { ...all, anchor: () => anchorRef.current as HTMLButtonElement };
}

const item = (name: string | RegExp) => screen.getByRole("menuitem", { name });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("MoreMenu", () => {
  it("renders nothing while closed", () => {
    renderMenu({ open: false });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lists the phone toolbar's extra actions and focuses the first", () => {
    renderMenu();
    expect(screen.getByRole("menu", { name: "More" })).toBeTruthy();
    for (const name of [
      "Open another log",
      "Copy link to this moment",
      "Previous call, riichi or kita",
      "Next call, riichi or kita",
      "Settings and language",
      "Keyboard, mouse and touch help",
    ]) {
      expect(item(name)).toBeTruthy();
    }
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Show all hands" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("menuitemcheckbox", { name: "3D table" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitemradio", { name: "Autoplay speed: 1×" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(document.activeElement).toBe(item("Open another log"));
  });

  it("runs a choice, then closes and gives the focus back to its button", () => {
    const { onNav, onClose, onSpeed, onToggleView, anchor } = renderMenu({ view: "flat" });
    fireEvent.click(item("Next call, riichi or kita"));
    expect(onNav).toHaveBeenCalledWith({ kind: "keyMoment", dir: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(anchor());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Autoplay speed: 4×" }));
    expect(onSpeed).toHaveBeenCalledWith(4);
    const view = screen.getByRole("menuitemcheckbox", { name: "3D table" });
    expect(view.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(view);
    expect(onToggleView).toHaveBeenCalledTimes(1);
  });

  it("disables Copy link for local logs and says why", () => {
    const { onCopyLink, onClose } = renderMenu({ linkable: false });
    const copy = item("Copy link to this moment");
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    expect(copy.title).toBe("Links work only for the sample logs and Tenhou logs");
    fireEvent.click(copy);
    expect(onCopyLink).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves with the arrow keys and closes on Esc without the viewer seeing the key", () => {
    const { onClose, anchor } = renderMenu();
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Copy link to this moment"));
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Keyboard, mouse and touch help"));
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(item("Open another log"));
    const allowed = fireEvent.keyDown(menu, { key: "Escape" });
    expect(allowed).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(anchor());
  });

  it("closes on a press outside, which goes no further, but not on its own button", () => {
    const { onClose, anchor } = renderMenu();
    fireEvent.pointerDown(anchor());
    expect(onClose).not.toHaveBeenCalled();
    const outside = screen.getByText("outside");
    const reached = vi.fn();
    outside.addEventListener("pointerdown", reached);
    act(() => {
      fireEvent.pointerDown(outside);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(reached).not.toHaveBeenCalled();
  });
});
