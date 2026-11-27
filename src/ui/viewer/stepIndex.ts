import type { GameLog, PlayerCount } from "../../core/model";
import type { BoardState } from "../../replay/types";
import type { TimelineCache } from "../timelineCache";
import type { StepIndex, StepInfo, StepKind } from "./types";

const DEAL: StepInfo = Object.freeze({ kind: "deal", seat: null, tsumogiri: false });

/** What a replay step is about: its kind, its seat, and whether it was a tsumogiri. */
export function stepInfo(state: BoardState): StepInfo {
  const event = state.lastEvent;
  if (event === null) {
    return DEAL;
  }
  const seat = state.activeSeat;
  let kind: StepKind;
  let tsumogiri = false;
  switch (event.type) {
    case "draw":
    case "chi":
    case "pon":
    case "daiminkan":
    case "ankan":
    case "kakan":
    case "kita":
      kind = event.type;
      break;
    case "discard":
      kind = event.riichi ? "riichi" : "discard";
      tsumogiri = event.tsumogiri;
      break;
    case "win":
    case "ryukyoku":
      kind = "result";
      break;
    case "dora":
      // A dora with no step before it (only the deal) is a step of its own.
      return DEAL;
    case "riichiAccepted":
      kind = "deal";
      break;
  }
  return { kind, seat, tsumogiri };
}

/**
 * The kind of every step of a game, built per round on first use from the timeline cache. A round
 * that failed to replay has one "deal" step; positions out of range read as "deal" too.
 */
export function createStepIndex(game: GameLog, timelines: TimelineCache): StepIndex {
  const rounds = new Map<number, readonly StepInfo[]>();
  const infos = (index: number): readonly StepInfo[] => {
    let list = rounds.get(index);
    if (!list) {
      const timeline = timelines.get(index);
      list = timeline.ok ? timeline.steps.map((state) => stepInfo(state)) : [DEAL];
      rounds.set(index, list);
    }
    return list;
  };
  return {
    playerCount: game.playerCount,
    roundCount: game.rounds.length,
    stepCount: timelines.stepCount,
    info: (round, step) => infos(round)[step] ?? DEAL,
  };
}

/** Discards on the table in a state, called ones included (they stay in the pond, marked). */
function discardCount(state: BoardState | undefined): number {
  if (!state) {
    return 0;
  }
  let total = 0;
  for (const seat of state.seats) {
    total += seat.discards.length;
  }
  return total;
}

/**
 * The turn shown for a step, the table's go-around count: 1 + floor(discards made earlier in the
 * round / playerCount). The step's own discard is not "earlier", so a discard belongs to the turn
 * of its draw. The result step keeps the turn the round ended in (the step before it).
 */
export function turnNumber(
  states: readonly BoardState[],
  step: number,
  playerCount: PlayerCount,
): number {
  const at = (states[step]?.results.length ?? 0) > 0 ? step - 1 : step;
  return 1 + Math.floor(discardCount(states[at - 1]) / playerCount);
}
