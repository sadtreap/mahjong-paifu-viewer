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
import { ErrorMessage } from "../ErrorMessage";
import type { LogSource } from "../logSource";
import { type SampleId, sampleSource, WELCOME_SAMPLE } from "../samples";
import { HelpDialog } from "../settings/HelpDialog";
import { SettingsDialog } from "../settings/SettingsDialog";
import { useDialogs } from "../settings/useSettings";
import { parseHistoryState } from "../url/history";
import { linkLogSource, parseViewerUrl, sameLinkSource } from "../url/urlState";
import { useStartFromUrl } from "../url/useStartFromUrl";
import { type LoadStart, useLogLoader } from "../useLogLoader";
import { useWindowDrop } from "../useWindowDrop";
import { useWindowPaste } from "../useWindowPaste";
import type { LinkSource, ViewerStart } from "../viewer/types";
import { OpenDialog } from "./OpenDialog";
import { PasteDialog } from "./PasteDialog";
import styles from "./Shell.module.css";
import { Welcome } from "./Welcome";

/** What the shell gives the viewer of a loaded game. */
export interface ShellViewerProps {
  game: GameLog;
  /** Where to open it (0-based, unclamped; `pov` unchecked), or null for the start. */
  start: ViewerStart | null;
  /**
   * The link source for the address and Copy link (useHistorySync's `origin`): null for a local
   * file or pasted log data, and while the welcome card is up (a first visit keeps a bare address).
   */
  origin: LinkSource | null;
  /** useHistorySync's `newEntry`: true when this game replaced another one in the page. */
  newEntry: boolean;
  /** The stage: it takes the focus when a load replaces the control that had it. */
  focusRef: RefObject<HTMLElement | null>;
  /**
   * The welcome card for TableStage's `overlay` slot while it is up, else null. It brings its own
   * scrim. The viewer keeps the coach mark hidden while it shows.
   */
  welcome: ReactNode | null;
  /** The viewer calls this on the first table step while the welcome card is up (it dismisses it). */
  onDismissWelcome(): void;
}

export interface ShellProps {
  /** Renders the viewer of a loaded game (the shell keys it by game). */
  renderViewer(props: ShellViewerProps): ReactNode;
  /** The sample under the welcome card when the address names no log; null opens nothing. */
  welcomeSample?: SampleId | null;
}

/**
 * The app around the viewer: loading (file picker, drop and paste anywhere, samples, Tenhou links,
 * `?sample=` and `?tenhou=` addresses), the welcome card on a first visit (over the four-player
 * sample, or over an empty table when that cannot load), Back and Forward to another game's
 * address, and the app dialogs (settings, help, paste, open). Must be inside SettingsProvider.
 */
export function Shell({ renderViewer, welcomeSample = WELCOME_SAMPLE }: ShellProps) {
  const { m } = useI18n();
  const loader = useLogLoader();
  const { game, gameKey, load, origin, error, loading, dismissError } = loader;
  const { dialog, openDialog, closeDialog } = useDialogs();
  const focusRef = useRef<HTMLElement>(null);
  // Set when a load starts while a control has the focus: the control usually goes away with the
  // view (the welcome card, a dialog, the previous game's viewer), so the new view takes the focus.
  const moveFocus = useRef(false);
  // Whether the next game's first history entry is pushed (it replaces a game) or replaces.
  const [pushNext, setPushNext] = useState(false);
  const { welcome: startWelcome } = useStartFromUrl(load, { fallbackSample: welcomeSample });
  const [welcomeOpen, setWelcomeOpen] = useState(startWelcome);
  const hasGame = game !== null;

  const loadFromUser = useCallback(
    async (source: LogSource, start: LoadStart | null = null, link: LinkSource | null = null) => {
      moveFocus.current = !focusIsLost();
      setPushNext(hasGame);
      if (await load(source, start, link)) {
        setWelcomeOpen(false);
      }
    },
    [load, hasGame],
  );
  const onSource = useCallback((source: LogSource) => void loadFromUser(source), [loadFromUser]);
  const dragging = useWindowDrop(onSource);
  useWindowPaste(onSource);

  const onSample = useCallback(
    (id: SampleId) => {
      const link: LinkSource = { kind: "sample", id };
      if (hasGame && sameLinkSource(origin, link)) {
        // That sample is already on the table (under the welcome card): just show it.
        setWelcomeOpen(false);
        return;
      }
      void loadFromUser(sampleSource(id), null, link);
    },
    [hasGame, origin, loadFromUser],
  );

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
      void load(linkLogSource(link.source), state ?? link.start, link.source);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [load]);

  // A load that fails while a game is shown reports in the Open dialog (with the ways to retry).
  useEffect(() => {
    if (error && hasGame && !welcomeOpen) {
      openDialog("open");
    }
  }, [error, hasGame, welcomeOpen, openDialog]);

  const lastGameKey = useRef(gameKey);
  useEffect(() => {
    if (lastGameKey.current === gameKey) {
      return;
    }
    lastGameKey.current = gameKey;
    if (moveFocus.current && focusIsLost()) {
      focusRef.current?.focus();
    }
    moveFocus.current = false;
  }, [gameKey]);

  // The welcome card went away with the focus inside it: hand the focus to the stage.
  useEffect(() => {
    if (!welcomeOpen && focusIsLost()) {
      focusRef.current?.focus();
    }
  }, [welcomeOpen]);

  const errorMessage = error ? <ErrorMessage error={error} onDismiss={dismissError} /> : null;
  const welcomeCard = (canExplore: boolean) => (
    <Welcome
      loading={loading}
      error={errorMessage}
      canExplore={canExplore}
      onOpenFile={(file) => void loadFromUser({ kind: "file", file })}
      onPaste={() => openDialog("paste")}
      onSample={onSample}
      onDismiss={() => setWelcomeOpen(false)}
    />
  );
  const fromDialog = (source: LogSource, link: LinkSource | null = null) => {
    // Close first: the focus goes back to the opener, and on to the stage once the game loads.
    closeDialog();
    void loadFromUser(source, null, link);
  };

  return (
    <>
      {game ? (
        <Fragment key={gameKey}>
          {renderViewer({
            game,
            start: loader.start,
            origin: welcomeOpen ? null : origin,
            newEntry: pushNext,
            focusRef,
            welcome: welcomeOpen ? welcomeCard(true) : null,
            onDismissWelcome: () => setWelcomeOpen(false),
          })}
        </Fragment>
      ) : (
        <div className={styles.empty} data-scene="player">
          <div className={styles.room}>{welcomeCard(false)}</div>
        </div>
      )}
      {loading && hasGame && !welcomeOpen && dialog !== "open" && (
        <p className={styles.toast} role="status">
          {m.load.loading}
        </p>
      )}
      <SettingsDialog open={dialog === "settings"} onClose={closeDialog} />
      <HelpDialog open={dialog === "help"} onClose={closeDialog} />
      <PasteDialog
        open={dialog === "paste"}
        onClose={closeDialog}
        loading={loading}
        onText={(text) => fromDialog({ kind: "text", text })}
      />
      <OpenDialog
        open={dialog === "open"}
        onClose={() => {
          closeDialog();
          dismissError();
        }}
        loading={loading}
        error={errorMessage}
        onFile={(file) => fromDialog({ kind: "file", file })}
        onText={(text) => fromDialog({ kind: "text", text })}
        onSample={(id) => fromDialog(sampleSource(id), { kind: "sample", id })}
      />
      {dragging && <DropOverlay />}
    </>
  );
}
