import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { BoardState } from "../replay/types";
import { drawWaits, seatAid } from "./analysis/aids";
import { discardIndex } from "./analysis/discardIndex";
import { InfoChip } from "./controls/InfoChip";
import { LiveStatus } from "./controls/LiveStatus";
import { playerRows } from "./controls/players";
import { ResultLayer } from "./controls/ResultLayer";
import { gameOverview } from "./controls/roundSummary";
import { Toast } from "./controls/Toast";
import { Toolbar } from "./controls/Toolbar";
import { Transport } from "./controls/Transport";
import { focusIsLost } from "./dom";
import { useStageGestures } from "./input/useStageGestures";
import { useWheelStep } from "./input/useWheelStep";
import { playerNames, resultSummary } from "./labels";
import { navLimits, type Position } from "./navigation";
import { finalScores } from "./result/finalScores";
import { ResultCard } from "./result/ResultCard";
import { revealedSeats, withRevealedHands } from "./reveal";
import { useSettings } from "./settings/useSettings";
import type { ShellViewerProps } from "./shell/Shell";
import { describeStep } from "./steps";
import { captionsFor } from "./table/captions";
import { cameraFor, cornerVars, frameHeightFactor, tableSize } from "./table/geometry";
import { motionFor } from "./table/motion";
import { seatTagsFor } from "./table/seatTagInfo";
import { TableStage } from "./table/TableStage";
import { useSpotlight } from "./table/useSpotlight";
import { preloadTileImages } from "./tileAssets";
import { createTimelineCache } from "./timelineCache";
import { copyLink } from "./url/clipboard";
import { useHistorySync } from "./url/useHistorySync";
import { useArrangement } from "./useArrangement";
import { useMediaQuery } from "./useMediaQuery";
import { useViewportWidth } from "./useViewportWidth";
import styles from "./Viewer.module.css";
import { createStepIndex, turnNumber } from "./viewer/stepIndex";
import type { Dir, DiscardRef, NavCommand, NavSource, PopoverName, View } from "./viewer/types";
import { useAutoplay } from "./viewer/useAutoplay";
import { useQuietStatus } from "./viewer/useQuietStatus";
import { useToast } from "./viewer/useToast";
import { useViewerCommands } from "./viewer/useViewerCommands";
import { useViewerKeys } from "./viewer/useViewerKeys";
import { useViewerState } from "./viewer/useViewerState";

export type ViewerProps = ShellViewerProps;

/** The user asks for less motion: flights and the reveal stay off (captions show statically). */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * How long the result card waits after a step forward reaches the round's result, so the Ron or
 * Tsumo caption and the revealed hands are seen first.
 */
export const RESULT_DELAY_MS = 900;

/** The narrowest the page gets (Viewer.module.css); a narrower window scrolls sideways. */
const MIN_WIDTH = 320;

/**
 * How tall the table is in the stack arrangement on a stage of this width that is as tall as it
 * likes: the most height it can use, beyond which a stage only has spare room.
 */
function stackTableHeight(width: number, view: View): number {
  const tall = { width, height: 1e5 };
  const camera = cameraFor("stack", view, tall);
  return tableSize(tall, camera) * frameHeightFactor(camera) + 2 * camera.gutterY;
}

/**
 * The replay of a loaded game: the table's stage with the chrome around it (info chip, toolbar,
 * transport), in the arrangement the screen calls for. The viewer state lives in one reducer;
 * settings, history and the arrangement come from their hooks, and everything else is derived per
 * game, round and step.
 */
