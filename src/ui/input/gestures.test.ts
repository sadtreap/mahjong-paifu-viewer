import { describe, expect, it } from "vitest";
import { classifyGesture, HOLD_DELAY_MS, holdDelay, type PointerSample, tapSlop } from "./gestures";

function at(x: number, y: number, extra: Partial<PointerSample> = {}): PointerSample {
  return {
    x,
    y,
    t: 0,
    button: 0,
    pointerType: "mouse",
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    ...extra,
  };
}
const touch = (x: number, y: number, t = 0) => at(x, y, { pointerType: "touch", t });
const free = { held: false };

describe("classifyGesture", () => {
  it("clicks within the slop: 6 px for a mouse, 10 px for touch", () => {
    expect(classifyGesture(at(0, 0), at(6, 0), free)).toEqual({
      kind: "step",
      dir: 1,
      ownTurn: false,
      swipe: false,
    });
    expect(classifyGesture(at(0, 0), at(7, 0), free)).toEqual({ kind: "none" });
    expect(classifyGesture(touch(0, 0), touch(6, 8), free)).toMatchObject({ kind: "step", dir: 1 });
    expect(classifyGesture(touch(0, 0), touch(8, 8), free)).toEqual({ kind: "none" });
    expect(tapSlop("pen")).toBe(10);
  });

  it("goes back with the right button or Ctrl+click", () => {
    expect(classifyGesture(at(0, 0, { button: 2 }), at(0, 0), free)).toMatchObject({ dir: -1 });
    expect(classifyGesture(at(0, 0, { ctrlKey: true }), at(0, 0), free)).toMatchObject({ dir: -1 });
  });

  it("moves by own turns with Shift", () => {
    expect(classifyGesture(at(0, 0, { shiftKey: true }), at(0, 0), free)).toMatchObject({
      dir: 1,
      ownTurn: true,
    });
    expect(classifyGesture(at(0, 0, { shiftKey: true, button: 2 }), at(0, 0), free)).toMatchObject({
      dir: -1,
      ownTurn: true,
    });
  });

  it("leaves Alt+click and other buttons alone", () => {
    expect(classifyGesture(at(0, 0, { altKey: true }), at(0, 0), free)).toEqual({ kind: "none" });
    expect(classifyGesture(at(0, 0, { button: 1 }), at(0, 0), free)).toEqual({ kind: "none" });
    expect(classifyGesture(at(0, 0, { button: 3 }), at(0, 0), free)).toEqual({ kind: "none" });
  });

  it("does nothing after a hold, or after a move past the slop that came back", () => {
    expect(classifyGesture(at(0, 0), at(0, 0), { held: true })).toEqual({ kind: "none" });
    expect(classifyGesture(at(0, 0), at(1, 0), { held: false, moved: true })).toEqual({
      kind: "none",
    });
  });

  it("swipes with touch: at least 40 px sideways, more than twice the vertical, within 600 ms", () => {
    expect(classifyGesture(touch(100, 100), touch(148, 110, 300), free)).toEqual({
      kind: "step",
      dir: -1,
      ownTurn: false,
      swipe: true,
    });
    expect(classifyGesture(touch(100, 100), touch(52, 100, 300), free)).toMatchObject({
      dir: 1,
      swipe: true,
    });
    expect(classifyGesture(touch(100, 100), touch(139, 100, 300), free)).toEqual({ kind: "none" });
    expect(classifyGesture(touch(100, 100), touch(150, 130, 300), free)).toEqual({ kind: "none" });
    expect(classifyGesture(touch(100, 100), touch(100, 200, 300), free)).toEqual({ kind: "none" });
    expect(classifyGesture(touch(100, 100), touch(160, 100, 700), free)).toEqual({ kind: "none" });
    expect(
      classifyGesture(touch(100, 100), touch(160, 100, 300), { held: false, moved: true }),
    ).toMatchObject({
      swipe: true,
    });
  });

  it("never swipes with a mouse (a drag does nothing)", () => {
    expect(classifyGesture(at(100, 100), at(200, 100, { t: 100 }), free)).toEqual({ kind: "none" });
  });
});

describe("holdDelay", () => {
  it("is 350 ms for a mouse and 400 ms for touch and pens", () => {
    expect(holdDelay("mouse")).toBe(HOLD_DELAY_MS.mouse);
    expect(HOLD_DELAY_MS).toEqual({ mouse: 350, touch: 400 });
    expect(holdDelay("touch")).toBe(400);
    expect(holdDelay("pen")).toBe(400);
  });
});
