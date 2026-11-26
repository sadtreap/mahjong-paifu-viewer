import type { GameLog, PlayerCount, Round, RoundEvent } from "../../core/model";
import type { BoardState } from "../../replay/types";
import type { TimelineCache } from "../timelineCache";
import type { StepIndex, StepInfo, StepKind } from "./types";

const DEAL: StepInfo = Object.freeze({
  kind: "deal",
  seat: null,
  tsumogiri: false,
  doraReveal: false,
});

/** Events that fold into the step before them (see buildTimeline), besides the extra rons. */
function folds(event: RoundEvent | undefined): boolean {
  return event?.type === "dora" || event?.type === "riichiAccepted" || event?.type === "win";
}

/** Whether the step applied a dora reveal folded after its main event. */
function revealsDora(round: Round, state: BoardState): boolean {
  const main = state.lastEvent;
  for (let index = state.eventIndex; index >= 0; index--) {
    const event = round.events[index];
    if (event === main || !folds(event)) {
      return false;
    }
    if (event?.type === "dora") {
      return true;
    }
  }
  return false;
}

/** What a replay step is about: its kind, its seat, and whether it was a tsumogiri or showed a new dora. */
export function stepInfo(round: Round, state: BoardState): StepInfo {
  const event = state.lastEvent;
  if (event === null) {
    return DEAL;
  }
  const seat = state.activeSeat;
  const doraReveal = revealsDora(round, state);
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
      return { kind: "deal", seat: null, tsumogiri: false, doraReveal: true };
    case "riichiAccepted":
      kind = "deal";
      break;
  }
  return { kind, seat, tsumogiri, doraReveal };
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
      const round = game.rounds[index];
      list = timeline.ok && round ? timeline.steps.map((state) => stepInfo(round, state)) : [DEAL];
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
 * The turn shown for a step: 1 + floor(discards made earlier in the round / playerCount). The
 * step's own discard is not "earlier", so a discard belongs to the turn of its draw.
 */
export function turnNumber(
  states: readonly BoardState[],
  step: number,
  playerCount: PlayerCount,
): number {
  return 1 + Math.floor(discardCount(states[step - 1]) / playerCount);
}
