// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { readStorage, storageKey, writeStorage } from "../../storage";
import { SettingsDialog } from "./SettingsDialog";
import { SettingsProvider } from "./SettingsProvider";
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_STORAGE_NAME } from "./settings";
import { useDialogs, useSettings } from "./useSettings";

function stored() {
  return parseSettings(readStorage(SETTINGS_STORAGE_NAME), null);
}

function Harness() {
  const { dialog, openDialog, closeDialog } = useDialogs();
  const { settings } = useSettings();
  return (
    <>
      <button type="button" onClick={() => openDialog("settings")}>
        Open settings
      </button>
      <output data-testid="view">{settings.view}</output>
      <SettingsDialog open={dialog === "settings"} onClose={closeDialog} />
    </>
  );
}

function Lonely() {
  useSettings();
  return null;
}

function renderDialog() {
  render(
    <I18nProvider>
      <SettingsProvider>
        <Harness />
      </SettingsProvider>
    </I18nProvider>,
  );
}

async function openSettings() {
  const opener = screen.getByRole("button", { name: "Open settings" });
  opener.focus();
  await act(async () => {
    fireEvent.click(opener);
  });
  return opener;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("SettingsDialog", () => {
  it("opens as a labelled modal dialog and closes with Esc, giving the focus back", async () => {
    renderDialog();
    const opener = await openSettings();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(screen.getByRole("heading", { name: "Display" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Review aids" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Controls" })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("closes with the close button", async () => {
    renderDialog();
    await openSettings();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("persists each checkbox as it changes", async () => {
    renderDialog();
    await openSettings();
    const checks: Array<[string, keyof typeof DEFAULT_SETTINGS]> = [
      ["Show all hands", "showAllHands"],
      ["Dim tiles discarded right after drawing", "dimTsumogiri"],
      ["Show call captions (Pon, Riichi, Ron…)", "captions"],
      ["Animate tiles (discards, riichi, the round-end reveal)", "motion"],
      ["Show waits, tenpai and furiten on the player plates", "showWaits"],
      [
        "Mark the tile the point-of-view player discards next (gives the next move away)",
        "showNextDiscard",
      ],
      ["List the rest of the round under Moves (gives the round away)", "movesShowRest"],
      ["Click or tap the table to step (right-click or swipe right goes back)", "clickToStep"],
      ["Mouse wheel steps through the game", "wheelToStep"],
      ["Single-key shortcuts (letters, digits, punctuation and Space)", "charKeys"],
    ];
    for (const [label, key] of checks) {
      const box = screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
      expect(box.checked, key).toBe(DEFAULT_SETTINGS[key]);
      await act(async () => {
        fireEvent.click(box);
      });
      expect(box.checked, key).toBe(!DEFAULT_SETTINGS[key]);
      expect(stored()[key], key).toBe(!DEFAULT_SETTINGS[key]);
    }
  });

  it("persists the view and the autoplay speed", async () => {
    renderDialog();
    await openSettings();
    expect((screen.getByRole("radio", { name: "3D (tilted)" }) as HTMLInputElement).checked).toBe(
      true,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Flat (top-down)" }));
    });
    expect(stored().view).toBe("flat");
    expect(screen.getByTestId("view").textContent).toBe("flat");

    const speeds = screen.getByRole("group", { name: "Autoplay speed" });
    expect(speeds).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "2×" }));
    });
    expect(stored().autoplaySpeed).toBe(2);
  });

  it("sets data-theme on the page, and removes it for the system theme", async () => {
    renderDialog();
    await openSettings();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(stored().theme).toBe("dark");
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Same as the system" }));
    });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("switches the language", async () => {
    renderDialog();
    await openSettings();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Language"), { target: { value: "ko" } });
    });
    expect(screen.getByRole("dialog", { name: "설정" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "평면 (위에서)" })).toBeTruthy();
  });

  it("resets every setting to its default", async () => {
    writeStorage(
      SETTINGS_STORAGE_NAME,
      JSON.stringify({ ...DEFAULT_SETTINGS, view: "flat", theme: "dark", captions: false }),
    );
    renderDialog();
    expect(document.documentElement.dataset.theme).toBe("dark");
    await openSettings();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    });
    expect(stored()).toEqual(DEFAULT_SETTINGS);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect((screen.getByRole("radio", { name: "3D (tilted)" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });
});

describe("SettingsProvider", () => {
  it("writes nothing on a first visit", () => {
    renderDialog();
    expect(localStorage.getItem(storageKey(SETTINGS_STORAGE_NAME))).toBeNull();
  });

  it("migrates the old Show all hands flag into the blob once and deletes it", () => {
    localStorage.setItem(storageKey("showAllHands"), "false");
    renderDialog();
    expect(localStorage.getItem(storageKey("showAllHands"))).toBeNull();
    expect(stored().showAllHands).toBe(false);
  });

  it("keeps the blob's own value over the old flag", () => {
    writeStorage(
      SETTINGS_STORAGE_NAME,
      JSON.stringify({ ...DEFAULT_SETTINGS, showAllHands: true }),
    );
    localStorage.setItem(storageKey("showAllHands"), "false");
    renderDialog();
    expect(stored().showAllHands).toBe(true);
    expect(localStorage.getItem(storageKey("showAllHands"))).toBeNull();
  });

  it("throws a clear error outside the provider", () => {
    expect(() => render(<Lonely />)).toThrow("useSettings must be used inside <SettingsProvider>");
  });
});
