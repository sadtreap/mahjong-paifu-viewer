// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { readStorage } from "../../storage";
import { SettingsProvider } from "../settings/SettingsProvider";
import { parseSettings, SETTINGS_STORAGE_NAME } from "../settings/settings";
import {
  COMPACT_HINT_QUERY,
  FirstUseHint,
  FirstUseLegend,
  useFirstUseHint,
  usePointerKind,
} from "./FirstUseHint";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <SettingsProvider>{children}</SettingsProvider>
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("FirstUseHint", () => {
  it("lists the mouse gestures as key + action with a Got it button", () => {
    const onDismiss = vi.fn();
    render(<FirstUseHint pointer="mouse" compact={false} onDismiss={onDismiss} />, { wrapper });
    const bold = Array.from(document.querySelectorAll("b"), (b) => b.textContent);
    expect(bold).toEqual(["Click the table", "Right-click", "Hold", "Wheel", "Shift"]);
    expect(document.body.textContent).toContain("Click the table next · Right-click back");
    const button = screen.getByRole("button", { name: "Got it" });
    expect(button.getAttribute("data-gesture")).toBe("ignore");
    fireEvent.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows the touch gestures for touch", () => {
    render(<FirstUseHint pointer="touch" compact={false} onDismiss={vi.fn()} />, { wrapper });
    const bold = Array.from(document.querySelectorAll("b"), (b) => b.textContent);
    expect(bold).toEqual(["Tap", "Swipe →", "Hold"]);
  });

  it("is one line without a button below 360 px", () => {
    render(<FirstUseHint pointer="touch" compact onDismiss={vi.fn()} />, { wrapper });
    expect(document.body.textContent).toBe(
      "Tap the table: next · swipe →: back · hold: fast-forward",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("has a legend for the status line", () => {
    render(<FirstUseLegend />, { wrapper });
    expect(document.body.textContent).toBe("← → step · click the table");
  });
});

describe("usePointerKind", () => {
  it("starts from (pointer: coarse) and follows the first touch and mouse presses", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query === "(pointer: coarse)" }) as MediaQueryList),
    );
    const { result } = renderHook(() => usePointerKind());
    expect(result.current).toBe("touch");
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" }));
    });
    expect(result.current).toBe("mouse");
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch" }));
    });
    expect(result.current).toBe("touch");
  });

  it("assumes a mouse for a fine pointer", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }) as MediaQueryList),
    );
    const { result } = renderHook(() => usePointerKind());
    expect(result.current).toBe("mouse");
  });
});

describe("useFirstUseHint", () => {
  it("is compact in portrait below 360 px", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(
        (query: string) =>
          ({
            matches: query === COMPACT_HINT_QUERY,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      ),
    );
    const { result } = renderHook(() => useFirstUseHint(), { wrapper });
    expect(result.current.compact).toBe(true);
  });

  it("shows until dismissed, then remembers it", () => {
    const { result } = renderHook(() => useFirstUseHint(), { wrapper });
    expect(result.current.show).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.show).toBe(false);
    expect(parseSettings(readStorage(SETTINGS_STORAGE_NAME), null).hintSeen).toBe(true);

    cleanup();
    const again = renderHook(() => useFirstUseHint(), { wrapper });
    expect(again.result.current.show).toBe(false);
  });
});
