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
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(
      { kind: "url", url: expect.stringMatching(/samples\/sanma\.json$/) },
      { round: 1, step: 3, pov: 2 },
      { kind: "sample", id: "sanma" },
    );
    expect(result.current.welcome).toBe(false);
  });

  it("opens a Tenhou log as its id, so the loader downloads it like a pasted link", () => {
    window.history.replaceState(null, "", `/?tenhou=${ID}&pov=2`);
    const load = vi.fn();
    renderHook(() => useStartFromUrl(load));
    expect(load).toHaveBeenCalledWith(
      { kind: "text", text: ID },
      { round: 0, step: 0, pov: 1 },
      { kind: "tenhou", logId: ID },
    );
  });

  it("opens the fallback sample when the address names no log, and asks for the welcome card", () => {
    window.history.replaceState(null, "", "/?sample=nope");
    const load = vi.fn();
    const { result } = renderHook(() => useStartFromUrl(load, { fallbackSample: "tenhou-json" }));
    expect(load).toHaveBeenCalledWith(
      { kind: "url", url: expect.stringMatching(/samples\/ranked_game\.json$/) },
      null,
      { kind: "sample", id: "tenhou-json" },
    );
    expect(result.current.welcome).toBe(true);
  });

  it("opens nothing without a source or a fallback", () => {
    const load = vi.fn();
    const { result } = renderHook(() => useStartFromUrl(load));
    expect(load).not.toHaveBeenCalled();
    expect(result.current.welcome).toBe(true);
  });
});
