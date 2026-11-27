// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWheelStep, type WheelStepOptions } from "./useWheelStep";

let now = 0;

function Surfaces(options: WheelStepOptions) {
  const stage = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  useWheelStep([stage, controls], options);
  return (
    <>
      <div ref={stage} data-testid="stage">
        <div data-gesture="ignore" data-testid="card" />
      </div>
      <div ref={controls} data-testid="controls" />
    </>
  );
}

/** The transport as a bar on the felt: inside the stage, itself marked for gestures to skip. */
function Docked(options: WheelStepOptions) {
  const stage = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useWheelStep([stage, bar], options);
  return (
    <div ref={stage} data-testid="stage">
      <div data-gesture="ignore">
        <div ref={bar} data-gesture="ignore" data-testid="bar">
          <button type="button">step</button>
          <div data-gesture="ignore" data-testid="list" />
        </div>
      </div>
    </div>
  );
}

function setup() {
  const onStep = vi.fn<WheelStepOptions["onStep"]>(() => true);
  render(<Surfaces onStep={onStep} now={() => now} />);
  return onStep;
}

/** Dispatches a wheel event; false when a listener prevented it (the page would not scroll). */
function wheel(target: Element, t: number, init: Partial<WheelEventInit> = {}): boolean {
  now = t;
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
    deltaMode: 0,
    ...init,
  });
  // happy-dom's WheelEvent is not a MouseEvent: give it the modifier keys a browser's has.
  for (const key of ["shiftKey", "ctrlKey", "metaKey", "altKey"] as const) {
    Object.defineProperty(event, key, { value: init[key] ?? false });
  }
  return target.dispatchEvent(event);
}

afterEach(() => {
  cleanup();
  now = 0;
});

describe("useWheelStep", () => {
  it("runs a burst through the accumulator, sharing it between the stage and the controls", () => {
    const onStep = setup();
    const stage = screen.getByTestId("stage");
    const controls = screen.getByTestId("controls");
    expect(wheel(stage, 1000, { deltaY: 4 })).toBe(false);
    for (let i = 1; i <= 12; i++) {
      wheel(i % 2 ? controls : stage, 1000 + i * 10, { deltaY: 4 });
    }
    expect(onStep).toHaveBeenCalledTimes(1);
    wheel(controls, 1130, { deltaY: 4 });
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep.mock.calls).toEqual([
      [1, { ownTurn: false, source: "user" }],
      [1, { ownTurn: false, source: "repeat" }],
    ]);
  });

  it("steps by own turn with Shift and back on wheel up", () => {
    const onStep = setup();
    wheel(screen.getByTestId("stage"), 1000, { deltaY: -100, shiftKey: true });
    expect(onStep).toHaveBeenCalledWith(-1, { ownTurn: true, source: "user" });
  });

  it("steps once over a bar that lies on the stage, and not over a list inside the bar", () => {
    const onStep = vi.fn<WheelStepOptions["onStep"]>(() => true);
    render(<Docked onStep={onStep} now={() => now} />);
    expect(wheel(screen.getByRole("button"), 1000)).toBe(false);
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(wheel(screen.getByTestId("bar"), 2000)).toBe(false);
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(wheel(screen.getByTestId("list"), 3000)).toBe(true);
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it("leaves Ctrl+wheel and wheels inside data-gesture=ignore to the browser", () => {
    const onStep = setup();
    expect(wheel(screen.getByTestId("stage"), 1000, { ctrlKey: true })).toBe(true);
    expect(wheel(screen.getByTestId("card"), 2000)).toBe(true);
    expect(onStep).not.toHaveBeenCalled();
  });
});
