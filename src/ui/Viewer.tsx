import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quad, RyukyokuEvent, Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { BoardState } from "../replay/types";
import { drawWaits, seatAid } from "./analysis/aids";
import { discardIndex } from "./analysis/discardIndex";
import { LiveStatus } from "./controls/LiveStatus";
import { playerRows } from "./controls/players";
import { gameOverview, roundDeltas } from "./controls/roundSummary";
import { Toast } from "./controls/Toast";
import { Transport } from "./controls/Transport";
import { focusIsLost } from "./dom";
import { useStageGestures } from "./input/useStageGestures";
import { useWheelStep } from "./input/useWheelStep";
import { playerNames, resultSummary, roundLabel } from "./labels";
import { navLimits, type Position } from "./navigation";
import { Panel } from "./panel/Panel";
import { PanelActions } from "./panel/PanelActions";
import { PlayerList } from "./panel/PlayerList";
import { ResultBlock } from "./panel/ResultBlock";
import { RoundHeader } from "./panel/RoundHeader";
import { RoundList } from "./panel/RoundList";
import { finalScores } from "./result/finalScores";
import { revealedSeats, withRevealedHands } from "./reveal";
import { useSettings } from "./settings/useSettings";
import type { ShellViewerProps } from "./shell/Shell";
import { describeStep } from "./steps";
import { captionsFor } from "./table/captions";
import { motionFor } from "./table/motion";
import { seatInfoFor } from "./table/seatInfo";
import { TableStage } from "./table/TableStage";
import { useSpotlight } from "./table/useSpotlight";
import { preloadTileImages } from "./tileAssets";
import { createTimelineCache } from "./timelineCache";
import { copyLink } from "./url/clipboard";
import { useHistorySync } from "./url/useHistorySync";
import styles from "./Viewer.module.css";
import { createStepIndex, turnNumber } from "./viewer/stepIndex";
import type { Dir, DiscardRef, NavCommand, NavSource, TenpaiInfo } from "./viewer/types";
import { useAutoplay } from "./viewer/useAutoplay";
import { useQuietStatus } from "./viewer/useQuietStatus";
import { useToast } from "./viewer/useToast";
import { useViewerCommands } from "./viewer/useViewerCommands";
import { useViewerKeys } from "./viewer/useViewerKeys";
import { useViewerState } from "./viewer/useViewerState";

export type ViewerProps = ShellViewerProps;

/**
 * The replay of a loaded game: the table's stage with the transport under it, and the panel that
 * says everything else in words (the round, its result, the players, the rounds, the app's
 * actions), beside the table on a wide screen and under it on a narrow one. The viewer state
 * lives in one reducer; settings and history come from their hooks, and everything else is
 * derived per game, round and step.
 */
