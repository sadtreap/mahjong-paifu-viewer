/**
 * Rebuilds the chronological event stream of a tenhou.net/6 round from the per-seat lists.
 *
 * The format stores each seat's takes and discards separately, so the turn order has to be
 * replayed: after a discard the turn passes to the next playing seat (seat 2 hands it to seat 0
 * with three players) unless another seat's next take is a call of that exact tile from that seat,
 * kans and kita give the same seat a replacement draw, and the round ends when the lists run out.
 * The only real ambiguity is a call whose tile the discarder throws again later before the caller
 * draws (or a pon and a chi waiting on the same tile): the call may belong to either discard. Those
 * choice points are explored depth first, with the tracked hands (a discarded or called tile must
 * be in the hand) and the round result pruning the wrong branches. A kita adds no choice point.
 * The approach follows convlog (Equim-chan/mjai-reviewer), reimplemented here.
 */

import type { PlayerCount, Quad, RoundEvent, Seat } from "../../core/model";
import { activeSeats, nextSeat } from "../../core/players";
import type { KnownTile } from "../../core/tile";
import type { SeatActions } from "./actions";

export interface InterleaveInput {
  /** With three players, seat 3 has no tiles and the turn passes from seat 2 to seat 0. */
  playerCount: PlayerCount;
  dealer: Seat;
  haipai: Quad<KnownTile[]>;
  seats: Quad<SeatActions>;
  /** All dora indicators of the round; the first one is revealed at the start. */
  doraIndicators: readonly KnownTile[];
  /** Validates the last event against the recorded result (e.g. a tsumo ends on the winner's draw). */
  acceptEnd: (lastEvent: RoundEvent | undefined) => boolean;
}

export interface Interleaved {
  events: RoundEvent[];
  /** Concealed hands at the end of the round; only exact when `handsChecked` is true. */
  hands: Quad<KnownTile[]>;
  handsChecked: boolean;
  /** Seat whose riichi discard was the last action and is still waiting to be accepted. */
  pendingRiichi: Seat | null;
  /** Kan dora indicators the replay did not reveal (normally none). */
  unrevealedDora: KnownTile[];
}

interface SimulationOptions {
  checkHands: boolean;
  checkEnd: boolean;
}

/** Upper bound on replays per round, so a malformed log cannot make the search explode. */
const MAX_ATTEMPTS = 5000;

/** Choice meaning "nobody calls now": the next seat in turn order draws. */
const PASS = -1;

/**
 * Replays the round once. At every choice point with several options, `choices[n]` picks the
 * option (default 0) and the option count is appended to `counts`. Returns null when the replay
 * contradicts the data.
 */
