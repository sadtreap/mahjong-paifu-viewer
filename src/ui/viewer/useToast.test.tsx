// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Position } from "../navigation";
import { TOAST_MS, useToast } from "./useToast";

function setup(start: Position = { round: 0, step: 3 }) {
  return renderHook(({ position }) => useToast(position), { initialProps: { position: start } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useToast", () => {
  it("shows a toast for its time and reads it out until the replay moves on", () => {
    const { result, rerender } = setup();
    expect(result.current.toast).toBeNull();
    expect(result.current.announcement).toBeNull();
    act(() => result.current.show("Link copied"));
    expect(result.current.toast).toBe("Link copied");
    expect(result.current.announcement?.text).toBe("Link copied");

    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(result.current.toast).toBeNull();
    // Still read out: nothing moved, so the step would be read again for nothing.
    expect(result.current.announcement?.text).toBe("Link copied");
    rerender({ position: { round: 0, step: 4 } });
    expect(result.current.announcement).toBeNull();
  });

  it("keeps the toast its full time when the replay moves on", () => {
    const { result, rerender } = setup();
    act(() => result.current.show("Link copied"));
    rerender({ position: { round: 0, step: 4 } });
    expect(result.current.announcement).toBeNull();
    expect(result.current.toast).toBe("Link copied");
  });

  it("reads words out without a toast, each time anew", () => {
    const { result } = setup();
    act(() => result.current.say("Flat table"));
    expect(result.current.toast).toBeNull();
    const first = result.current.announcement;
    expect(first?.text).toBe("Flat table");
    act(() => result.current.say("Flat table"));
    expect(result.current.announcement?.text).toBe("Flat table");
    expect(result.current.announcement?.id).not.toBe(first?.id);
  });

  it("gives a repeated toast its full time again", () => {
    const { result } = setup();
    act(() => result.current.show("Link copied"));
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    act(() => result.current.show("Link copied"));
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(result.current.toast).toBe("Link copied");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toast).toBeNull();
  });
});
