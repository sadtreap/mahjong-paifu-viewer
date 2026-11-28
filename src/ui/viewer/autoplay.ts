import type { AutoplaySpeed, StepInfo, StepKind } from "./types";

/** How long autoplay stays on a step at 1×, by the step's kind (a tsumogiri is quicker). */
const DELAY_MS: Record<Exclude<StepKind, "result">, number> = {
  deal: 900,
  draw: 350,
  discard: 700,
  riichi: 1100,
  chi: 1100,
  pon: 1100,
  daiminkan: 1100,
  ankan: 1100,
  kakan: 1100,
  kita: 900,
};
const TSUMOGIRI_MS = 550;

/**
 * How long autoplay waits on a step before the next one: the 1× delay divided by the speed, or
 * "stop" at a result (autoplay pauses there, with the result in the panel).
 */
export function autoplayDelay(info: StepInfo, speed: AutoplaySpeed): number | "stop" {
  if (info.kind === "result") {
    return "stop";
  }
  const base = info.kind === "discard" && info.tsumogiri ? TSUMOGIRI_MS : DELAY_MS[info.kind];
  return Math.round(base / speed);
}
