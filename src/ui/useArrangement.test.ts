// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHORT, WIDE } from "./arrangement";
import { useArrangement } from "./useArrangement";

/** A matchMedia whose answers the test controls, with working change listeners. */
function fakeMatchMedia(initial: readonly string[]) {
  let matching = new Set(initial);
  const listeners = new Map<string, Set<() => void>>();
  const matchMedia = vi.fn((query: string) => {
    const own = listeners.get(query) ?? new Set<() => void>();
    listeners.set(query, own);
    return {
      media: query,
      get matches() {
        return matching.has(query);
      },
      addEventListener: (_type: string, listener: () => void) => own.add(listener),
      removeEventListener: (_type: string, listener: () => void) => own.delete(listener),
    } as unknown as MediaQueryList;
  });
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    queries: () => [...listeners.keys()],
    set(next: readonly string[]) {
      matching = new Set(next);
      for (const own of listeners.values()) {
        for (const listener of own) {
          listener();
        }
      }
    },
    listenerCount: () => [...listeners.values()].reduce((sum, own) => sum + own.size, 0),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useArrangement", () => {
  it("follows the two media queries", () => {
    const media = fakeMatchMedia([WIDE]);
    const { result } = renderHook(() => useArrangement());
    expect(result.current).toBe("wide");
    expect(media.queries().sort()).toEqual([SHORT, WIDE].sort());
    act(() => media.set([SHORT]));
    expect(result.current).toBe("short");
    act(() => media.set([]));
    expect(result.current).toBe("stack");
    act(() => media.set([WIDE]));
    expect(result.current).toBe("wide");
  });

  it('is "wide" where matchMedia does not exist', () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useArrangement());
    expect(result.current).toBe("wide");
  });

  it("stops listening when unmounted", () => {
    const media = fakeMatchMedia([]);
    const { unmount } = renderHook(() => useArrangement());
    expect(media.listenerCount()).toBe(2);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
