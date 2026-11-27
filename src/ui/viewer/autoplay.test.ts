import { describe, expect, it } from "vitest";
import { autoplayDelay } from "./autoplay";
import type { StepInfo, StepKind } from "./types";

const info = (kind: StepKind, tsumogiri = false): StepInfo => ({
  kind,
  seat: 0,
  tsumogiri,
});

describe("autoplayDelay", () => {
  it("waits by the step's kind at 1×", () => {
    expect(autoplayDelay(info("deal"), 1)).toBe(900);
    expect(autoplayDelay(info("draw"), 1)).toBe(350);
    expect(autoplayDelay(info("discard"), 1)).toBe(700);
    expect(autoplayDelay(info("discard", true), 1)).toBe(550);
    for (const kind of ["riichi", "chi", "pon", "daiminkan", "ankan", "kakan"] as const) {
      expect(autoplayDelay(info(kind), 1)).toBe(1100);
    }
    expect(autoplayDelay(info("kita"), 1)).toBe(900);
  });

  it("divides by the speed", () => {
    expect(autoplayDelay(info("discard"), 0.5)).toBe(1400);
    expect(autoplayDelay(info("discard"), 2)).toBe(350);
    expect(autoplayDelay(info("draw"), 4)).toBe(88);
  });

  it("stops at a result", () => {
    for (const speed of [0.5, 1, 2, 4] as const) {
      expect(autoplayDelay(info("result"), speed)).toBe("stop");
    }
  });
});
