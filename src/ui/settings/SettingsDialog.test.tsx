// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { readStorage, storageKey, writeStorage } from "../../storage";
import type { Settings } from "../viewer/types";
import { SettingsDialog } from "./SettingsDialog";
import { SettingsProvider } from "./SettingsProvider";
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_STORAGE_NAME } from "./settings";
import { useDialogs, useSettings } from "./useSettings";

function stored() {
  return parseSettings(readStorage(SETTINGS_STORAGE_NAME), null);
}

/** The settings a component under the provider gets. */
function shown(): Settings {
  return JSON.parse(screen.getByTestId("settings").textContent ?? "null") as Settings;
}

function Harness() {
  const { dialog, openDialog, closeDialog } = useDialogs();
  const { settings } = useSettings();
  return (
    <>
      <button type="button" onClick={() => openDialog("settings")}>
        Open settings
      </button>
      <output data-testid="settings">{JSON.stringify(settings)}</output>
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
});

describe("SettingsDialog", () => {
  it("opens as a labelled modal dialog and closes with Esc, giving the focus back", async () => {
    renderDialog();
    const opener = await openSettings();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.hasAttribute("open")).toBe(true);

    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("closes with the close button", async () => {
    renderDialog();
    const opener = await openSettings();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("has the aid, the language, the key switch and Reset, in that order", async () => {
    renderDialog();
    await openSettings();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const controls = [
      within(dialog).getByRole("checkbox", { name: "Show waits and shanten" }),
      within(dialog).getByRole("combobox", { name: "Language" }),
      within(dialog).getByRole("checkbox", { name: "Single-key shortcuts" }),
      within(dialog).getByRole("button", { name: "Reset to defaults" }),
    ];
    controls.slice(1).forEach((control, index) => {
      const before = controls[index] as HTMLElement;
      expect(
        before.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING,
        control.outerHTML,
      ).toBeTruthy();
    });
  });

  it("has nothing else", async () => {
    renderDialog();
    await openSettings();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    // The table has one look: nothing chooses between views any more.
    expect(within(dialog).queryByRole("radiogroup")).toBeNull();
    expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(dialog).getAllByRole("combobox")).toHaveLength(1);
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent),
    ).toEqual(["Close", "Reset to defaults"]);
    expect(within(dialog).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it.each([
    ["Show waits and shanten", "showWaits"],
    ["Single-key shortcuts", "charKeys"],
  ] as const)("applies and persists %s as it changes", async (label, key) => {
    renderDialog();
    await openSettings();
    const box = screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
    expect(box.checked).toBe(DEFAULT_SETTINGS[key]);
    await act(async () => {
      fireEvent.click(box);
    });
    expect(box.checked).toBe(!DEFAULT_SETTINGS[key]);
    expect(shown()[key]).toBe(!DEFAULT_SETTINGS[key]);
    expect(stored()[key]).toBe(!DEFAULT_SETTINGS[key]);
    await act(async () => {
      fireEvent.click(box);
    });
    expect(shown()[key]).toBe(DEFAULT_SETTINGS[key]);
    expect(stored()[key]).toBe(DEFAULT_SETTINGS[key]);
  });

  it("says which keys the single-key switch covers", async () => {
    renderDialog();
    await openSettings();
    const box = screen.getByRole("checkbox", { name: "Single-key shortcuts" });
    const hint = document.getElementById(box.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Letters, digits, punctuation and Space");
  });

  it("leaves Show all hands to the player list", async () => {
    writeStorage(
      SETTINGS_STORAGE_NAME,
      JSON.stringify({ ...DEFAULT_SETTINGS, showAllHands: false }),
    );
    renderDialog();
    await openSettings();
    expect(screen.queryByRole("checkbox", { name: /hands/i })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Show waits and shanten" }));
    });
    expect(stored().showAllHands).toBe(false);
  });

  it("switches the language and keeps it", async () => {
    renderDialog();
    await openSettings();
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
        target: { value: "ko" },
      });
    });
    expect(screen.getByRole("dialog", { name: "설정" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "대기·샹텐 표시" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "기본값으로 되돌리기" })).toBeTruthy();
    expect(readStorage("locale")).toBe("ko");
  });

  it("resets every setting to its default, and leaves the language alone", async () => {
    const changed: Settings = {
      ...DEFAULT_SETTINGS,
      showAllHands: false,
      showWaits: false,
      charKeys: false,
      autoplaySpeed: 4,
    };
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify(changed));
    writeStorage("locale", "ja");
    renderDialog();
    expect(shown()).toEqual(changed);
    await openSettings();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "初期設定に戻す" }));
    });
    expect(stored()).toEqual(DEFAULT_SETTINGS);
    expect(shown()).toEqual(DEFAULT_SETTINGS);
    for (const name of ["待ち・向聴数を表示", "文字キーのショートカット"]) {
      expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).checked, name).toBe(true);
    }
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();
    expect(readStorage("locale")).toBe("ja");
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

  it.each([
    [
      "1",
      { version: 1, view: "flat", theme: "light", hintSeen: true, charKeys: false },
      { charKeys: false },
    ],
    [
      "2",
      {
        version: 2,
        view: "flat",
        showAllHands: false,
        showWaits: true,
        charKeys: true,
        autoplaySpeed: 2,
      },
      { showAllHands: false, autoplaySpeed: 2 },
    ],
  ] as const)(
    "rewrites a version %s blob as version 3, keeping the settings every version has",
    (_version, old, kept) => {
      writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify(old));
      renderDialog();
      expect(shown()).toEqual({ ...DEFAULT_SETTINGS, ...kept });
      // The choice between a 3D and a flat table, which versions 1 and 2 stored, is gone.
      expect(JSON.parse(readStorage(SETTINGS_STORAGE_NAME) ?? "null")).toEqual({
        ...DEFAULT_SETTINGS,
        ...kept,
      });
    },
  );

  it("leaves a current blob as it is", () => {
    const blob = JSON.stringify({ ...DEFAULT_SETTINGS, charKeys: false });
    writeStorage(SETTINGS_STORAGE_NAME, blob);
    renderDialog();
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe(blob);
  });

  it("leaves a current blob written in another form as it is", () => {
    const blob = JSON.stringify({ charKeys: false, version: 3, extra: true });
    writeStorage(SETTINGS_STORAGE_NAME, blob);
    renderDialog();
    expect(shown()).toEqual({ ...DEFAULT_SETTINGS, charKeys: false });
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe(blob);
  });

  it("reads a blob of a newer version as the defaults and leaves it as stored", () => {
    const blob = JSON.stringify({ version: 4, charKeys: false, table: { tilt: 20 } });
    writeStorage(SETTINGS_STORAGE_NAME, blob);
    renderDialog();
    expect(shown()).toEqual(DEFAULT_SETTINGS);
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe(blob);
  });

  it("leaves a stored value that is not JSON as stored", () => {
    writeStorage(SETTINGS_STORAGE_NAME, "{not json");
    renderDialog();
    expect(shown()).toEqual(DEFAULT_SETTINGS);
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe("{not json");
  });

  it("keeps the old flag next to a blob it cannot read", () => {
    const blob = JSON.stringify({ version: 4 });
    writeStorage(SETTINGS_STORAGE_NAME, blob);
    localStorage.setItem(storageKey("showAllHands"), "false");
    renderDialog();
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe(blob);
    expect(localStorage.getItem(storageKey("showAllHands"))).toBe("false");
  });

  it("replaces a blob it cannot read once a setting changes", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 4 }));
    renderDialog();
    await openSettings();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Show waits and shanten" }));
    });
    expect(stored()).toEqual({ ...DEFAULT_SETTINGS, showWaits: false });
  });

  it("throws a clear error outside the provider", () => {
    expect(() => render(<Lonely />)).toThrow("useSettings must be used inside <SettingsProvider>");
  });
});
