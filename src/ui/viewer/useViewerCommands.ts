import { useCallback } from "react";
import type { Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { type KeyCommand, stepSpeed } from "./commands";
import type { DialogName, PlayerRow, Settings, ViewerAction, ViewerState } from "./types";
import type { ViewerStore } from "./useViewerState";

export interface ViewerCommandOptions {
  state: ViewerState;
  dispatch: ViewerStore["dispatch"];
  navigate: ViewerStore["navigate"];
  settings: Settings;
  update(patch: Partial<Settings>): void;
  openDialog(dialog: DialogName): void;
  scoreDiff: boolean;
  toggleScoreDiff(): void;
  /** The playing seats, to name the point of view a key switched to. */
  players: readonly PlayerRow[];
  /** Puts a toast on screen and reads it out. */
  show(text: string): void;
  /** Reads words out without a toast. */
  say(text: string): void;
}

/**
 * What the viewer's keyboard shortcuts do (useViewerKeys runs the returned handler). A key that
 * changes something only the eye sees on the table (the hands, the score differences, the point
 * of view, the speed) says so to screen readers through the live region; the waits aid shows a
 * toast too, as it appears only next to visible hands.
 */
export function useViewerCommands({
  state,
  dispatch,
  navigate,
  settings,
  update,
  openDialog,
  scoreDiff,
  toggleScoreDiff,
  players,
  show,
  say,
}: ViewerCommandOptions): (command: KeyCommand, event: { repeat: boolean }) => boolean {
  const { m } = useI18n();
  const { playing } = state;

  const sayPov = useCallback(
    (action: ViewerAction) => {
      const before = state.pov;
      const seat: Seat = dispatch(action).pov;
      const player = players.find((row) => row.seat === seat);
      if (seat !== before && player) {
        say(m.tools.povButton(m.round.winds[player.wind] ?? "", player.name));
      }
    },
    [state.pov, dispatch, players, say, m],
  );

  return useCallback(
    (command, event) => {
      switch (command.type) {
        case "escape":
          // Esc stops autoplay; with nothing playing it is not ours.
          if (!playing) {
            return false;
          }
          dispatch({ type: "pause" });
          return true;
        case "nav":
          navigate(command.command, event.repeat ? "repeat" : "user");
          return true;
        case "pov":
          sayPov({ type: "setPov", seat: command.seat });
          return true;
        case "cyclePov":
          sayPov({ type: "cyclePov", delta: command.delta });
          return true;
        case "togglePlay":
          dispatch({ type: "togglePlay" });
          return true;
        case "speed": {
          const speed = stepSpeed(settings.autoplaySpeed, command.delta);
          update({ autoplaySpeed: speed });
          say(m.transport.speed(speed));
          return true;
        }
        case "toggleHands":
          update({ showAllHands: !settings.showAllHands });
          say(settings.showAllHands ? m.toast.handsHidden : m.toast.handsShown);
          return true;
        case "toggleWaits":
          update({ showWaits: !settings.showWaits });
          show(settings.showWaits ? m.toast.waitsOff : m.toast.waitsOn);
          return true;
        case "toggleScoreDiff":
          toggleScoreDiff();
          say(scoreDiff ? m.toast.scoreDiffOff : m.toast.scoreDiffOn);
          return true;
        case "help":
          openDialog("help");
          return true;
      }
    },
    [
      playing,
      dispatch,
      navigate,
      sayPov,
      settings,
      update,
      say,
      show,
      toggleScoreDiff,
      scoreDiff,
      openDialog,
      m,
    ],
  );
}