export function Viewer({ game, start, origin, newEntry, focusRef, notice }: ViewerProps) {
  const { m, locale } = useI18n();
  const { settings, update, openDialog } = useSettings();
  const arrangement = useArrangement();
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const playerCount = game.playerCount;

  // ---- per game
  const timelines = useMemo(() => createTimelineCache(game.rounds, game.playerCount), [game]);
  const ix = useMemo(() => createStepIndex(game, timelines), [game, timelines]);
  const { state: vs, dispatch, navigate } = useViewerState(ix, start);
  const names = useMemo(() => playerNames(m, game.players), [m, game.players]);
  const final = useMemo(() => finalScores(game), [game]);
  const rounds = useMemo(() => gameOverview(game), [game]);

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
  const discards = useMemo(() => discardIndex(states), [states]);

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
  const motion = useMemo(
    () =>
      round && raw && prevRaw
        ? motionFor(round, prevRaw, raw, vs.lastMove, speed, {
            motion: !reducedMotion,
            revealedBefore,
            revealedNow: revealed,
            pov,
          })
        : { flight: null, reveal: [] },
    [round, raw, prevRaw, vs.lastMove, speed, reducedMotion, revealedBefore, revealed, pov],
  );
  const captions = useMemo(
    () => (round && raw ? captionsFor(round, raw, vs.lastMove, speed) : []),
    [round, raw, vs.lastMove, speed],
  );
  const showWaits = settings.showWaits;
  const tags = useMemo(
    () =>
      round && board
        ? seatTagsFor({
            playerCount,
            dealer: round.dealer,
            seats: board.seats,
            names,
            pov,
            aid: (seat) =>
              showWaits
                ? seatAid(board, seat, { pov, revealed: revealed.has(seat), playerCount })
                : null,
          })
        : [],
    [round, board, playerCount, names, pov, revealed, showWaits],
  );
  const players = useMemo(
    () => (round ? playerRows(playerCount, round, board, names) : []),
    [playerCount, round, board, names],
  );
  const spotlight = useSpotlight();
  // What the chrome floating in the stage's top corners needs to keep off the tiles, and in the
  // stack arrangement the height the table can use at the page's width, for the toast.
  const view = settings.view;
  const stack = arrangement === "stack";
  const width = Math.max(MIN_WIDTH, useViewportWidth(stack));
  const pageVars = useMemo<CSSProperties>(
    () => ({
      ...cornerVars(cameraFor(arrangement, view)),
      ...(stack && { "--table-h": `${stackTableHeight(width, view)}px` }),
    }),
    [arrangement, stack, view, width],
  );
  const quiet = useQuietStatus(vs);
  const stepCount = timelines.stepCount(position.round);

  // ---- local UI state
  const transportRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<PopoverName | null>(null);
  // The transport moves between the table's dock and the page with the arrangement: a popover
  // would lose its opener, so it closes.
  const [popoverArrangement, setPopoverArrangement] = useState(arrangement);
  if (popoverArrangement !== arrangement) {
    setPopoverArrangement(arrangement);
    setPopover(null);
  }
  const { toast, announcement, show, say } = useToast(position);
  // Words from around the viewer (a download over the game) are read out once, when they come.
  const [noticeRead, setNoticeRead] = useState<string | null>(null);
  if (notice !== noticeRead) {
    setNoticeRead(notice);
    if (notice !== null) {
      say(notice);
    }
  }
  // The console shows the other scores as differences; a new game starts with plain scores (the
  // shell keys the viewer by game).
  const [scoreDiff, setScoreDiff] = useState(false);
  const toggleScoreDiff = useCallback(() => setScoreDiff((shown) => !shown), []);
  // The control that last had the focus inside the viewer (its popovers included): when it goes
  // away with the focus (the result card's buttons, Show result, an item of a popover closed by a
  // press outside), the stage takes the focus.
  const lastFocused = useRef<Element | null>(null);

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
  const onPov = useCallback((seat: Seat) => dispatch({ type: "setPov", seat }), [dispatch]);
  const onPondJump = useCallback(
    (ref: DiscardRef) => {
      const step = discards.decisionStep(ref);
      if (step !== undefined) {
        seek({ round: position.round, step });
      }
    },
    [discards, seek, position.round],
  );
  const lastRound = game.rounds.length - 1;
  const toRound = useCallback((index: number) => seek({ round: index, step: 0 }), [seek]);
  const toGameEnd = useCallback(
    () => seek({ round: lastRound, step: timelines.stepCount(lastRound) - 1 }),
    [seek, lastRound, timelines],
  );

  const onCopyLink = useCallback(() => {
    // A game no link reopens has none; the menu does not offer the item then.
    const link = history.link();
    if (link !== null) {
      void copyLink(link).then((copied) => {
        show(copied ? m.toast.linkCopied : m.toast.linkCopyFailed);
      });
    }
  }, [history, show, m]);

  const toggleHands = useCallback(
    () => update({ showAllHands: !settings.showAllHands }),
    [update, settings.showAllHands],
  );

  // ---- result card
  const resultCard = vs.resultCard;
  const hideResult = useCallback(() => dispatch({ type: "hideResult" }), [dispatch]);
  const showResult = useCallback(() => dispatch({ type: "showResult" }), [dispatch]);
  const nextRound = useCallback(() => navigate({ kind: "nextRound" }, "user"), [navigate]);
  const stepBack = useCallback(() => navigate({ kind: "step", dir: -1 }, "user"), [navigate]);
  // A card that waits comes up after its moment, unless something else happened first.
  useEffect(() => {
    if (resultCard !== "due") {
      return;
    }
    const timer = window.setTimeout(showResult, RESULT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [resultCard, showResult]);

  // ---- focus: a control that went away while it had the focus hands it to the stage
  useEffect(() => {
    const last = lastFocused.current;
    if (last !== null && !last.isConnected && focusIsLost()) {
      lastFocused.current = null;
      focusRef.current?.focus({ preventScroll: true });
    }
  });

  // ---- keys
  const onCommand = useViewerCommands({
    state: vs,
    dispatch,
    navigate,
    atResult,
    popover,
    setPopover,
    settings,
    update,
    openDialog,
    scoreDiff,
    toggleScoreDiff,
    players,
    show,
    say,
  });
  useViewerKeys({ charKeys: settings.charKeys, onCommand });

  // ---- pointer, wheel and autoplay
  // While the result card is up, a press on the table beside it, or a turn of the wheel, only
  // puts the card away, as a press on the card's layer does: leaving the round takes a key or a
  // button. While it waits, the same press brings it up (the reducer's rule).
  const cardShown = atResult && resultCard === "shown";
  const onStagePress = useCallback(
    (dir: Dir, o: { ownTurn: boolean; source: NavSource }) => {
      if (cardShown && dir === 1 && o.source === "user") {
        hideResult();
        return false;
      }
      return onStep(dir, o);
    },
    [cardShown, hideResult, onStep],
  );
  useStageGestures(focusRef, { onStep: onStagePress });
  useWheelStep([focusRef, transportRef], { onStep: onStagePress });
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

  // The slider's value text follows the live region's reveal rule (no hidden draws read out).
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
  const navOf = useCallback(
    (command: NavCommand, source: Exclude<NavSource, "autoplay">) => navigate(command, source),
    [navigate],
  );

  const card =
    round && board && cardShown ? (
      <ResultLayer onHide={hideResult} onStepBack={stepBack}>
        <ResultCard
          results={results}
          seats={board.seats}
          names={names}
          playerCount={playerCount}
          final={position.round === lastRound ? final : null}
          drawWaits={drawWaits(results, board.seats, playerCount)}
          doraIndicators={board.doraIndicators}
          onHide={hideResult}
          onNextRound={nextRound}
        />
      </ResultLayer>
    ) : undefined;

  const transport = (
    <Transport
      arrangement={arrangement}
      turn={turnOf(position.step)}
      limits={navLimits(position, ix)}
      playing={vs.playing}
      speed={speed}
      onNav={navOf}
      onTogglePlay={() => dispatch({ type: "togglePlay" })}
      onSpeed={(value) => update({ autoplaySpeed: value })}
      onShowResult={atResult && resultCard === "hidden" ? showResult : null}
      scrubber={{
        round: position.round,
        steps: stepCount,
        step: position.step,
        describe,
        turnOf,
        onSeek: seek,
      }}
      roundList={{
        rounds,
        current: position.round,
        names,
        pov,
        onRound: toRound,
        onFinal: toGameEnd,
        open: popover === "rounds",
        onOpenChange: (open) => setPopover(open ? "rounds" : null),
      }}
      rootRef={transportRef}
    />
  );
  const docked = arrangement === "wide";

  return (
    <main
      className={styles.viewer}
      style={pageVars}
      onFocus={(event) => {
        lastFocused.current = event.target;
      }}
    >
      <h1 className="sr-only">{m.app.title}</h1>
      <div className={styles.info}>
        {board && (
          <InfoChip
            doraIndicators={board.doraIndicators}
            honba={board.honba}
            deposits={board.riichiSticks}
          />
        )}
      </div>
      <div className={styles.tools}>
        <Toolbar
          showAllHands={showAll}
          onToggleHands={toggleHands}
          players={players}
          pov={pov}
          onPov={onPov}
          linkable={origin !== null}
          onOpenLog={() => openDialog("open")}
          onCopyLink={onCopyLink}
          onSettings={() => openDialog("settings")}
          onHelp={() => openDialog("help")}
          popover={popover}
          onPopover={setPopover}
        />
      </div>
      {round && board ? (
        <TableStage
          game={game}
          round={round}
          state={board}
          names={names}
          pov={pov}
          revealed={revealed}
          view={settings.view}
          arrangement={arrangement}
          walls={!showAll}
          tags={tags}
          captions={captions}
          motion={motion}
          spotlight={spotlight}
          onPondJump={onPondJump}
          stageRef={focusRef}
          scoreDiff={scoreDiff}
          onToggleScoreDiff={toggleScoreDiff}
          dock={docked ? transport : undefined}
          overlay={card}
        />
      ) : (
        <section ref={focusRef} className={styles.failed} aria-label={m.board.table} tabIndex={-1}>
          {/* Not a live region: the viewer's one live region announces the failure. */}
          <p>{m.errors.replayFailed}</p>
          {docked && <div className={styles.failedDock}>{transport}</div>}
        </section>
      )}
      {!docked && <div className={styles.controls}>{transport}</div>}
      <LiveStatus text={statusText} quiet={quiet} announcement={announcement} />
      <div className={styles.toast}>
        <Toast text={toast} />
      </div>
    </main>
  );
}
