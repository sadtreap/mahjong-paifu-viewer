import type { Seat } from "../../core/model";
import { isActiveSeat, nextSeat, previousSeat } from "../../core/players";
import {
  clampPosition,
  isGameEnd,
  isRoundEnd,
  type Position,
  resolveNav,
  samePosition,
} from "../navigation";
import type {
  MoveKind,
  NavCommand,
  NavSource,
  StepIndex,
  ViewerAction,
  ViewerStart,
  ViewerState,
} from "./types";

/** Commands that are jumps (a history entry), as opposed to stepping (own turns included). */
function isJump(command: NavCommand): boolean {
  return command.kind !== "step" && command.kind !== "ownTurn";
}

/** Rounds and steps in one ordering: positive when `to` comes after `from`. */
function direction(from: Position, to: Position): -1 | 0 | 1 {
  if (to.round !== from.round) {
    return to.round > from.round ? 1 : -1;
  }
  return to.step === from.step ? 0 : to.step > from.step ? 1 : -1;
}

/** Exactly one step apart within a round, or a round's last step and the next round's start. */
function isSingleStep(from: Position, to: Position, ix: StepIndex): boolean {
  if (from.round === to.round) {
    return Math.abs(to.step - from.step) === 1;
  }
  const [a, b] = to.round > from.round ? [from, to] : [to, from];
  return b.round === a.round + 1 && b.step === 0 && isRoundEnd(a, ix);
}

/**
 * The move a navigation made. A "step" with dir ±1 is a single step (the only kind motion and
 * captions follow); an own-turn skip over several steps is a "step" with dir 0, which history
 * treats like a step (replaceState) and motion ignores.
 */
function moveOf(
  command: NavCommand,
  source: NavSource,
  from: Position,
  to: Position,
  ix: StepIndex,
): ViewerState["lastMove"] {
  const dir = direction(from, to);
  if (source === "autoplay") {
    return { kind: "autoplay", dir };
  }
  if (source === "repeat") {
    return { kind: "repeat", dir };
  }
  if (isJump(command)) {
    return { kind: "jump", dir };
  }
  return { kind: "step", dir: isSingleStep(from, to, ix) ? dir : 0 };
}

function moved(
  state: ViewerState,
  position: Position,
  lastMove: ViewerState["lastMove"],
  playing: boolean,
): ViewerState {
  return { ...state, position, lastMove, playing };
}

function paused(state: ViewerState): ViewerState {
  return state.playing ? { ...state, playing: false } : state;
}

/**
 * The viewer's state machine. Pure; returns the same object when an action changes nothing, so
 * callers can tell whether a navigation moved.
 *
 * - Manual navigation (`user` and `repeat` sources, seeks) pauses autoplay; `autoplay` navigation
 *   keeps playing and pauses on landing at a round's last step, or when it cannot move.
 * - Play at a round's last step (not the game's) goes on to the next round and keeps playing.
 */
export function createViewerReducer(
  ix: StepIndex,
): (state: ViewerState, action: ViewerAction) => ViewerState {
  const playing = (seat: Seat) => isActiveSeat(seat, ix.playerCount);

  const startPlaying = (state: ViewerState): ViewerState => {
    if (state.playing || isGameEnd(state.position, ix)) {
      return state;
    }
    if (isRoundEnd(state.position, ix)) {
      const position = { round: state.position.round + 1, step: 0 };
      return moved(state, position, { kind: "step", dir: 1 }, true);
    }
    return { ...state, playing: true };
  };

  return (state, action) => {
    switch (action.type) {
      case "nav": {
        const { command, source } = action;
        const target = resolveNav(state.position, command, ix, {
          pov: state.pov,
          repeat: source !== "user",
        });
        if (target === null || samePosition(target, state.position)) {
          return paused(state);
        }
        const keepPlaying = source === "autoplay" && !isRoundEnd(target, ix);
        return moved(
          state,
          target,
          moveOf(command, source, state.position, target, ix),
          keepPlaying,
        );
      }
      case "seek": {
        const position = clampPosition(action.position, ix);
        const pov = action.pov !== undefined && playing(action.pov) ? action.pov : state.pov;
        if (samePosition(position, state.position)) {
          return pov === state.pov
            ? paused(state)
            : { ...paused(state), pov, lastMove: { kind: action.kind, dir: 0 } };
        }
        const lastMove: ViewerState["lastMove"] = {
          kind: action.kind,
          dir: direction(state.position, position),
        };
        return { ...moved(state, position, lastMove, false), pov };
      }
      case "setPov":
        if (!playing(action.seat) || action.seat === state.pov) {
          return state;
        }
        return { ...state, pov: action.seat, lastMove: { kind: "pov", dir: 0 } };
      case "cyclePov": {
        const step = action.delta > 0 ? nextSeat : previousSeat;
        const seat = playing(state.pov) ? step(state.pov, ix.playerCount) : 0;
        return seat === state.pov
          ? state
          : { ...state, pov: seat, lastMove: { kind: "pov", dir: 0 } };
      }
      case "play":
        return startPlaying(state);
      case "pause":
        return paused(state);
      case "togglePlay":
        return state.playing ? paused(state) : startPlaying(state);
    }
  };
}

/** The state a game opens with: the start position clamped to the game, POV 0 unless a playing seat is given. */
export function initialViewerState(start: ViewerStart | null, ix: StepIndex): ViewerState {
  const position = clampPosition({ round: start?.round ?? 0, step: start?.step ?? 0 }, ix);
  const pov = start?.pov != null && isActiveSeat(start.pov, ix.playerCount) ? start.pov : 0;
  return { position, pov, playing: false, lastMove: { kind: "init", dir: 0 } };
}

/** Move kinds that come in bursts: the live region stays quiet during them (see useQuietStatus). */
export const BURST_MOVES: ReadonlySet<MoveKind> = new Set(["repeat", "scrub", "autoplay"]);
