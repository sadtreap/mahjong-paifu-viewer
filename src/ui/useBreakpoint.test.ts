// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BREAKPOINT_QUERIES } from "./breakpoints";
import { currentBreakpoint, resetBreakpointCache, useBreakpoint } from "./useBreakpoint";
import type { Breakpoint } from "./viewer/types";

/** A matchMedia whose answers the test controls, with working change listeners. */
function fakeMatchMedia(initial: Breakpoint | null) {
  let current = initial;
  const lists = new Map<string, { listeners: Set<() => void>; list: MediaQueryList }>();
  const matchMedia = vi.fn((query: string) => {
    const existing = lists.get(query);
    if (existing) {
      return existing.list;
    }
    const listeners = new Set<() => void>();
    const list = {
      media: query,
      get matches() {
        return current !== null && BREAKPOINT_QUERIES[current] === query;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    } as unknown as MediaQueryList;
    lists.set(query, { listeners, list });
    return list;
  });
  vi.stubGlobal("matchMedia", matchMedia);
  resetBreakpointCache();
  return {
    set(next: Breakpoint | null) {
      current = next;
      for (const { listeners } of lists.values()) {
        for (const listener of listeners) {
          listener();
        }
      }
    },
    listenerCount: () =>
      [...lists.values()].reduce((sum, { listeners }) => sum + listeners.size, 0),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetBreakpointCache();
});

describe("useBreakpoint", () => {
  it("follows the matching media query", () => {
    const media = fakeMatchMedia("laptop");
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("laptop");
    act(() => media.set("phonePortrait"));
    expect(result.current).toBe("phonePortrait");
    act(() => media.set("wide"));
    expect(result.current).toBe("wide");
  });

  it("falls back to the viewport size between the queries' whole-pixel edges", () => {
    fakeMatchMedia(null);
    vi.stubGlobal("innerWidth", 1199.5);
    vi.stubGlobal("innerHeight", 800);
    expect(currentBreakpoint()).toBe("laptop");
  });

  it("stops listening when unmounted", () => {
    const media = fakeMatchMedia("wide");
    const { unmount } = renderHook(() => useBreakpoint());
    expect(media.listenerCount()).toBe(5);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
