// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { en } from "../../i18n/messages/en";
import { writeStorage } from "../../storage";
import { MOUSE_HELP, SHORTCUTS, TOUCH_HELP } from "../viewer/shortcuts";
import { HelpDialog } from "./HelpDialog";
import { SettingsProvider } from "./SettingsProvider";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_NAME } from "./settings";
import { useDialogs } from "./useSettings";

function Harness() {
  const { dialog, openDialog, closeDialog } = useDialogs();
  return (
    <>
      <button type="button" onClick={() => openDialog("help")}>
        Help
      </button>
      <HelpDialog open={dialog === "help"} onClose={closeDialog} />
    </>
  );
}

function renderHelp() {
  render(
    <I18nProvider>
      <SettingsProvider>
        <Harness />
      </SettingsProvider>
    </I18nProvider>,
  );
}

async function openHelp() {
  const opener = screen.getByRole("button", { name: "Help" });
  opener.focus();
  await act(async () => {
    fireEvent.click(opener);
  });
  return { opener, dialog: screen.getByRole("dialog", { name: "Controls" }) };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("HelpDialog", () => {
  it("renders every row of the shortcut table with its keys", async () => {
    renderHelp();
    const { dialog } = await openHelp();
    const keyboard = within(dialog).getByRole("region", { name: "Keyboard" });
    const rows = within(keyboard).getAllByRole("row");
    expect(rows).toHaveLength(SHORTCUTS.length);
    SHORTCUTS.forEach((shortcut, index) => {
      const row = rows[index];
      if (!row) {
        throw new Error(`missing row ${index}`);
      }
      expect(within(row).getByRole("cell").textContent).toBe(shortcut.label(en));
      const caps = Array.from(row.querySelectorAll("kbd"), (kbd) => kbd.textContent).join(" ");
      for (const key of shortcut.keys) {
        for (const part of key === "+" ? ["+"] : key.split("+")) {
          expect(caps).toContain(part);
        }
      }
    });
  });

  it("shows Shift+→ as two keycaps", async () => {
    renderHelp();
    const { dialog } = await openHelp();
    const row = within(dialog).getByRole("row", { name: /own turn/ });
    expect(Array.from(row.querySelectorAll("kbd"), (kbd) => kbd.textContent)).toEqual([
      "Shift",
      "→",
      "Shift",
      "←",
    ]);
  });

  it("lists the mouse and touch controls and the note", async () => {
    renderHelp();
    const { dialog } = await openHelp();
    const mouse = within(dialog).getByRole("region", { name: "Mouse" });
    expect(
      within(mouse)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(MOUSE_HELP.map((line) => line(en)));
    const touch = within(dialog).getByRole("region", { name: "Touch" });
    expect(
      within(touch)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(TOUCH_HELP.map((line) => line(en)));
    expect(within(dialog).getByText(en.help.note)).toBeTruthy();
  });

  it("marks the single-key rows as off when single-key shortcuts are off", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ ...DEFAULT_SETTINGS, charKeys: false }));
    renderHelp();
    const { dialog } = await openHelp();
    expect(within(dialog).getByText(en.settings.charKeysOff)).toBeTruthy();
    const rows = within(dialog).getAllByRole("row");
    SHORTCUTS.forEach((shortcut, index) => {
      expect(rows[index]?.className !== "", shortcut.label(en)).toBe(shortcut.charKey);
    });
  });

  it("closes with Esc and gives the focus back to the opener", async () => {
    renderHelp();
    const { opener, dialog } = await openHelp();
    await act(async () => {
      fireEvent.keyDown(within(dialog).getByRole("button", { name: "Close" }), { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on a click on the backdrop but not inside", async () => {
    renderHelp();
    const { dialog } = await openHelp();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("heading", { name: "Controls" }));
    });
    expect(dialog.hasAttribute("open")).toBe(true);
    await act(async () => {
      fireEvent.click(dialog);
    });
    expect(dialog.hasAttribute("open")).toBe(false);
  });
});
