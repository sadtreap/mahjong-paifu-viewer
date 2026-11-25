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

/** Next step; past the end of a round it moves to the start of the next round. */
export function nextStep(position: Position, bounds: Bounds): Position {
  if (position.step < bounds.stepCount(position.round) - 1) {
    return { round: position.round, step: position.step + 1 };
  }
  return position.round < bounds.roundCount - 1 ? { round: position.round + 1, step: 0 } : position;
}

/** Previous step; before the start of a round it moves to the end of the previous round. */
export function prevStep(position: Position, bounds: Bounds): Position {
  if (position.step > 0) {
    return { round: position.round, step: position.step - 1 };
  }
  if (position.round > 0) {
    const round = position.round - 1;
    return { round, step: bounds.stepCount(round) - 1 };
  }
  return position;
}

/** Start of the next round; in the last round the position stays as it is (same object). */
export function nextRound(position: Position, bounds: Bounds): Position {
  return position.round < bounds.roundCount - 1 ? goToRound(position.round + 1, bounds) : position;
}

/** Start of the previous round; in the first round the position stays as it is (same object). */
export function prevRound(position: Position, bounds: Bounds): Position {
  return position.round > 0 ? goToRound(position.round - 1, bounds) : position;
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
