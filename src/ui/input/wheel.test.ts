import { describe, expect, it } from "vitest";
import { INITIAL_WHEEL_STATE, type WheelInput, type WheelState, wheelStep } from "./wheel";

type Step = { dir: number; ownTurn: boolean; repeat: boolean };

function event(t: number, deltaY: number, extra: Partial<WheelInput> = {}): WheelInput {
  return {
    deltaX: 0,
    deltaY,
    deltaMode: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    t,
    ...extra,
  };
}

/** Feeds events through the accumulator; returns the steps taken. */
function run(events: readonly WheelInput[], state: WheelState = INITIAL_WHEEL_STATE): Step[] {
  const steps: Step[] = [];
  let current = state;
  for (const input of events) {
    const result = wheelStep(current, input);
    current = result.state;
    if (result.step) {
      steps.push(result.step);
    }
  }
  return steps;
}

describe("wheelStep", () => {
  it("takes one step per notch of 100 px", () => {
    expect(run([event(0, 100), event(80, 100), event(160, 100)])).toHaveLength(3);
  });

  it("takes one step for a single 120 px event", () => {
    expect(run([event(0, 120)])).toHaveLength(1);
  });

  it("steps at once on the first event after idle, then every 50 px", () => {
    const small = Array.from({ length: 30 }, (_, i) => event(i * 10, 4));
    // The first event steps at once; the other 29 add up to 116 px: two more steps.
    expect(run(small)).toHaveLength(3);
    expect(run([event(0, 1)])).toHaveLength(1);
  });

  it("goes forward on down and back on up", () => {
    expect(run([event(0, 100)])[0]?.dir).toBe(1);
    expect(run([event(0, -100)])[0]?.dir).toBe(-1);
  });

  it("restarts the sum on a direction change and after 200 ms idle", () => {
    // After the first step: +40, then -40 (flip: the sum restarts at -40), then -20 = -60: a step back.
    const flip = run([event(0, 10), event(50, 40), event(100, -40), event(150, -20)]);
    expect(flip.map((step) => step.dir)).toEqual([1, -1]);
    // +40 then idle: the next event steps at once whatever its delta.
    const idle = run([event(0, 10), event(50, 40), event(300, 5)]);
    expect(idle).toHaveLength(2);
  });

  it("takes one step per event in line and page mode", () => {
    const lines = [0, 40, 80, 120].map((t) => event(t, 3, { deltaMode: 1 }));
    expect(run(lines)).toHaveLength(4);
    expect(run([event(0, 1, { deltaMode: 2 }), event(50, 1, { deltaMode: 2 })])).toHaveLength(2);
  });

  it("never takes more than one step per event or per 33 ms", () => {
    expect(run([event(0, 1000)])).toHaveLength(1);
    expect(run([event(0, 100), event(10, 100), event(20, 100)])).toHaveLength(1);
    expect(run([event(0, 100), event(10, 100), event(40, 100)])).toHaveLength(2);
  });

  it("marks a step within 350 ms of the previous one as a repeat", () => {
    const steps = run([event(0, 100), event(100, 100), event(800, 100)]);
    expect(steps.map((step) => step.repeat)).toEqual([false, true, false]);
  });

  it("leaves Ctrl and Cmd + wheel to the browser", () => {
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      const result = wheelStep(INITIAL_WHEEL_STATE, event(0, 100, modifier));
      expect(result.handled).toBe(false);
      expect(result.step).toBeNull();
      expect(result.state).toBe(INITIAL_WHEEL_STATE);
    }
  });

  it("moves by own turns with Shift, reading deltaX when deltaY is 0", () => {
    const shifted = wheelStep(INITIAL_WHEEL_STATE, event(0, 0, { shiftKey: true, deltaX: 100 }));
    expect(shifted.step).toEqual({ dir: 1, ownTurn: true, repeat: false });
    const vertical = wheelStep(
      INITIAL_WHEEL_STATE,
      event(0, -100, { shiftKey: true, deltaX: 100 }),
    );
    expect(vertical.step?.dir).toBe(-1);
  });

  it("leaves horizontal scrolling without Shift alone", () => {
    const result = wheelStep(INITIAL_WHEEL_STATE, event(0, 0, { deltaX: 100 }));
    expect(result.handled).toBe(false);
  });

  it("handles an event that does not step, so the page does not scroll", () => {
    const first = wheelStep(INITIAL_WHEEL_STATE, event(0, 4));
    const second = wheelStep(first.state, event(10, 4));
    expect(second.handled).toBe(true);
    expect(second.step).toBeNull();
  });
});
