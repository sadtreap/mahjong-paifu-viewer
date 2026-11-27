// @vitest-environment happy-dom
import { cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStartFromUrl } from "./useStartFromUrl";

const ID = "2000010100gm-0089-0000-0123abcd";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("useStartFromUrl", () => {
  it("opens the sample in the address once, even under StrictMode", () => {
    window.history.replaceState(null, "", "/?sample=sanma&round=2&step=4&pov=3");
    const load = vi.fn();
    const { result } = renderHook(() => useStartFromUrl(load), { wrapper: StrictMode });
    expect(result.current).toEqual({
      source: { kind: "sample", id: "sanma" },
      start: { round: 1, step: 3, pov: 2 },
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(
      { kind: "url", url: expect.stringMatching(/samples\/sanma\.json$/) },
      { round: 1, step: 3, pov: 2 },
      { kind: "sample", id: "sanma" },
    );
  });

  it("opens a Tenhou log as its id, so the loader downloads it like a pasted link", () => {
    window.history.replaceState(null, "", `/?tenhou=${ID}&pov=2`);
    const load = vi.fn();
    const { result } = renderHook(() => useStartFromUrl(load));
    expect(result.current?.source).toEqual({ kind: "tenhou", logId: ID });
    expect(load).toHaveBeenCalledWith(
      { kind: "text", text: ID },
      { round: 0, step: 0, pov: 1 },
      { kind: "tenhou", logId: ID },
    );
  });

  it("opens nothing, and gives no link, when the address names no log", () => {
    window.history.replaceState(null, "", "/?sample=nope");
    const load = vi.fn();
    expect(renderHook(() => useStartFromUrl(load)).result.current).toBeNull();
    expect(load).not.toHaveBeenCalled();
    cleanup();
    window.history.replaceState(null, "", "/");
    expect(renderHook(() => useStartFromUrl(load)).result.current).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("still gives the address's link after the address has changed", () => {
    window.history.replaceState(null, "", "/?sample=sanma");
    const load = vi.fn();
    const { result, rerender } = renderHook(() => useStartFromUrl(load));
    window.history.replaceState(null, "", "/");
    rerender();
    expect(result.current?.source).toEqual({ kind: "sample", id: "sanma" });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
