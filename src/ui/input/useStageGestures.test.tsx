// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dir, NavSource } from "../viewer/types";
import { type StageGestureOptions, useStageGestures } from "./useStageGestures";

type Call = [Dir, { ownTurn: boolean; source: NavSource }];

function Stage(options: StageGestureOptions) {
  const ref = useRef<HTMLDivElement>(null);
  useStageGestures(ref, options);
  return (
    <div ref={ref} data-testid="stage">
      <span data-testid="felt" />
      <button type="button">control</button>
      <div data-gesture="ignore">
        <span data-testid="card" />
      </div>
    </div>
  );
}

function setup(extra: Partial<StageGestureOptions> = {}) {
  const onStep = vi.fn<StageGestureOptions["onStep"]>(() => true);
  render(<Stage onStep={onStep} {...extra} />);
  return { onStep: extra.onStep ? (extra.onStep as typeof onStep) : onStep };
}

const felt = () => screen.getByTestId("felt");
let pointerId = 1;

function press(
  target: Element,
  init: {
    x?: number;
    y?: number;
    button?: number;
    type?: string;
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
  } = {},
) {
  const id = pointerId++;
  const base = {
    pointerId: id,
    isPrimary: true,
    pointerType: init.type ?? "mouse",
    button: init.button ?? 0,
    shiftKey: init.shift ?? false,
    ctrlKey: init.ctrl ?? false,
    altKey: init.alt ?? false,
  };
  fireEvent.pointerDown(target, { ...base, clientX: init.x ?? 100, clientY: init.y ?? 100 });
  return {
    move: (x: number, y: number) =>
      fireEvent.pointerMove(target, { ...base, clientX: x, clientY: y }),
    up: (x = init.x ?? 100, y = init.y ?? 100) =>
      fireEvent.pointerUp(target, { ...base, clientX: x, clientY: y }),
    cancel: () => fireEvent.pointerCancel(target, base),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useStageGestures", () => {
  it("steps forward on a left click and back on a right click, preventing the context menu", () => {
    const { onStep } = setup();
    press(felt()).up();
    press(felt(), { button: 2 }).up();
    expect(onStep.mock.calls).toEqual<Call[]>([
      [1, { ownTurn: false, source: "user" }],
      [-1, { ownTurn: false, source: "user" }],
    ]);
    expect(fireEvent.contextMenu(felt())).toBe(false);
  });

  it("goes back on Ctrl+click and by own turn with Shift", () => {
    const { onStep } = setup();
    press(felt(), { ctrl: true }).up();
    press(felt(), { shift: true }).up();
    press(felt(), { shift: true, button: 2 }).up();
    expect(onStep.mock.calls).toEqual<Call[]>([
      [-1, { ownTurn: false, source: "user" }],
      [1, { ownTurn: true, source: "user" }],
      [-1, { ownTurn: true, source: "user" }],
    ]);
  });

  it("leaves Alt+click and the middle button alone", () => {
    const { onStep } = setup();
    press(felt(), { alt: true }).up();
    press(felt(), { button: 1 }).up();
    expect(onStep).not.toHaveBeenCalled();
  });

  it("repeats a hold at 350 ms, then on the schedule, and no click fires on release", () => {
    const { onStep } = setup();
    const hold = press(felt());
    vi.advanceTimersByTime(349);
    expect(onStep).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStep).toHaveBeenLastCalledWith(1, { ownTurn: false, source: "repeat" });
    vi.advanceTimersByTime(1000);
    expect(onStep).toHaveBeenCalledTimes(11);
    vi.advanceTimersByTime(100);
    expect(onStep).toHaveBeenCalledTimes(13);
    hold.up();
    vi.advanceTimersByTime(1000);
    expect(onStep).toHaveBeenCalledTimes(13);
    expect(onStep.mock.calls.every(([, o]) => o.source === "repeat")).toBe(true);
  });

  it("rewinds while the right button is held", () => {
    const { onStep } = setup();
    const hold = press(felt(), { button: 2 });
    vi.advanceTimersByTime(450);
    hold.up();
    expect(onStep.mock.calls).toEqual<Call[]>([
      [-1, { ownTurn: false, source: "repeat" }],
      [-1, { ownTurn: false, source: "repeat" }],
    ]);
  });

  it("stops repeating at a hard stop but still swallows the click", () => {
    let moves = 2;
    const onStep = vi.fn(() => moves-- > 0);
    setup({ onStep });
    const hold = press(felt());
    vi.advanceTimersByTime(2000);
    expect(onStep).toHaveBeenCalledTimes(3);
    hold.up();
    expect(onStep).toHaveBeenCalledTimes(3);
  });

  it("cancels the tap and the hold after moving more than 6 px", () => {
    const { onStep } = setup();
    const gesture = press(felt());
    gesture.move(107, 100);
    vi.advanceTimersByTime(1000);
    gesture.up(100, 100);
    expect(onStep).not.toHaveBeenCalled();
    const repeating = press(felt());
    vi.advanceTimersByTime(400);
    expect(onStep).toHaveBeenCalledTimes(1);
    repeating.move(120, 100);
    vi.advanceTimersByTime(1000);
    repeating.up();
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("steps on a touch tap and swipes left / right to next / previous", () => {
    const { onStep } = setup();
    press(felt(), { type: "touch" }).up(108, 100);
    const swipe = press(felt(), { type: "touch", x: 100 });
    swipe.move(148, 104);
    swipe.up(148, 104);
    const left = press(felt(), { type: "touch", x: 200 });
    left.move(140, 100);
    left.up(140, 100);
    expect(onStep.mock.calls.map(([dir]) => dir)).toEqual([1, -1, 1]);
  });

  it("ignores a swipe that starts within 24 px of a side edge, but takes a tap there", () => {
    const { onStep } = setup();
    const fromLeft = press(felt(), { type: "touch", x: 10 });
    fromLeft.move(80, 100);
    fromLeft.up(80, 100);
    const fromRight = press(felt(), { type: "touch", x: window.innerWidth - 10 });
    fromRight.move(window.innerWidth - 90, 100);
    fromRight.up(window.innerWidth - 90, 100);
    expect(onStep).not.toHaveBeenCalled();
    press(felt(), { type: "touch", x: 10 }).up(12, 100);
    expect(onStep.mock.calls).toEqual<Call[]>([[1, { ownTurn: false, source: "user" }]]);
  });

  it("does nothing on a vertical swipe or a pointer cancel (a page scroll)", () => {
    const { onStep } = setup();
    const vertical = press(felt(), { type: "touch" });
    vertical.move(100, 200);
    vertical.up(100, 200);
    const cancelled = press(felt(), { type: "touch" });
    cancelled.cancel();
    vi.advanceTimersByTime(1000);
    expect(onStep).not.toHaveBeenCalled();
  });

  it("long-presses to fast-forward on touch after 400 ms", () => {
    const { onStep } = setup();
    const hold = press(felt(), { type: "touch" });
    vi.advanceTimersByTime(399);
    expect(onStep).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    hold.up();
    expect(onStep.mock.calls).toEqual<Call[]>([[1, { ownTurn: false, source: "repeat" }]]);
  });

  it("ignores taps on controls and anything inside data-gesture=ignore, but a swipe from a control counts", () => {
    const { onStep } = setup();
    const button = screen.getByRole("button");
    press(button).up();
    const held = press(button);
    vi.advanceTimersByTime(1000);
    held.up();
    press(screen.getByTestId("card")).up();
    expect(onStep).not.toHaveBeenCalled();
    expect(fireEvent.contextMenu(screen.getByTestId("card"))).toBe(true);
    const swipe = press(button, { type: "touch", x: 100 });
    swipe.move(150, 100);
    swipe.up(150, 100);
    expect(onStep.mock.calls).toEqual<Call[]>([[-1, { ownTurn: false, source: "user" }]]);
  });

  it("keeps the click of a tap that stepped from pressing anything", () => {
    const { onStep } = setup();
    const control = screen.getByRole("button", { name: "control" });
    const onClick = vi.fn();
    control.addEventListener("click", onClick);
    press(felt(), { type: "touch" }).up();
    expect(onStep).toHaveBeenCalledTimes(1);
    // A browser aims a tap's click when it sends it: here at a control the step put there.
    expect(fireEvent.click(control, { detail: 1 })).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    // The next click belongs to a press of its own.
    fireEvent.click(control, { detail: 1 });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lets a click from the keyboard, the click after a new press and a mouse click through", () => {
    setup();
    const control = screen.getByRole("button", { name: "control" });
    const onClick = vi.fn();
    control.addEventListener("click", onClick);
    press(felt(), { type: "touch" }).up();
    // Enter or Space on the control: a click that no pointer made.
    fireEvent.click(control, { detail: 0 });
    expect(onClick).toHaveBeenCalledTimes(1);
    // No click came for the tap; a new press ends the wait.
    press(control, { type: "touch" }).up();
    fireEvent.click(control, { detail: 1 });
    expect(onClick).toHaveBeenCalledTimes(2);
    // A mouse click goes to what was under the pointer all along.
    press(felt()).up();
    fireEvent.click(control, { detail: 1 });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("cancels the gesture when a second pointer comes down (a pinch)", () => {
    const { onStep } = setup();
    const first = press(felt(), { type: "touch" });
    fireEvent.pointerDown(felt(), { pointerId: 999, isPrimary: false, pointerType: "touch" });
    first.up();
    vi.advanceTimersByTime(1000);
    expect(onStep).not.toHaveBeenCalled();
  });
});
