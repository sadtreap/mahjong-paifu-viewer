/**
 * Data for the two timeline bands: the whole game as weighted round segments (band 1) and the
 * current round's marks per seat (band 2). Pure; the components only position what this returns.
 */
import type {
  GameLog,
  PlayerCount,
  Quad,
  Round,
  RyukyokuEvent,
  Seat,
  WinEvent,
} from "../../core/model";
import { activeSeats, nextSeat } from "../../core/players";
import type { Locale } from "../../i18n/locales";
import type { Messages } from "../../i18n/messages";
import type { BoardState } from "../../replay/types";
import { resultSummary, roundShortLabel } from "../labels";
import type {
  GameOverview,
  PovMark,
  RoundMarks,
  RoundOutcome,
  RoundSummary,
  StepIndex,
  StepMark,
} from "../viewer/types";

type Result = WinEvent | RyukyokuEvent;

/** The results a round's log ends with (wins, or the draw). */
export function roundResults(round: Round): Result[] {
  if (!Array.isArray(round.events)) {
    return [];
  }
  return round.events.filter(
    (event): event is Result => event.type === "win" || event.type === "ryukyoku",
  );
}

/** Ron, tsumo (with the number of winners) or a draw; null for a round with no result. */
export function roundOutcome(results: readonly Result[]): RoundOutcome {
  const wins = results.filter((result): result is WinEvent => result.type === "win");
  if (wins.length > 0) {
    return { kind: wins.some((win) => win.from !== win.seat) ? "ron" : "tsumo", wins: wins.length };
  }
  return results.length > 0 ? { kind: "draw" } : null;
}

/** The point changes of all of a round's results together. */
export function roundDeltas(results: readonly Result[]): Quad<number> {
  const deltas: Quad<number> = [0, 0, 0, 0];
  for (const result of results) {
    for (let seat = 0; seat < 4; seat++) {
      deltas[seat] = (deltas[seat] ?? 0) + (result.deltas[seat] ?? 0);
    }
  }
  return deltas;
}

/** Every round of the game with its place on the game-wide step axis, outcome and deltas. */
export function gameOverview(
  game: GameLog,
  ix: StepIndex,
  m: Messages,
  names: Quad<string>,
  locale: Locale,
): GameOverview {
  let offset = 0;
  const rounds = game.rounds.map((round, index): RoundSummary => {
    const results = roundResults(round);
    const steps = Math.max(1, ix.stepCount(index));
    const summary: RoundSummary = {
      index,
      label: roundShortLabel(m, round),
      offset,
      steps,
      outcome: roundOutcome(results),
      resultText: resultSummary(m, results, names, locale),
      startScores: [...round.scores],
      deltas: roundDeltas(results),
    };
    offset += steps;
    return summary;
  });
  return { rounds, totalSteps: offset };
}

/**
 * Band-2 marks of a round, from the step index: a bar per discard (tsumogiri hollow), a stick per
 * riichi, a diamond per chi, pon or open kan, a square per closed or added kan, a circle per kita,
 * a dashed line per dora reveal and a bar at the result. `riichiFrom` gives each riichi seat's
 * declaration step (the riichi bar runs from there to the round end).
 */
export function roundMarks(
  _round: Round,
  _states: readonly BoardState[],
  ix: StepIndex,
  index: number,
): RoundMarks {
  const marks: StepMark[] = [];
  const riichiFrom: Partial<Record<Seat, number>> = {};
  const count = ix.stepCount(index);
  for (let step = 1; step < count; step++) {
    const info = ix.info(index, step);
    const seat = info.seat;
    switch (info.kind) {
      case "discard":
        marks.push({ step, seat, kind: info.tsumogiri ? "tsumogiri" : "discard" });
        break;
      case "riichi":
        marks.push({ step, seat, kind: info.tsumogiri ? "tsumogiri" : "discard" });
        marks.push({ step, seat, kind: "riichi" });
        if (seat !== null && riichiFrom[seat] === undefined) {
          riichiFrom[seat] = step;
        }
        break;
      case "chi":
      case "pon":
      case "daiminkan":
        marks.push({ step, seat, kind: "call" });
        break;
      case "ankan":
      case "kakan":
        marks.push({ step, seat, kind: "kan" });
        break;
      case "kita":
        marks.push({ step, seat, kind: "kita" });
        break;
      case "result":
        marks.push({ step, seat: null, kind: "end" });
        break;
      default:
        break;
    }
    if (info.doraReveal) {
      marks.push({ step, seat: null, kind: "dora" });
    }
  }
  return { marks, riichiFrom };
}

/** Per round, whether the POV won or dealt in, and its point change. */
export function povMarks(game: GameLog, overview: GameOverview, pov: Seat): PovMark[] {
  return game.rounds.map((round, index) => {
    const wins = roundResults(round).filter((result): result is WinEvent => result.type === "win");
    return {
      round: index,
      won: wins.some((win) => win.seat === pov),
      dealtIn: wins.some((win) => win.from === pov && win.seat !== pov),
      delta: overview.rounds[index]?.deltas[pov] ?? 0,
    };
  });
}

/** Band-2 lanes: the playing seats in turn order, starting with the POV. */
export function laneOrder(pov: Seat, playerCount: PlayerCount): Seat[] {
  const seats = activeSeats(playerCount);
  const start = seats.includes(pov) ? pov : 0;
  const order: Seat[] = [start];
  for (
    let seat = nextSeat(start, playerCount);
    seat !== start;
    seat = nextSeat(seat, playerCount)
  ) {
    order.push(seat);
  }
  return order;
}
