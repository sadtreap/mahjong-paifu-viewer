import { type Ref, useCallback, useMemo, useState } from "react";
import type { GameLog, Quad, Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { MeldView } from "../replay/types";
import { Board } from "./Board";
import { Controls } from "./Controls";
import { FinalStandings } from "./FinalStandings";
import { GameHeader } from "./GameHeader";
import type { NavAction } from "./keys";
import { playerNames } from "./labels";
import {
  type Bounds,
  clampPosition,
  goToRound,
  goToStep,
  nextRound,
  nextStep,
  type Position,
  prevRound,
  prevStep,
} from "./navigation";
import { ResultPanel } from "./ResultPanel";
import { revealedSeats, withRevealedHands } from "./reveal";
import { ShortcutHints } from "./ShortcutHints";
import { describeStep } from "./steps";
import { createTimelineCache } from "./timelineCache";
import { useReplayKeys } from "./useReplayKeys";
import { useShowAllHands } from "./useShowAllHands";
import styles from "./Viewer.module.css";
import { ViewOptions } from "./ViewOptions";

export interface ViewerProps {
  game: GameLog;
  /** Where to open the game (0-based indexes, clamped to the game); the first step by default. */
  start?: Position | null;
  /** The game information section, which takes the focus when a game replaces the control that had it. */
  focusRef?: Ref<HTMLElement>;
}

/** Replays a loaded game: board, playback controls, round results and final standings. */
export function Viewer({ game, start = null, focusRef }: ViewerProps) {
  const { m } = useI18n();
  const timelines = useMemo(() => createTimelineCache(game.rounds), [game]);
  const bounds = useMemo<Bounds>(
    () => ({ roundCount: game.rounds.length, stepCount: timelines.stepCount }),
    [game, timelines],
  );
  const [position, setPosition] = useState<Position>(() =>
    clampPosition(start ?? { round: 0, step: 0 }, bounds),
  );
  const [pov, setPov] = useState<Seat>(0);
  const [showAllHands, setShowAllHands] = useShowAllHands();

  const navigate = useCallback(
    (action: NavAction) => {
      setPosition((current) => {
        switch (action) {
          case "nextStep":
            return nextStep(current, bounds);
          case "prevStep":
            return prevStep(current, bounds);
          case "nextRound":
            return nextRound(current, bounds);
          case "prevRound":
            return prevRound(current, bounds);
          case "firstStep":
            return goToStep(current, 0, bounds);
          case "lastStep":
            return goToStep(current, bounds.stepCount(current.round) - 1, bounds);
        }
      });
    },
    [bounds],
  );
  useReplayKeys(navigate);

  const names = useMemo(() => playerNames(m, game.players), [m, game.players]);
  const round = game.rounds[position.round];
  if (!round) {
    return (
      <p className={styles.error} role="alert">
        {m.errors.replayFailed}
      </p>
    );
  }

  const timeline = timelines.get(position.round);
  const replayed = timeline.ok ? (timeline.steps[position.step] ?? null) : null;
  // At the round end the board shows the hands the result reveals, even where the log hid them.
  const state =
    replayed && replayed.results.length > 0
      ? { ...replayed, seats: withRevealedHands(replayed.seats, replayed.results) }
      : replayed;
  const stepCount = timelines.stepCount(position.round);
  const scores = state ? (state.seats.map((seat) => seat.score) as Quad<number>) : round.scores;
  const revealed = revealedSeats(pov, showAllHands, state?.results ?? []);
  const isGameEnd =
    state !== null &&
    position.round === game.rounds.length - 1 &&
    position.step === stepCount - 1 &&
    state.results.length > 0;

  return (
    <div className={styles.viewer}>
      <div className={styles.header}>
        <GameHeader
          game={game}
          names={names}
          scores={scores}
          dealer={round.dealer}
          pov={pov}
          sectionRef={focusRef}
        />
      </div>
      <div className={styles.board}>
        {state ? (
          <Board round={round} state={state} names={names} pov={pov} revealed={revealed} />
        ) : (
          <p className={styles.error} role="alert">
            {m.errors.replayFailed}
          </p>
        )}
      </div>
      <div className={styles.controls}>
        <Controls
          rounds={game.rounds}
          round={position.round}
          step={position.step}
          stepCount={stepCount}
          onAction={navigate}
          onRound={(index) => setPosition(goToRound(index, bounds))}
          onStep={(step) => setPosition((current) => goToStep(current, step, bounds))}
        />
        <p className={styles.status} aria-live="polite" aria-atomic="true">
          {state ? describeStep(m, round, state, names, (seat) => revealed.has(seat)) : ""}
        </p>
        <ViewOptions
          names={names}
          pov={pov}
          showAllHands={showAllHands}
          onPov={setPov}
          onShowAllHands={setShowAllHands}
        />
      </div>
      <div className={styles.details}>
        {state && state.results.length > 0 && (
          <ResultPanel
            results={state.results}
            names={names}
            melds={state.seats.map((seat) => seat.melds) as Quad<MeldView[]>}
          />
        )}
        {isGameEnd && <FinalStandings scores={game.finalScores ?? scores} names={names} />}
        <ShortcutHints />
      </div>
    </div>
  );
}
