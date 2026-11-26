import type { Round } from "../../core/model";
import { type Tile, tileKind } from "../../core/tile";
import type { BoardState } from "../../replay/types";
import { turnNumber } from "../viewer/stepIndex";
import type { MoveNote, MoveRow, StepIndex } from "../viewer/types";

function row(
  index: number,
  step: number,
  target: number,
  turn: number,
  seat: MoveRow["seat"],
  tile: Tile | null,
  notes: MoveNote[],
): MoveRow {
  const kind = tile === null ? -1 : tileKind(tile);
  return {
    step,
    target: { round: index, step: Math.max(0, target) },
    turn,
    seat,
    tile,
    kind: kind >= 0 ? kind : null,
    notes,
  };
}

/**
 * The Moves list of a round: a row per discard, call, kan, kita, draw (the list shows only the
 * POV's) and result, with its notes. A click goes to the decision step: the step before a discard,
 * call, kan or kita; a draw or a result is its own step. A multiple ron gives one row per winner.
 * `round` is unused, kept for the signature shared with the other per-round builders.
 */
export function movesOf(
  _round: Round,
  states: readonly BoardState[],
  ix: StepIndex,
  index: number,
): MoveRow[] {
  const rows: MoveRow[] = [];
  for (let step = 1; step < states.length; step++) {
    const state = states[step] as BoardState;
    const event = state.lastEvent;
    const turn = turnNumber(states, step, ix.playerCount);
    if (event === null) {
      continue;
    }
    switch (event.type) {
      case "draw":
        rows.push(row(index, step, step, turn, event.seat, event.tile, ["draw"]));
        break;
      case "discard": {
        const next = states[step + 1]?.lastEvent;
        const called =
          (next?.type === "chi" || next?.type === "pon" || next?.type === "daiminkan") &&
          next.from === event.seat;
        const notes: MoveNote[] = event.riichi
          ? ["riichi", ...(event.tsumogiri ? (["tsumogiri"] as const) : [])]
          : [event.tsumogiri ? "tsumogiri" : "discard"];
        if (called) {
          notes.push("called");
        }
        rows.push(row(index, step, step - 1, turn, event.seat, event.tile, notes));
        break;
      }
      case "chi":
      case "pon":
        rows.push(row(index, step, step - 1, turn, event.seat, event.tile, [event.type]));
        break;
      case "daiminkan":
        rows.push(row(index, step, step - 1, turn, event.seat, event.tile, ["kan"]));
        break;
      case "ankan":
        rows.push(row(index, step, step - 1, turn, event.seat, event.tiles[0] ?? null, ["kan"]));
        break;
      case "kakan":
        rows.push(row(index, step, step - 1, turn, event.seat, event.tile, ["kan"]));
        break;
      case "kita":
        rows.push(row(index, step, step - 1, turn, event.seat, event.tile, ["kita"]));
        break;
      case "win":
      case "ryukyoku":
        for (const result of state.results) {
          if (result.type === "win") {
            const note: MoveNote = result.from === result.seat ? "tsumo" : "ron";
            rows.push(row(index, step, step, turn, result.seat, result.tile ?? null, [note]));
          } else {
            rows.push(row(index, step, step, turn, null, null, ["drawEnd"]));
          }
        }
        break;
      default:
        // A dora or riichi stick with no step before it (only the deal): nothing to list.
        break;
    }
  }
  return rows;
}
