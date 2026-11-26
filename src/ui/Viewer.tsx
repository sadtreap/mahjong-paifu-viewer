import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Quad, Seat } from "../core/model";
import { activeSeats } from "../core/players";
import { useI18n } from "../i18n/context";
import type { BoardState } from "../replay/types";
import { drawWaits, nextDiscard as nextDiscardOf, plateAid, riichiLines } from "./analysis/aids";
import { discardIndex } from "./analysis/discardIndex";
import { doraKinds, unseenCounts } from "./analysis/hand";
import { panelModeFor } from "./breakpoints";
import { Dock } from "./controls/Dock";
import { MoreMenu } from "./controls/MoreMenu";
import { focusIsLost } from "./dom";
import { useStageGestures } from "./input/useStageGestures";
import { useWheelStep } from "./input/useWheelStep";
import {
  playerNames,
  resultSummary,
  roundLabel,
  roundShortLabel,
  rulesLabel,
  sourceLabel,
} from "./labels";
import { navLimits, type Position } from "./navigation";
import { roundMatrix } from "./panels/matrix";
import { movesOf } from "./panels/moves";
import { playerRows } from "./panels/players";
import { ResultCard, ResultCollapsed } from "./panels/ResultCard";
import { ReviewPanel } from "./panels/ReviewPanel";
import { finalScores, scoreSeries } from "./panels/scoreHistory";
import { revealedSeats, withRevealedHands } from "./reveal";
import { useSettings } from "./settings/useSettings";
import { FirstUseHint, FirstUseLegend, useFirstUseHint } from "./shell/FirstUseHint";
import type { ShellViewerProps } from "./shell/Shell";
import { StageTools } from "./shell/StageTools";
import { describeStep } from "./steps";
import { captionsFor } from "./table/captions";
import { platesFor } from "./table/geometry";
import { Hud } from "./table/Hud";
import { motionFor } from "./table/motion";
import { TableStage } from "./table/TableStage";
import { useSpotlight } from "./table/useSpotlight";
import { preloadTileImages } from "./tileAssets";
import { Timeline } from "./timeline/Timeline";
import { gameOverview, laneOrder, povMarks, roundMarks } from "./timeline/timelineModel";
import { createTimelineCache } from "./timelineCache";
import { copyLink } from "./url/clipboard";
import { useHistorySync } from "./url/useHistorySync";
import { useBreakpoint } from "./useBreakpoint";
import styles from "./Viewer.module.css";
import { escapeAction, type KeyCommand, stepSpeed } from "./viewer/commands";
import { createStepIndex, turnNumber } from "./viewer/stepIndex";
import type { Dir, DiscardRef, MoveKind, NavCommand, NavSource } from "./viewer/types";
import { useAutoplay } from "./viewer/useAutoplay";
import { useQuietStatus } from "./viewer/useQuietStatus";
import { useViewerKeys } from "./viewer/useViewerKeys";
import { useViewerState } from "./viewer/useViewerState";

