import type { GameLog, Seat, WinEvent } from "../../core/model";
import { activeSeats } from "../../core/players";
import { roundResults } from "../timeline/timelineModel";
import type { TimelineCache } from "../timelineCache";
import type {
  GameOverview,
  MatrixCell,
  MatrixRole,
  MatrixRow,
  RoundSummary,
  StepIndex,
} from "../viewer/types";

/**
 * The who-won / who-dealt-in matrix: one row per round, one cell per playing seat with its point
 * change, its role (win, deal-in, tenpai at an exhaustive draw), whether it declared riichi, and
 * where a click on it goes: the result for a winner, the decision step before the discard (or kan,
 * or kita) that dealt in, the riichi for a riichi player, else the round start.
 */
export function roundMatrix(
  game: GameLog,
  overview: GameOverview,
  timelines: TimelineCache,
  ix: StepIndex,
): MatrixRow[] {
  const seats = activeSeats(game.playerCount);
  return game.rounds.map((round, index): MatrixRow => {
    const summary = overview.rounds[index] as RoundSummary | undefined;
    const results = roundResults(round);
    const wins = results.filter((result): result is WinEvent => result.type === "win");
    const replayed = timelines.get(index).ok;
    const steps = replayed ? ix.stepCount(index) : 1;
    const resultStep = steps - 1;
    const riichiStep = new Map<Seat, number>();
    for (let step = 1; step < steps; step++) {
      const info = ix.info(index, step);
      if (info.kind === "riichi" && info.seat !== null && !riichiStep.has(info.seat)) {
        riichiStep.set(info.seat, step);
      }
    }
    const tenpai = new Set<Seat>();
    for (const result of results) {
      if (result.type === "ryukyoku" && result.reason === "exhaustive") {
        for (const seat of result.tenpai ?? []) {
          tenpai.add(seat);
        }
      }
    }
    const cells: Partial<Record<Seat, MatrixCell>> = {};
    for (const seat of seats) {
      const won = wins.some((win) => win.seat === seat);
      const dealtIn = !won && wins.some((win) => win.from === seat && win.seat !== seat);
      const role: MatrixRole = won
        ? "win"
        : dealtIn
          ? "dealin"
          : tenpai.has(seat)
            ? "tenpai"
            : null;
      const riichiAt = riichiStep.get(seat);
      let step = 0;
      if (replayed) {
        if (won) {
          step = resultStep;
        } else if (dealtIn) {
          // The step before the result is the discard (or kan, or kita) that was won on.
          step = Math.max(0, resultStep - 2);
        } else if (riichiAt !== undefined) {
          step = riichiAt;
        }
      }
      cells[seat] = {
        delta: summary?.deltas[seat] ?? 0,
        role,
        riichi: riichiAt !== undefined,
        target: { round: index, step },
      };
    }
    return {
      round: index,
      label: summary?.label ?? "",
      outcome: summary?.outcome ?? null,
      start: { round: index, step: 0 },
      cells,
    };
  });
}
