import { useCallback, useMemo, useRef, useState } from "react";
import type {
  NavCommand,
  NavSource,
  StepIndex,
  ViewerAction,
  ViewerStart,
  ViewerState,
} from "./types";
import { createViewerReducer, initialViewerState } from "./viewerReducer";

export interface ViewerStore {
  state: ViewerState;
  /** Applies an action now and returns the new state (the same object when nothing changed). */
  dispatch(action: ViewerAction): ViewerState;
  /** A navigation command; false when it did not move (a limit or a hard stop). */
  navigate(command: NavCommand, source: NavSource): boolean;
}

/**
 * The viewer reducer with a synchronous result, so input hooks can stop repeating the moment a
 * navigation goes nowhere (the hard stop at a round's end). Mount one per game (key the viewer by
 * the game): the step index is read once, when the store is created.
 */
export function useViewerState(ix: StepIndex, start: ViewerStart | null): ViewerStore {
  const reducer = useMemo(() => createViewerReducer(ix), [ix]);
  const [state, setState] = useState(() => initialViewerState(start, ix));
  const latest = useRef(state);

  const dispatch = useCallback(
    (action: ViewerAction) => {
      const next = reducer(latest.current, action);
      if (next !== latest.current) {
        latest.current = next;
        setState(next);
      }
      return next;
    },
    [reducer],
  );

  const navigate = useCallback(
    (command: NavCommand, source: NavSource) => {
      const before = latest.current.position;
      return dispatch({ type: "nav", command, source }).position !== before;
    },
    [dispatch],
  );

  return { state, dispatch, navigate };
}