export type ViewerProps = ShellViewerProps;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") {
    return () => {};
  }
  const list = window.matchMedia(REDUCED_MOTION);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function reducedMotionNow(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

/** The user asks for less motion: flights and the reveal stay off (captions show statically). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false);
}

/** Moves that count as the first table step: they dismiss the welcome card and the coach mark. */
const TABLE_MOVES: ReadonlySet<MoveKind> = new Set(["step", "repeat", "jump", "scrub", "autoplay"]);

/** How long an announcement ("Link copied") stays in the status line. */
const ANNOUNCEMENT_MS = 4000;

const EMPTY_UNSEEN = new Uint8Array(34);

/**
 * The replay of a loaded game (SPEC-v2 §1, §6.1): the dark player scene (the 3D table with its
 * HUD and toolbar, and the dock with the status line, the timeline bands and the transport) and
 * the review rail beside it (a column on wide screens, a side sheet on laptops and phones in
 * landscape, inline below in portrait). The viewer state lives in one reducer; settings, history
 * and the breakpoint come from their hooks, and everything else is derived per game, round and step.
 */
export function Viewer({
  game,
  start,
  origin,
  newEntry,
  focusRef,
  welcome,
  onDismissWelcome,
}: ViewerProps) {
  const { m, locale } = useI18n();
  const { settings, update, openDialog } = useSettings();
  const breakpoint = useBreakpoint();
  const panelMode = panelModeFor(breakpoint);
  const reducedMotion = usePrefersReducedMotion();
  const playerCount = game.playerCount;

  // ---- per game
  const timelines = useMemo(() => createTimelineCache(game.rounds, game.playerCount), [game]);
  const ix = useMemo(() => createStepIndex(game, timelines), [game, timelines]);
  const { state: vs, dispatch, navigate } = useViewerState(ix, start);
  const names = useMemo(() => playerNames(m, game.players), [m, game.players]);
  const overview = useMemo(
    () => gameOverview(game, ix, m, names, locale),
    [game, ix, m, names, locale],
  );
  const matrix = useMemo(
    () => roundMatrix(game, overview, timelines, ix),
    [game, overview, timelines, ix],
  );
  const series = useMemo(() => scoreSeries(game), [game]);
  const final = useMemo(() => finalScores(game), [game]);
  const seats = useMemo(() => activeSeats(playerCount), [playerCount]);
  const roundNames = useMemo(() => game.rounds.map((r) => roundLabel(m, r)), [game, m]);
  const title = rulesLabel(m, game.rules, playerCount);

  useEffect(() => {
    preloadTileImages();
  }, []);

  // ---- per round
  const { position, pov } = vs;
  const round = game.rounds[position.round] ?? game.rounds[0];
  const timeline = timelines.get(position.round);
  const states = useMemo<readonly BoardState[]>(
    () => (timeline.ok ? timeline.steps : []),
    [timeline],
  );
  const discards = useMemo(
    () => (round ? discardIndex(round, states, playerCount) : { get: () => undefined }),
    [round, states, playerCount],
  );
  const marks = useMemo(
    () => (round ? roundMarks(round, states, ix, position.round) : { marks: [], riichiFrom: {} }),
    [round, states, ix, position.round],
  );
  const moves = useMemo(
    () => (round ? movesOf(round, states, ix, position.round) : []),
    [round, states, ix, position.round],
  );
  const lines = useMemo(
    () => (round ? riichiLines(round, states, playerCount) : []),
    [round, states, playerCount],
  );

  // ---- per point of view
  const lanes = useMemo(() => laneOrder(pov, playerCount), [pov, playerCount]);
  const marksOfPov = useMemo(() => povMarks(game, overview, pov), [game, overview, pov]);

  // ---- per step
  const raw = states[position.step] ?? null;
  const prevRaw = states[position.step - 1] ?? raw;
  // At the round end the table shows the hands the result reveals, even where the log hid them.
  const board = useMemo<BoardState | null>(
    () =>
      raw && raw.results.length > 0
        ? { ...raw, seats: withRevealedHands(raw.seats, raw.results) }
        : raw,
    [raw],
  );
  const results = board?.results ?? [];
  const atResult = results.length > 0;
  const showAll = settings.showAllHands;
  const revealed = useMemo(() => revealedSeats(pov, showAll, results), [pov, showAll, results]);
  const revealedBefore = useMemo(
    () => revealedSeats(pov, showAll, prevRaw?.results ?? []),
    [pov, showAll, prevRaw],
  );
  const speed = settings.autoplaySpeed;
  const motionOn = settings.motion && !reducedMotion;
  const motion = useMemo(
    () =>
      round && raw && prevRaw
        ? motionFor(round, prevRaw, raw, vs.lastMove, speed, {
            motion: motionOn,
            revealedBefore,
            revealedNow: revealed,
            pov,
          })
        : { flight: null, reveal: [] },
    [round, raw, prevRaw, vs.lastMove, speed, motionOn, revealedBefore, revealed, pov],
  );
  const captions = useMemo(
    () => (round && raw && settings.captions ? captionsFor(round, raw, vs.lastMove, speed) : []),
    [round, raw, settings.captions, vs.lastMove, speed],
  );
  const showWaits = settings.showWaits;
  const plates = useMemo(
    () =>
      round && board
        ? platesFor({
            playerCount,
            dealer: round.dealer,
            seats: board.seats,
            names,
            pov,
            aid: (seat) =>
              showWaits
                ? plateAid(board, seat, { pov, revealed: revealed.has(seat), playerCount })
                : null,
          })
        : [],
    [round, board, playerCount, names, pov, revealed, showWaits],
  );
  const nextDiscard = settings.showNextDiscard ? nextDiscardOf(states, position.step, pov) : null;
  const players = useMemo(
    () => (round ? playerRows(m, game, round, board, names) : []),
    [m, game, round, board, names],
  );
  const unseen = useMemo(
    () => (board ? unseenCounts(board, pov, playerCount) : EMPTY_UNSEEN),
    [board, pov, playerCount],
  );
  const doraSet = useMemo(
    () => doraKinds(board?.doraIndicators ?? [], playerCount),
    [board, playerCount],
  );
  const spotlight = useSpotlight(vs.pickedKind);
  const quiet = useQuietStatus(vs);
  const stepCount = timelines.stepCount(position.round);
  const turn = turnNumber(states, position.step, playerCount);

  // ---- refs, local UI state
  const dockRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLTableRowElement>(null);
  const panelId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  // The sheet exists on laptops and phones in landscape only: leaving that layout closes it, so a
  // stale flag neither takes the next Esc nor pops the sheet open on the way back.
  if (sheetOpen && panelMode !== "sheet") {
    setSheetOpen(false);
  }
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [roundListRequest, setRoundListRequest] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // The control that last had the focus inside the viewer: when a step unmounts it (the result
  // card's buttons, the Show result chip, a hidden Moves row), the stage takes the focus.
  const lastFocused = useRef<Element | null>(null);

  const panelOpen =
    panelMode === "column" ? settings.panelOpen : panelMode === "sheet" ? sheetOpen : true;
  const docked = panelMode === "column" && settings.panelOpen;

  // ---- history and the address
  const restore = useCallback(
    (p: Position, seat: Seat) =>
      dispatch({ type: "seek", position: p, kind: "history", pov: seat }),
    [dispatch],
  );
  const history = useHistorySync({
    origin,
    position,
    pov,
    moveKind: vs.lastMove.kind,
    newEntry,
    onRestore: restore,
  });

  // ---- navigation entry points
  const seek = useCallback(
    (p: Position, kind: "jump" | "scrub" = "jump") => {
      dispatch({ type: "seek", position: p, kind });
    },
    [dispatch],
  );
  const onStep = useCallback(
    (dir: Dir, o: { ownTurn: boolean; source: NavSource }) =>
      navigate(o.ownTurn ? { kind: "ownTurn", dir } : { kind: "step", dir }, o.source),
    [navigate],
  );
  const onPick = useCallback((kind: number | null) => dispatch({ type: "pick", kind }), [dispatch]);
  const onPov = useCallback((seat: Seat) => dispatch({ type: "setPov", seat }), [dispatch]);
  const onPondDwell = useCallback(
    (ref: DiscardRef | null) => dispatch({ type: "pin", ref }),
    [dispatch],
  );
  const onPondJump = useCallback(
    (ref: DiscardRef) => {
      const info = discards.get(ref);
      if (info) {
        seek({ round: position.round, step: info.decisionStep });
      }
    },
    [discards, seek, position.round],
  );
  const openRoundList = useCallback(() => {
    if (panelMode === "column") {
      update({ panelOpen: true });
    } else if (panelMode === "sheet") {
      setSheetOpen(true);
    }
    setRoundListRequest((n) => n + 1);
  }, [panelMode, update]);

  // The round list: focus the current matrix row once the rail shows it.
  useEffect(() => {
    if (roundListRequest === 0) {
      return;
    }
    const button = currentRowRef.current?.querySelector("button");
    button?.focus({ preventScroll: true });
    button?.scrollIntoView?.({ block: panelMode === "inline" ? "center" : "nearest" });
  }, [roundListRequest, panelMode]);

  const announce = useCallback((text: string) => setAnnouncement(text), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: any move ends the announcement
  useEffect(() => {
    setAnnouncement(null);
  }, [position, pov]);
  useEffect(() => {
    if (announcement === null) {
      return;
    }
    const timer = window.setTimeout(() => setAnnouncement(null), ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const onCopyLink = useCallback(() => {
    void copyLink(history.link()).then((result) => {
      announce(
        result === "copied"
          ? m.app.linkCopied
          : result === "unavailable"
            ? m.app.linkUnavailable
            : m.app.linkCopyFailed,
      );
    });
  }, [history, announce, m]);

  const toggleHands = useCallback(
    () => update({ showAllHands: !settings.showAllHands }),
    [update, settings.showAllHands],
  );
  const toggleView = useCallback(
    () => update({ view: settings.view === "3d" ? "flat" : "3d" }),
    [update, settings.view],
  );
  const togglePanel = useCallback(() => {
    if (panelMode === "column") {
      update({ panelOpen: !settings.panelOpen });
    } else if (panelMode === "sheet") {
      setSheetOpen((open) => !open);
    }
  }, [panelMode, update, settings.panelOpen]);

  // ---- the welcome card and the coach mark go on the first table step
  const coach = useFirstUseHint();
  const showCoach = coach.show && welcome === null;
  const lastMoveSeen = useRef(vs.lastMove);
  const dismissers = useRef({ welcome, onDismissWelcome, coach });
  dismissers.current = { welcome, onDismissWelcome, coach };
  useEffect(() => {
    if (lastMoveSeen.current === vs.lastMove) {
      return;
    }
    lastMoveSeen.current = vs.lastMove;
    if (!TABLE_MOVES.has(vs.lastMove.kind)) {
      return;
    }
    const current = dismissers.current;
    if (current.welcome !== null) {
      current.onDismissWelcome();
    }
    current.coach.dismiss();
  }, [vs.lastMove]);

  // ---- result card
  const hideResult = useCallback(() => dispatch({ type: "hideResult" }), [dispatch]);
  const nextRound = useCallback(() => navigate({ kind: "nextRound" }, "user"), [navigate]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const onFocusIn = (event: FocusEvent) => {
      lastFocused.current = event.target instanceof Element ? event.target : null;
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, []);
  useEffect(() => {
    const last = lastFocused.current;
    if (last !== null && !last.isConnected && focusIsLost()) {
      lastFocused.current = null;
      focusRef.current?.focus({ preventScroll: true });
    }
  });

  // ---- keys
  const keyContext = useRef({ sheetOpen, showCoach, atResult, vs, welcome, history, coach });
  keyContext.current = { sheetOpen, showCoach, atResult, vs, welcome, history, coach };
  const onCommand = useCallback(
    (command: KeyCommand, event: { repeat: boolean }): boolean | undefined => {
      const ctx = keyContext.current;
      switch (command.type) {
        case "nav":
          navigate(command.command, event.repeat ? "repeat" : "user");
          return true;
        case "pov":
          dispatch({ type: "setPov", seat: command.seat });
          return true;
        case "cyclePov":
          dispatch({ type: "cyclePov", delta: command.delta });
          return true;
        case "togglePlay":
          dispatch({ type: "togglePlay" });
          return true;
        case "speed":
          update({ autoplaySpeed: stepSpeed(speed, command.delta) });
          return true;
        case "toggleHands":
          toggleHands();
          return true;
        case "toggleView":
          toggleView();
          return true;
        case "rounds":
          openRoundList();
          return true;
        case "help":
          openDialog("help");
          return true;
        case "back":
          if (ctx.history.back === null) {
            return false;
          }
          ctx.history.goBack();
          return true;
        case "escape": {
          if (ctx.welcome !== null) {
            // The welcome card handles Esc itself.
            return false;
          }
          const action = escapeAction({
            menuOpen: false,
            sheetOpen: ctx.sheetOpen,
            coach: ctx.showCoach,
            resultShown: ctx.atResult && !ctx.vs.resultHidden,
            picked: ctx.vs.pickedKind !== null,
            playing: ctx.vs.playing,
          });
          switch (action) {
            case "closeSheet":
              setSheetOpen(false);
              return true;
            case "dismissCoach":
              ctx.coach.dismiss();
              return true;
            case "hideResult":
              hideResult();
              return true;
            case "clearPick":
              dispatch({ type: "pick", kind: null });
              return true;
            case "pause":
              dispatch({ type: "pause" });
              return true;
            default:
              return false;
          }
        }
      }
    },
    [
      navigate,
      dispatch,
      update,
      speed,
      toggleHands,
      toggleView,
      openRoundList,
      openDialog,
      hideResult,
    ],
  );
  useViewerKeys({ charKeys: settings.charKeys, onCommand });

  // ---- pointer, wheel and autoplay
  useStageGestures(focusRef, { enabled: settings.clickToStep, onStep });
  useWheelStep([focusRef, dockRef], { enabled: settings.wheelToStep, onStep });
  const onTick = useCallback(() => navigate({ kind: "step", dir: 1 }, "autoplay"), [navigate]);
  const onStop = useCallback(() => dispatch({ type: "pause" }), [dispatch]);
  useAutoplay({ playing: vs.playing, position, ix, speed, onTick, onStop });

  // ---- what the parts show
  const summary = useMemo(
    () => (atResult ? resultSummary(m, results, names, locale) : ""),
    [atResult, m, results, names, locale],
  );
  const statusText =
    round && board
      ? atResult
        ? m.transport.resultPrefix + summary
        : describeStep(m, round, board, names, (seat) => revealed.has(seat))
      : m.errors.replayFailed;
  const back = history.back;
  const backTarget = useMemo(() => {
    if (back === null) {
      return null;
    }
    const target = game.rounds[back.round];
    if (!target) {
      return null;
    }
    const steps = timelines.get(back.round);
    const backTurn = steps.ok ? turnNumber(steps.steps, back.step, playerCount) : 1;
    return { label: m.transport.backLabel(roundShortLabel(m, target), backTurn) };
  }, [back, game, timelines, playerCount, m]);

  const pinInfo = vs.pin ? discards.get(vs.pin) : undefined;
  const pin =
    vs.pin && pinInfo
      ? {
          ref: vs.pin,
          step: pinInfo.step,
          label: m.timeline.pinLabel(names[vs.pin.seat], vs.pin.index + 1),
        }
      : null;
  const onPinJump = useCallback(() => {
    if (pinInfo) {
      seek({ round: position.round, step: pinInfo.decisionStep });
    }
  }, [pinInfo, seek, position.round]);
  // The slider's value text follows the status line's reveal rule (no hidden draws read out).
  const describe = useCallback(
    (step: number) => {
      const state = states[step];
      if (!round || !state) {
        return "";
      }
      const shown = revealedSeats(pov, showAll, state.results);
      return describeStep(m, round, state, names, (seat) => shown.has(seat));
    },
    [states, round, m, names, pov, showAll],
  );
  const turnOf = useCallback(
    (step: number) => turnNumber(states, step, playerCount),
    [states, playerCount],
  );
  const onScrubEnd = useCallback(() => {}, []);

  const isLastRound = position.round === game.rounds.length - 1;
  let card: ReactNode = null;
  if (round && board && atResult && !vs.resultHidden) {
    card = (
      <ResultCard
        results={results}
        seats={board.seats}
        names={names}
        playerCount={playerCount}
        final={isLastRound ? final : null}
        startScores={round.scores}
        riichiLines={lines}
        drawWaits={drawWaits(results, board.seats, playerCount)}
        doraIndicators={board.doraIndicators}
        mode={docked ? "docked" : "overlay"}
        onHide={hideResult}
        onNextRound={nextRound}
      />
    );
  }
  const dockedResult = docked
    ? (card ??
      (atResult ? (
        <ResultCollapsed summary={summary} onShow={() => dispatch({ type: "showResult" })} />
      ) : null))
    : null;
  const overlay = welcome ?? (docked ? null : card);
  const legend: ReactNode = showCoach ? (
    coach.compact ? (
      <FirstUseHint pointer={coach.pointer} compact onDismiss={coach.dismiss} />
    ) : (
      <FirstUseLegend />
    )
  ) : null;

  const navOf = useCallback(
    (command: NavCommand, source: Exclude<NavSource, "autoplay">) => navigate(command, source),
    [navigate],
  );

  return (
    <div
      ref={rootRef}
      className={styles.app}
      data-panel={panelMode === "column" ? (settings.panelOpen ? "open" : "closed") : panelMode}
    >
      {welcome === null && <h1 className="sr-only">{m.app.title}</h1>}
      <div className={styles.player} data-scene="player">
        {round && board ? (
          <TableStage
            game={game}
            round={round}
            state={board}
            names={names}
            pov={pov}
            revealed={revealed}
            view={settings.view}
            walls={!showAll}
            dimTsumogiri={settings.dimTsumogiri}
            plates={plates}
            nextDiscard={nextDiscard}
            captions={captions}
            motion={motion}
            discards={discards}
            spotlight={spotlight}
            pickedKind={vs.pickedKind}
            onRoundList={openRoundList}
            onPondDwell={onPondDwell}
            onPondJump={onPondJump}
            stageRef={focusRef}
            coach={
              showCoach && !coach.compact ? (
                <FirstUseHint pointer={coach.pointer} compact={false} onDismiss={coach.dismiss} />
              ) : undefined
            }
            overlay={overlay}
          />
        ) : (
          <section
            ref={focusRef}
            className={styles.failed}
            aria-label={m.board.table}
            tabIndex={-1}
          >
            {/* Not a live region: the status line announces the failure (its only live region). */}
            <p>{m.errors.replayFailed}</p>
            {welcome}
          </section>
        )}
        <Dock
          rootRef={dockRef}
          status={{
            text: statusText,
            quiet,
            announcement,
            counter: m.transport.counter(position.step + 1, stepCount),
            legend,
          }}
          back={backTarget}
          onBack={history.goBack}
          onShowResult={
            !docked && atResult && vs.resultHidden && welcome === null
              ? () => dispatch({ type: "showResult" })
              : null
          }
          transport={{
            roundName: round ? roundLabel(m, { ...round, honba: 0 }) : "",
            turn,
            limits: navLimits(position, ix),
            playing: vs.playing,
            speed,
            breakpoint,
            onNav: navOf,
            onTogglePlay: () => dispatch({ type: "togglePlay" }),
            onSpeed: (value) => update({ autoplaySpeed: value }),
            onRoundList: openRoundList,
          }}
          bands={
            <Timeline
              overview={overview}
              position={position}
              marks={marks}
              povMarks={marksOfPov}
              laneOrder={lanes}
              pov={pov}
              names={names}
              describe={describe}
              turnOf={turnOf}
              pin={pin}
              onPinJump={onPinJump}
              onSeek={seek}
              onScrubEnd={onScrubEnd}
            />
          }
        />
        <StageTools
          breakpoint={breakpoint}
          showAllHands={showAll}
          view={settings.view}
          panelOpen={panelOpen}
          linkable={origin !== null}
          players={players}
          pov={pov}
          onPov={onPov}
          onOpenLog={() => openDialog("open")}
          onCopyLink={onCopyLink}
          onToggleHands={toggleHands}
          onToggleView={toggleView}
          onSettings={() => openDialog("settings")}
          onHelp={() => openDialog("help")}
          onTogglePanel={togglePanel}
          panelId={panelId}
          menu={(slot) => (
            <MoreMenu
              {...slot}
              linkable={origin !== null}
              speed={speed}
              showAllHands={showAll}
              view={settings.view}
              onOpenLog={() => openDialog("open")}
              onCopyLink={onCopyLink}
              onSpeed={(value) => update({ autoplaySpeed: value })}
              onNav={(command) => navigate(command, "user")}
              onToggleHands={toggleHands}
              onToggleView={toggleView}
              onSettings={() => openDialog("settings")}
              onHelp={() => openDialog("help")}
            />
          )}
        />
        {board && (
          <div className={styles.hud}>
            <Hud
              doraIndicators={board.doraIndicators}
              honba={board.honba}
              riichiSticks={board.riichiSticks}
              ruleLabel={title}
            />
          </div>
        )}
      </div>
      <div id={panelId} className={styles.rail} hidden={!panelOpen}>
        <ReviewPanel
          mode={panelMode}
          open={panelOpen}
          onClose={() => {
            if (panelMode === "column") {
              update({ panelOpen: false });
            } else {
              setSheetOpen(false);
            }
          }}
          title={title}
          source={sourceLabel(m, locale, game)}
          result={dockedResult}
          players={players}
          onPov={onPov}
          pov={pov}
          povName={names[pov]}
          unseen={unseen}
          playerCount={playerCount}
          doraKinds={doraSet}
          picked={vs.pickedKind}
          onPick={onPick}
          spotlight={spotlight}
          series={series}
          seats={seats}
          names={names as Quad<string>}
          matrix={matrix}
          final={final}
          currentRound={position.round}
          currentRowRef={currentRowRef}
          roundNames={roundNames}
          moves={moves}
          currentStep={position.step}
          movesOpen={settings.movesOpen}
          onMovesOpen={(open) => update({ movesOpen: open })}
          movesShowRest={settings.movesShowRest}
          onMovesShowRest={(show) => update({ movesShowRest: show })}
          onSeek={seek}
        />
      </div>
    </div>
  );
}