function simulate(
  input: InterleaveInput,
  options: SimulationOptions,
  choices: readonly number[],
  counts: number[],
): Interleaved | null {
  const { seats, doraIndicators, playerCount } = input;
  const players = activeSeats(playerCount);
  const hands = input.haipai.map((hand) => [...hand]) as Quad<KnownTile[]>;
  const takeIndex: Quad<number> = [0, 0, 0, 0];
  const discardIndex: Quad<number> = [0, 0, 0, 0];
  const events: RoundEvent[] = [];
  let nextDora = 1;
  let actor = input.dealer;
  let lastDiscard: { seat: Seat; tile: KnownTile } | null = null;
  let pendingRiichi: Seat | null = null;
  let mustDraw = false;
  // An open kan's indicator is revealed with the kan player's next discard; after an added kan
  // that discard can itself be another kan, and the indicator then waits for the next draw
  // (until then the added kan can still be robbed).
  let doraAtDiscard = false;
  let doraAtDraw = false;

  const revealDora = () => {
    const indicator = doraIndicators[nextDora];
    if (indicator) {
      events.push({ type: "dora", indicator });
      nextDora++;
    }
  };
  const removeTile = (seat: Seat, tile: KnownTile): boolean => {
    const hand = hands[seat];
    const index = hand.indexOf(tile);
    if (index < 0) {
      return !options.checkHands;
    }
    hand.splice(index, 1);
    return true;
  };
  const removeTiles = (seat: Seat, tiles: readonly KnownTile[]) =>
    tiles.every((tile) => removeTile(seat, tile));
  const allTaken = () => players.every((seat) => takeIndex[seat] === seats[seat].takes.length);

  for (;;) {
    const actions = seats[actor];
    const take = actions.takes[takeIndex[actor]];
    if (!take) {
      return null;
    }
    takeIndex[actor]++;
    if (take.kind === "draw") {
      mustDraw = false;
    } else if (
      mustDraw ||
      !lastDiscard ||
      lastDiscard.seat !== take.from ||
      lastDiscard.tile !== take.tile
    ) {
      return null;
    }
    lastDiscard = null;

    if (pendingRiichi !== null) {
      events.push({ type: "riichiAccepted", seat: pendingRiichi });
      pendingRiichi = null;
    }

    if (take.kind === "draw") {
      if (doraAtDraw) {
        revealDora();
        doraAtDraw = false;
      }
      hands[actor].push(take.tile);
      events.push({ type: "draw", seat: actor, tile: take.tile });
    } else {
      if (take.kind === "daiminkan" && doraAtDiscard) {
        revealDora();
      }
      if (!removeTiles(actor, take.consumed)) {
        return null;
      }
      events.push({
        type: take.kind,
        seat: actor,
        from: take.from,
        tile: take.tile,
        consumed: [...take.consumed],
      });
      if (take.kind === "daiminkan") {
        // The open kan's turn is a placeholder in the discard list; the replacement draw follows.
        if (actions.discards[discardIndex[actor]]?.kind !== "kanSlot") {
          return null;
        }
        discardIndex[actor]++;
        doraAtDiscard = true;
        continue;
      }
    }

    const action = actions.discards[discardIndex[actor]];
    if (!action) {
      // Nothing more from this seat after a take: tsumo or kyuushu kyuuhai.
      break;
    }
    discardIndex[actor]++;
    if (action.kind === "kanSlot") {
      return null;
    }
    if (doraAtDiscard) {
      if (action.kind === "kakan") {
        doraAtDraw = true;
      } else if (action.kind === "kita") {
        // Tenhou reveals the open kan's indicator after the kita, before its replacement draw.
        doraAtDraw = true;
        doraAtDiscard = false;
      } else {
        revealDora();
        doraAtDiscard = false;
      }
    }

    if (action.kind === "discard") {
      if (!removeTile(actor, action.tile)) {
        return null;
      }
      events.push({
        type: "discard",
        seat: actor,
        tile: action.tile,
        tsumogiri: action.tsumogiri,
        riichi: action.riichi,
      });
      lastDiscard = { seat: actor, tile: action.tile };
      if (action.riichi) {
        pendingRiichi = actor;
      }
    } else if (action.kind === "ankan") {
      if (!removeTiles(actor, action.tiles)) {
        return null;
      }
      events.push({ type: "ankan", seat: actor, tiles: [...action.tiles] });
    } else if (action.kind === "kita") {
      if (!removeTile(actor, action.tile)) {
        return null;
      }
      events.push({ type: "kita", seat: actor, tile: action.tile });
    } else {
      if (!removeTile(actor, action.tile)) {
        return null;
      }
      events.push({ type: "kakan", seat: actor, tile: action.tile });
    }

    if (allTaken()) {
      // Nothing more from anyone after this action: ron (also on a kita), chankan or a draw.
      break;
    }
    if (action.kind === "ankan") {
      revealDora();
      continue;
    }
    if (action.kind === "kita") {
      // The same seat's next take is the replacement draw; no turn passes.
      continue;
    }
    if (action.kind === "kakan") {
      doraAtDiscard = true;
      continue;
    }

    // Seats whose next take calls this discard; pon and kan take precedence over chi.
    const tile = action.tile;
    const discarder = actor;
    const ponOrKan: Seat[] = [];
    const chi: Seat[] = [];
    for (const seat of players) {
      const next = seats[seat].takes[takeIndex[seat]];
      if (next && next.kind !== "draw" && next.from === discarder && next.tile === tile) {
        (next.kind === "chi" ? chi : ponOrKan).push(seat);
      }
    }
    const candidates: Array<Seat | typeof PASS> = [...ponOrKan, ...chi];
    if (
      candidates.length > 0 &&
      actions.discards
        .slice(discardIndex[discarder])
        .some((later) => later.kind === "discard" && later.tile === tile)
    ) {
      // The discarder throws the same tile again later, so the call may belong to that one.
      candidates.push(PASS);
    }
    let pick = candidates[0] ?? PASS;
    if (candidates.length > 1) {
      const choice = choices[counts.length] ?? 0;
      counts.push(candidates.length);
      pick = candidates[choice] ?? PASS;
    }
    if (pick === PASS) {
      actor = nextSeat(discarder, playerCount);
      mustDraw = candidates.length > 0;
    } else {
      actor = pick;
    }
  }

  const finished = players.every(
    (seat) =>
      takeIndex[seat] === seats[seat].takes.length &&
      discardIndex[seat] === seats[seat].discards.length,
  );
  if (!finished || (options.checkEnd && !input.acceptEnd(events.at(-1)))) {
    return null;
  }
  return {
    events,
    hands,
    handsChecked: options.checkHands,
    pendingRiichi,
    unrevealedDora: doraIndicators.slice(nextDora),
  };
}

/** Depth-first search over the choice points, replaying the round for every branch. */
function search(input: InterleaveInput, options: SimulationOptions): Interleaved | null {
  let choices: number[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const counts: number[] = [];
    const result = simulate(input, options, choices, counts);
    if (result) {
      return result;
    }
    // Advance the deepest choice point that has options left; drop the ones after it.
    const taken = counts.map((_, point) => choices[point] ?? 0);
    let point = counts.length - 1;
    while (point >= 0 && (taken[point] as number) + 1 >= (counts[point] as number)) {
      point--;
    }
    if (point < 0) {
      return null;
    }
    choices = [...taken.slice(0, point), (taken[point] as number) + 1];
  }
  return null;
}

/**
 * Returns the round's events in order, or null when no turn order fits the data. Tries the strict
 * replay first, then relaxes the hand and result checks so a slightly inconsistent log still loads.
 */
export function interleaveRound(input: InterleaveInput): Interleaved | null {
  return (
    search(input, { checkHands: true, checkEnd: true }) ??
    search(input, { checkHands: false, checkEnd: true }) ??
    search(input, { checkHands: false, checkEnd: false })
  );
}
