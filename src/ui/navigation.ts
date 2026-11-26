import type { Seat } from "../core/model";
import type { NavCommand, StepIndex, StepInfo } from "./viewer/types";

/** A replay position: round index and step index within that round's timeline. */
export interface Position {
  round: number;
  step: number;
}

export interface Bounds {
  roundCount: number;
  /** Number of steps in a round's timeline (at least 1). */
  stepCount: (round: number) => number;
}

export function goToRound(round: number, bounds: Bounds): Position {
  return { round: Math.min(Math.max(round, 0), Math.max(bounds.roundCount - 1, 0)), step: 0 };
}

export function goToStep(position: Position, step: number, bounds: Bounds): Position {
  const last = bounds.stepCount(position.round) - 1;
  return { round: position.round, step: Math.min(Math.max(step, 0), last) };
}

/** Moves any position into range: the round first, then the step within that round. */
export function clampPosition(position: Position, bounds: Bounds): Position {
  return goToStep(goToRound(position.round, bounds), position.step, bounds);
}

/** True at a round's last step (its result, or the only step of a round that failed to replay). */
export function isRoundEnd(position: Position, bounds: Bounds): boolean {
  return position.step >= bounds.stepCount(position.round) - 1;
}

/** True at the game's very last step: nothing comes after it. */
export function isGameEnd(position: Position, bounds: Bounds): boolean {
  return position.round >= bounds.roundCount - 1 && isRoundEnd(position, bounds);
}

/** True at the game's first step. */
export function isGameStart(position: Position): boolean {
  return position.round <= 0 && position.step <= 0;
}

/** The transport's limits at a position (TransportProps.limits): which buttons are aria-disabled. */
export function navLimits(
  position: Position,
  bounds: Bounds,
): { gameStart: boolean; gameEnd: boolean; firstRound: boolean; lastRound: boolean } {
  return {
    gameStart: isGameStart(position),
    gameEnd: isGameEnd(position, bounds),
    firstRound: position.round <= 0,
    lastRound: position.round >= bounds.roundCount - 1,
  };
}

/** Same round and step. */
export function samePosition(a: Position, b: Position): boolean {
  return a.round === b.round && a.step === b.step;
}

/**
 * The next step of the round that matches, or the round's last step when none does: a round's
 * last step is always a stop. Null at the last step (crossing into the next round is resolveNav's
 * call, as only a fresh input may cross).
 */
export function nextWhere(
  position: Position,
  ix: StepIndex,
  match: (info: StepInfo) => boolean,
): Position | null {
  const last = ix.stepCount(position.round) - 1;
  for (let step = position.step + 1; step < last; step++) {
    if (match(ix.info(position.round, step))) {
      return { round: position.round, step };
    }
  }
  return position.step < last ? { round: position.round, step: last } : null;
}

/**
 * The previous step of the round that matches, or the round's step 0 when none does: step 0 is
 * always a stop. Null at step 0.
 */
export function prevWhere(
  position: Position,
  ix: StepIndex,
  match: (info: StepInfo) => boolean,
): Position | null {
  for (let step = position.step - 1; step > 0; step--) {
    if (match(ix.info(position.round, step))) {
      return { round: position.round, step };
    }
  }
  return position.step > 0 ? { round: position.round, step: 0 } : null;
}

/**
 * An own turn of the point of view: a step whose main event is the POV's draw (replacement draws
 * after a kan or kita included) or its chi, pon or open kan.
 */
export const ownTurn =
  (pov: Seat) =>
  (info: StepInfo): boolean =>
    info.seat === pov &&
    (info.kind === "draw" ||
      info.kind === "chi" ||
      info.kind === "pon" ||
      info.kind === "daiminkan");

/** A key moment: a riichi discard, a call, a kan or a kita (a dora reveal folds into its step). */
export const keyMoment = (info: StepInfo): boolean =>
  info.kind === "riichi" ||
  info.kind === "chi" ||
  info.kind === "pon" ||
  info.kind === "daiminkan" ||
  info.kind === "ankan" ||
  info.kind === "kakan" ||
  info.kind === "kita";

/** From a round's last step a fresh forward input goes on to the next round's start. */
function crossForward(position: Position, ix: StepIndex, repeat: boolean): Position | null {
  return !repeat && position.round < ix.roundCount - 1
    ? { round: position.round + 1, step: 0 }
    : null;
}

/** From step 0 a fresh backward input goes back to the previous round's last step. */
function crossBackward(position: Position, ix: StepIndex, repeat: boolean): Position | null {
  if (repeat || position.round <= 0) {
    return null;
  }
  const round = position.round - 1;
  return { round, step: ix.stepCount(round) - 1 };
}

/**
 * Where a navigation command leads, or null when it goes nowhere (the caller keeps the position).
 *
 * Hard stops: a repeated input (`repeat`: hold, key auto-repeat, a wheel burst, autoplay) never
 * moves forward from a round's last step nor backward from step 0. A fresh input crosses: next
 * from a round's last step is the next round's step 0, previous from step 0 is the previous
 * round's last step. Own-turn and key-moment jumps stop at step 0 and at the round's last step.
 * The game's ends never wrap around.
 */
export function resolveNav(
  position: Position,
  command: NavCommand,
  ix: StepIndex,
  options: { pov: Seat; repeat: boolean },
): Position | null {
  if (ix.roundCount <= 0) {
    return null;
  }
  const p = clampPosition(position, ix);
  const { repeat } = options;
  const atEnd = isRoundEnd(p, ix);
  const forwardBlocked = repeat && atEnd;
  const backwardBlocked = repeat && p.step === 0;
  switch (command.kind) {
    case "step":
      if (command.dir > 0) {
        return atEnd ? crossForward(p, ix, repeat) : { round: p.round, step: p.step + 1 };
      }
      return p.step > 0 ? { round: p.round, step: p.step - 1 } : crossBackward(p, ix, repeat);
    case "ownTurn":
    case "keyMoment": {
      const match = command.kind === "ownTurn" ? ownTurn(options.pov) : keyMoment;
      if (command.dir > 0) {
        return nextWhere(p, ix, match) ?? crossForward(p, ix, repeat);
      }
      return prevWhere(p, ix, match) ?? crossBackward(p, ix, repeat);
    }
    case "nextRound":
      return forwardBlocked || p.round >= ix.roundCount - 1
        ? null
        : { round: p.round + 1, step: 0 };
    case "roundStartOrPrev":
      if (p.step > 0) {
        return { round: p.round, step: 0 };
      }
      return backwardBlocked || p.round <= 0 ? null : { round: p.round - 1, step: 0 };
    case "roundStart":
      return p.step > 0 ? { round: p.round, step: 0 } : null;
    case "roundEnd":
      return atEnd ? null : { round: p.round, step: ix.stepCount(p.round) - 1 };
  }
}