export function Viewer({ game, start, origin, newEntry, focusRef, notice }: ViewerProps) {
  const { m, locale } = useI18n();
  const { settings, update, openDialog } = useSettings();
  const playerCount = game.playerCount;

  // ---- per game
  const timelines = useMemo(() => createTimelineCache(game.rounds, game.playerCount), [game]);
  const ix = useMemo(() => createStepIndex(game, timelines), [game, timelines]);
  const { state: vs, dispatch, navigate } = useViewerState(ix, start);
  const names = useMemo(() => playerNames(m, game.players), [m, game.players]);
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
  const speed = settings.autoplaySpeed;
  const motion = useMemo(
    () =>
      round && raw && prevRaw
        ? motionFor(round, prevRaw, raw, vs.lastMove, speed)
        : { landing: null },
    [round, raw, prevRaw, vs.lastMove, speed],
  );
  const captions = useMemo(
    () => (round && raw ? captionsFor(round, raw, vs.lastMove, speed) : []),
    [round, raw, vs.lastMove, speed],
  );
  const showWaits = settings.showWaits;
  const aidOf = useCallback(
    (seat: Seat) =>
      board && showWaits
        ? seatAid(board, seat, { pov, revealed: revealed.has(seat), playerCount })
        : null,
    [board, showWaits, pov, revealed, playerCount],
  );
  const seats = useMemo(
    () =>
      round && board
        ? seatInfoFor({
            playerCount,
            dealer: round.dealer,
            seats: board.seats,
            names,
            pov,
            aid: aidOf,
          })
        : [],
    [round, board, playerCount, names, pov, aidOf],
  );
  const players = useMemo(
    () => (round ? playerRows(playerCount, round, board, names, aidOf) : []),
    [playerCount, round, board, names, aidOf],
  );
  // At a result the player list also says how the scores moved and, at a draw, who was tenpai.
  const changes = useMemo(() => (atResult ? roundDeltas(results) : null), [atResult, results]);
  const tenpai = useMemo<TenpaiInfo | null>(() => {
    const draw = results.find((result): result is RyukyokuEvent => result.type === "ryukyoku");
    return board && draw?.tenpai
      ? { seats: draw.tenpai, waits: drawWaits(results, board.seats, playerCount) }
      : null;
  }, [results, board, playerCount]);
  const spotlight = useSpotlight();
  const quiet = useQuietStatus(vs);
  const stepCount = timelines.stepCount(position.round);

  // ---- local UI state
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
  // The control that last had the focus inside the viewer: when it goes away with the focus (the
  // result's Next round button, once pressed), the stage takes the focus.
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
  const nextRound = useCallback(() => navigate({ kind: "nextRound" }, "user"), [navigate]);

  const onCopyLink = useCallback(() => {
    // A game no link reopens has none; the panel does not offer the action then.
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
  useStageGestures(focusRef, { onStep });
  useWheelStep([focusRef], { onStep });
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
  const limits = navLimits(position, ix);

  return (
    <main
      className={styles.viewer}
      onFocus={(event) => {
        lastFocused.current = event.target;
      }}
    >
      <h1 className="sr-only">{m.app.title}</h1>
      <div className={styles.board}>
        {round && board ? (
          <TableStage
            game={game}
            round={round}
            state={board}
            names={names}
            pov={pov}
            revealed={revealed}
            seats={seats}
            captions={captions}
            motion={motion}
            spotlight={spotlight}
            onPondJump={onPondJump}
            stageRef={focusRef}
            scoreDiff={scoreDiff}
            onToggleScoreDiff={toggleScoreDiff}
          />
        ) : (
          <section
            ref={focusRef}
            className={styles.failed}
            aria-label={m.board.table}
            tabIndex={-1}
          >
            {/* Not a live region: the viewer's one live region announces the failure. */}
            <p>{m.errors.replayFailed}</p>
          </section>
        )}
        <div className={styles.toast}>
          <Toast text={toast} />
        </div>
      </div>
      <div className={styles.controls}>
        <Transport
          limits={limits}
          playing={vs.playing}
          speed={speed}
          onNav={navOf}
          onTogglePlay={() => dispatch({ type: "togglePlay" })}
          onSpeed={(value) => update({ autoplaySpeed: value })}
          scrubber={{
            round: position.round,
            steps: stepCount,
            step: position.step,
            describe,
            turnOf,
            onSeek: seek,
          }}
        />
      </div>
      <div className={styles.panel}>
        <Panel>
          {round && (
            <RoundHeader
              roundName={roundLabel(m, { ...round, honba: board?.honba ?? round.honba })}
              turn={turnOf(position.step)}
              wallRemaining={board ? board.wallRemaining : null}
              deposits={board?.riichiSticks ?? 0}
              limits={limits}
              onNav={navOf}
            />
          )}
          {board && atResult && (
            <ResultBlock
              results={results}
              seats={board.seats}
              names={names}
              playerCount={playerCount}
              final={
                position.round === lastRound
                  ? finalScores(game, board.seats.map((seat) => seat.score) as Quad<number>)
                  : null
              }
              doraIndicators={board.doraIndicators}
              onNextRound={nextRound}
            />
          )}
          <PlayerList
            players={players}
            pov={pov}
            onPov={onPov}
            showAllHands={showAll}
            onToggleHands={toggleHands}
            changes={changes}
            tenpai={tenpai}
          />
          <RoundList
            rounds={rounds}
            current={position.round}
            names={names}
            pov={pov}
            onRound={toRound}
            onFinal={toGameEnd}
          />
          <PanelActions
            linkable={origin !== null}
            onOpenLog={() => openDialog("open")}
            onCopyLink={onCopyLink}
            onSettings={() => openDialog("settings")}
            onHelp={() => openDialog("help")}
          />
        </Panel>
      </div>
      <LiveStatus text={statusText} quiet={quiet} announcement={announcement} />
    </main>
  );
}
