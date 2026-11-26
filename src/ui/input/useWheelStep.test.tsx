// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWheelStep, type WheelStepOptions } from "./useWheelStep";

let now = 0;

function Surfaces(options: WheelStepOptions) {
  const stage = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  useWheelStep([stage, dock], options);
  return (
    <>
      <div ref={stage} data-testid="stage">
        <div data-gesture="ignore" data-testid="card" />
      </div>
      <div ref={dock} data-testid="dock" />
    </>
  );
}

function setup(enabled = true) {
  const onStep = vi.fn<WheelStepOptions["onStep"]>(() => true);
  render(<Surfaces enabled={enabled} onStep={onStep} now={() => now} />);
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
  it("runs a burst through the accumulator, sharing it between the stage and the dock", () => {
    const onStep = setup();
    const stage = screen.getByTestId("stage");
    const dock = screen.getByTestId("dock");
    expect(wheel(stage, 1000, { deltaY: 4 })).toBe(false);
    for (let i = 1; i <= 12; i++) {
      wheel(i % 2 ? dock : stage, 1000 + i * 10, { deltaY: 4 });
    }
    expect(onStep).toHaveBeenCalledTimes(1);
    wheel(dock, 1130, { deltaY: 4 });
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

  it("leaves Ctrl+wheel and wheels inside data-gesture=ignore to the browser", () => {
    const onStep = setup();
    expect(wheel(screen.getByTestId("stage"), 1000, { ctrlKey: true })).toBe(true);
    expect(wheel(screen.getByTestId("card"), 2000)).toBe(true);
    expect(onStep).not.toHaveBeenCalled();
  });

  it("does nothing when wheel stepping is off", () => {
    const onStep = setup(false);
    expect(wheel(screen.getByTestId("stage"), 1000)).toBe(true);
    expect(onStep).not.toHaveBeenCalled();
  });
});
