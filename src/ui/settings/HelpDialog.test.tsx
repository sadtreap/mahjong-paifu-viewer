// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LOCALES } from "../../i18n/locales";
import { MESSAGES } from "../../i18n/messages";
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

const items = (region: HTMLElement) =>
  within(region)
    .getAllByRole("listitem")
    .map((item) => item.textContent);

/** Makes the page answer media queries the way a phone does: only the touch query matches. */
function stubTouchDevice() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(hover: none) and (pointer: coarse)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
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
      const caps = Array.from(row.querySelectorAll("kbd"), (kbd) => kbd.textContent);
      expect(caps).toEqual(shortcut.keys.flatMap((key) => (key === "+" ? ["+"] : key.split("+"))));
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

  it("lists the keys, then the mouse, then touch, and nothing after them", async () => {
    renderHelp();
    const { dialog } = await openHelp();
    expect(
      within(dialog)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Keyboard", "Mouse", "Touch"]);
    expect(items(within(dialog).getByRole("region", { name: "Mouse" }))).toEqual(
      MOUSE_HELP.map((line) => line(en)),
    );
    const touch = within(dialog).getByRole("region", { name: "Touch" });
    expect(items(touch)).toEqual(TOUCH_HELP.map((line) => line(en)));
    expect(within(dialog).getAllByRole("listitem").at(-1)).toBe(
      within(touch).getAllByRole("listitem").at(-1),
    );
    expect(within(dialog).queryByText(en.settings.charKeysOff)).toBeNull();
  });

  it("puts the touch list first and the keys last on a touch device", async () => {
    stubTouchDevice();
    renderHelp();
    const { dialog } = await openHelp();
    expect(
      within(dialog)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Touch", "Mouse", "Keyboard"]);
    expect(items(within(dialog).getByRole("region", { name: "Touch" }))).toEqual(
      TOUCH_HELP.map((line) => line(en)),
    );
    expect(within(dialog).getAllByRole("row")).toHaveLength(SHORTCUTS.length);
  });

  it("says what the mouse and a finger do on the table, and no more", () => {
    expect(MOUSE_HELP.map((line) => line(en))).toEqual([
      "Click the table: next step",
      "Right-click: previous step",
      "Wheel: next / previous step",
      "With Shift held: by own turn",
      "Press and hold: fast-forward or rewind",
      "Point at a tile: highlight every copy of it",
      "Alt+click a discard: go to that moment",
      "Click the centre panel: score differences",
    ]);
    expect(TOUCH_HELP.map((line) => line(en))).toEqual([
      "Tap the table: next step",
      "Swipe left / right: next / previous step",
      "Touch and hold: fast-forward",
      "Tap the centre panel: score differences",
    ]);
  });

  it.each(LOCALES)("has a different line for each control in %s", (locale) => {
    const lines = [...MOUSE_HELP, ...TOUCH_HELP].map((line) => line(MESSAGES[locale]));
    expect(new Set(lines).size).toBe(lines.length);
    const labels = SHORTCUTS.map((shortcut) => shortcut.label(MESSAGES[locale]));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("marks no row as off while single-key shortcuts are on", async () => {
    renderHelp();
    const { dialog } = await openHelp();
    for (const row of within(dialog).getAllByRole("row")) {
      expect(row.textContent).not.toContain("(disabled)");
      expect(row.className).toBe("");
    }
  });

  it("marks the single-key rows as off when single-key shortcuts are off", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ ...DEFAULT_SETTINGS, charKeys: false }));
    renderHelp();
    const { dialog } = await openHelp();
    // The reason stands with the keys it is about.
    expect(
      within(within(dialog).getByRole("region", { name: "Keyboard" })).getByText(
        "Single-key shortcuts are off in the settings, so the dimmed keys do nothing.",
      ),
    ).toBeTruthy();
    const rows = within(dialog).getAllByRole("row");
    expect(SHORTCUTS.some((shortcut) => shortcut.charKey)).toBe(true);
    expect(SHORTCUTS.some((shortcut) => !shortcut.charKey)).toBe(true);
    SHORTCUTS.forEach((shortcut, index) => {
      const row = rows[index] as HTMLElement;
      const label = shortcut.label(en);
      expect(within(row).getByRole("cell").textContent, label).toBe(
        shortcut.charKey ? `${label} (disabled)` : label,
      );
      expect(row.className !== "", label).toBe(shortcut.charKey);
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

  it("closes on a press on the backdrop but not inside", async () => {
    renderHelp();
    const { dialog } = await openHelp();
    const heading = within(dialog).getByRole("heading", { name: "Controls" });
    await act(async () => {
      fireEvent.pointerDown(heading);
      fireEvent.click(heading);
    });
    expect(dialog.hasAttribute("open")).toBe(true);
    await act(async () => {
      fireEvent.pointerDown(dialog);
      fireEvent.click(dialog);
    });
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("lets the keyboard scroll its body", async () => {
    renderHelp();
    const { dialog } = await openHelp();
    const keys = within(dialog).getByRole("region", { name: "Keyboard" });
    expect(keys.closest('[tabindex="0"]')).not.toBeNull();
    // The dialog names its body; the body is no second "Controls" landmark.
    expect(within(dialog).queryByRole("region", { name: "Controls" })).toBeNull();
  });
});
