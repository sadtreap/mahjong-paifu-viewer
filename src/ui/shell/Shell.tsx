import {
  Fragment,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { GameLog } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { DropOverlay } from "../DropOverlay";
import { focusIsLost } from "../dom";
import type { LogSource } from "../logSource";
import { type SampleId, sampleSource } from "../samples";
import { HelpDialog } from "../settings/HelpDialog";
import { SettingsDialog } from "../settings/SettingsDialog";
import { useDialogs } from "../settings/useSettings";
import { tenhouReplayUrl } from "../tenhouLink";
import { parseHistoryState } from "../url/history";
import { linkLogSource, parseViewerUrl, sameLinkSource } from "../url/urlState";
import { useStartFromUrl } from "../url/useStartFromUrl";
import { useLogLoader } from "../useLogLoader";
import { useWindowDrop } from "../useWindowDrop";
import { useWindowPaste } from "../useWindowPaste";
import type { LinkSource, ViewerStart } from "../viewer/types";
import { Landing } from "./Landing";
import type { LoadFormProps } from "./LoadForm";
import { OpenDialog } from "./OpenDialog";
import styles from "./Shell.module.css";

/** What the shell gives the viewer of a loaded game. */
export interface ShellViewerProps {
  game: GameLog;
  /** Where to open it (0-based, unclamped; `pov` unchecked), or null for the start. */
  start: ViewerStart | null;
  /**
   * The link source for the address and Copy link (useHistorySync's `origin`): null for a local
   * file or pasted log data.
   */
  origin: LinkSource | null;
  /** useHistorySync's `newEntry`: true when this game replaced another one in the page. */
  newEntry: boolean;
  /** The stage: it takes the focus when a load replaces the control that had it. */
  focusRef: RefObject<HTMLElement | null>;
  /**
   * Words from around the viewer for its live region, the page's only one ("Downloading the log…"
   * while a bar along the page's top edge shows a download), or null.
   */
  notice: string | null;
}

export interface ShellProps {
  /** Renders the viewer of a loaded game (the shell keys it by game). */
  renderViewer(props: ShellViewerProps): ReactNode;
}

/**
 * The app around the viewer: loading (the load form, drop and paste anywhere, `?sample=` and
 * `?tenhou=` addresses), the landing card while no game is loaded, Back and Forward to another
 * game's address, and the app dialogs (open, settings, controls). A load that fails shows its
 * error in one place: on the landing card, or in the Open dialog while a game is shown. Must be
 * inside SettingsProvider.
 */
export function Shell({ renderViewer }: ShellProps) {
  const { m } = useI18n();
  const loader = useLogLoader();
  const { game, gameKey, load, origin, error, loading, dismissError, cancel } = loader;
  const { dialog, openDialog, closeDialog } = useDialogs();
  const focusRef = useRef<HTMLElement>(null);
  // Set when a load starts while a control has the focus: the control usually goes away with the
  // view (the landing card, a dialog, the previous game's viewer), so the new view takes the focus.
  const moveFocus = useRef(false);
  // Whether the next game's first history entry is pushed (it replaces a game) or replaces.
  const [pushNext, setPushNext] = useState(false);
  // Something else was opened than the log the address names (by the user, or Back and Forward).
  const [otherLoad, setOtherLoad] = useState(false);
  // The user stopped the download of the address's log.
  const [cancelled, setCancelled] = useState(false);
  const named = useStartFromUrl(load);
  const hasGame = game !== null;
  // The address's log is on its way from the first render until it loads, fails or is cancelled.
  const arriving = named !== null && !otherLoad && !cancelled && !hasGame && error === null;
  // When the address's Tenhou log did not arrive, the paste box starts with its link, so trying
  // again is one press of Open.
  const retryText =
    named?.source.kind === "tenhou" && !otherLoad
      ? tenhouReplayUrl(named.source.logId, named.start)
      : undefined;

  const loadFromUser = useCallback(
    (source: LogSource, link: LinkSource | null = null) => {
      moveFocus.current = !focusIsLost();
      setPushNext(hasGame);
      setOtherLoad(true);
      void load(source, null, link);
    },
    [load, hasGame],
  );
  const dragging = useWindowDrop(loadFromUser);
  useWindowPaste(loadFromUser);

  // Back or Forward to an address of another sample or Tenhou log: reopen it there.
  const originRef = useRef(origin);
  useEffect(() => {
    originRef.current = origin;
  });
  useEffect(() => {
    const handlePop = (event: PopStateEvent) => {
      const link = parseViewerUrl(window.location.search);
      if (!link || sameLinkSource(link.source, originRef.current)) {
        return;
      }
      const state = parseHistoryState(event.state);
      setPushNext(false);
      setOtherLoad(true);
      void load(linkLogSource(link.source), state ?? link.start, link.source);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [load]);

  // A load that fails while a game is shown reports in the Open dialog (with the ways to retry).
  useEffect(() => {
    if (error && hasGame) {
      openDialog("open");
    }
  }, [error, hasGame, openDialog]);

  // A new game is on screen: the dialog of the view it replaced closes, and then the stage takes
  // the focus if the control that had it is gone.
  const shownKey = useRef(gameKey);
  useEffect(() => {
    if (shownKey.current === gameKey) {
      return;
    }
    if (dialog !== null) {
      // This effect runs again once the dialog has closed and handed its focus back.
      closeDialog();
      return;
    }
    shownKey.current = gameKey;
    if (moveFocus.current && focusIsLost()) {
      focusRef.current?.focus();
    }
    moveFocus.current = false;
  }, [gameKey, dialog, closeDialog]);

  // A download over the game (a pasted link, Back to another game) shows as a bar, and the viewer
  // reads it out; one started from the Open dialog shows in the dialog.
  const downloadBar = loading === "download" && hasGame && dialog !== "open";

  const form: LoadFormProps = {
    loading,
    error,
    onFile: (file) => loadFromUser({ kind: "file", file }),
    onText: (text) => loadFromUser({ kind: "text", text }),
    onSample: (id: SampleId) => loadFromUser(sampleSource(id), { kind: "sample", id }),
  };

  return (
    <>
      {game ? (
        <Fragment key={gameKey}>
          {renderViewer({
            game,
            start: loader.start,
            origin,
            newEntry: pushNext,
            focusRef,
            notice: downloadBar ? m.load.downloading : null,
          })}
        </Fragment>
      ) : (
        <Landing
          arriving={arriving}
          onCancel={() => {
            setCancelled(true);
            cancel();
          }}
          initialText={retryText}
          {...form}
        />
      )}
      {downloadBar && (
        <div className={styles.download} aria-hidden="true" data-download="">
          <span className={styles.line} />
        </div>
      )}
      <SettingsDialog open={dialog === "settings"} onClose={closeDialog} />
      <HelpDialog open={dialog === "help"} onClose={closeDialog} />
      <OpenDialog
        open={dialog === "open"}
        onClose={() => {
          closeDialog();
          dismissError();
        }}
        {...form}
      />
      {dragging && <DropOverlay />}
    </>
  );
}
