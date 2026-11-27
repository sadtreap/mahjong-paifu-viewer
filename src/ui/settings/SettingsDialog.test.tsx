// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("has the table, the aid, the language, the key switch and Reset, in that order", async () => {
    renderDialog();
    await openSettings();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const controls = [
      within(dialog).getByRole("radiogroup", { name: "Table" }),
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
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual(["3D", "Flat"]);
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(dialog).getAllByRole("combobox")).toHaveLength(1);
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent),
    ).toEqual(["Close", "Reset to defaults"]);
    expect(within(dialog).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("persists the table's view as it changes", async () => {
    renderDialog();
    await openSettings();
    const table = screen.getByRole("radiogroup", { name: "Table" });
    expect((within(table).getByRole("radio", { name: "3D" }) as HTMLInputElement).checked).toBe(
      true,
    );
    await act(async () => {
      fireEvent.click(within(table).getByRole("radio", { name: "Flat" }));
    });
    expect((within(table).getByRole("radio", { name: "Flat" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(stored().view).toBe("flat");
    expect(screen.getByTestId("view").textContent).toBe("flat");
  });

  it.each([
    ["Show waits and shanten", "showWaits"],
    ["Single-key shortcuts", "charKeys"],
  ] as const)("persists %s as it changes", async (label, key) => {
    renderDialog();
    await openSettings();
    const box = screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
    expect(box.checked).toBe(DEFAULT_SETTINGS[key]);
    await act(async () => {
      fireEvent.click(box);
    });
    expect(box.checked).toBe(!DEFAULT_SETTINGS[key]);
    expect(stored()[key]).toBe(!DEFAULT_SETTINGS[key]);
    await act(async () => {
      fireEvent.click(box);
    });
    expect(stored()[key]).toBe(DEFAULT_SETTINGS[key]);
  });

  it("says which keys the single-key switch covers", async () => {
    renderDialog();
    await openSettings();
    const box = screen.getByRole("checkbox", { name: "Single-key shortcuts" });
    const hint = document.getElementById(box.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Letters, digits, punctuation and Space");
  });

  it("leaves Show all hands to the toolbar", async () => {
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
    expect(screen.getByRole("radio", { name: "평면" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "대기·샹텐 표시" })).toBeTruthy();
    expect(readStorage("locale")).toBe("ko");
  });

  it("resets every setting to its default, and leaves the language alone", async () => {
    writeStorage(
      SETTINGS_STORAGE_NAME,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        view: "flat",
        showAllHands: false,
        showWaits: false,
        charKeys: false,
        autoplaySpeed: 4,
      }),
    );
    writeStorage("locale", "ja");
    renderDialog();
    expect(screen.getByTestId("view").textContent).toBe("flat");
    await openSettings();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "初期設定に戻す" }));
    });
    expect(stored()).toEqual(DEFAULT_SETTINGS);
    expect((screen.getByRole("radio", { name: "3D" }) as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "待ち・向聴数を表示" }) as HTMLInputElement).checked,
    ).toBe(true);
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

  it("rewrites a version 1 blob as version 2, keeping the settings both versions have", () => {
    writeStorage(
      SETTINGS_STORAGE_NAME,
      JSON.stringify({ version: 1, view: "flat", theme: "light", hintSeen: true, charKeys: false }),
    );
    renderDialog();
    expect(screen.getByTestId("view").textContent).toBe("flat");
    expect(JSON.parse(readStorage(SETTINGS_STORAGE_NAME) ?? "null")).toEqual({
      ...DEFAULT_SETTINGS,
      view: "flat",
      charKeys: false,
    });
  });

  it("leaves a current blob as it is", () => {
    const blob = JSON.stringify({ ...DEFAULT_SETTINGS, view: "flat" });
    writeStorage(SETTINGS_STORAGE_NAME, blob);
    renderDialog();
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe(blob);
  });

  it("leaves a current blob written in another form as it is", () => {
    const blob = JSON.stringify({ view: "flat", version: 2, extra: true });
    writeStorage(SETTINGS_STORAGE_NAME, blob);
    renderDialog();
    expect(screen.getByTestId("view").textContent).toBe("flat");
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe(blob);
  });

  it("reads a blob of a newer version as the defaults and leaves it as stored", () => {
    const blob = JSON.stringify({ version: 3, view: "flat", table: { tilt: 20 } });
    writeStorage(SETTINGS_STORAGE_NAME, blob);
    renderDialog();
    expect(screen.getByTestId("view").textContent).toBe("3d");
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe(blob);
  });

  it("leaves a stored value that is not JSON as stored", () => {
    writeStorage(SETTINGS_STORAGE_NAME, "{not json");
    renderDialog();
    expect(screen.getByTestId("view").textContent).toBe("3d");
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe("{not json");
  });

  it("keeps the old flag next to a blob it cannot read", () => {
    const blob = JSON.stringify({ version: 3 });
    writeStorage(SETTINGS_STORAGE_NAME, blob);
    localStorage.setItem(storageKey("showAllHands"), "false");
    renderDialog();
    expect(readStorage(SETTINGS_STORAGE_NAME)).toBe(blob);
    expect(localStorage.getItem(storageKey("showAllHands"))).toBe("false");
  });

  it("replaces a blob it cannot read once a setting changes", async () => {
    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 3 }));
    renderDialog();
    await openSettings();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Flat" }));
    });
    expect(stored()).toEqual({ ...DEFAULT_SETTINGS, view: "flat" });
  });

  it("throws a clear error outside the provider", () => {
    expect(() => render(<Lonely />)).toThrow("useSettings must be used inside <SettingsProvider>");
  });
});
