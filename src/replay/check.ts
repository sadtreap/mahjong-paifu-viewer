import type { GameLog, PlayerCount, Quad, Round, RoundEvent, Seat } from "../core/model";
import { activeSeats, SANMA_UNUSED_KINDS } from "../core/players";
import { isKnownTile, isRedFive, isTile, normalizeTile, type Tile, tileKind } from "../core/tile";
import { asSeat, type IssueSink, isWin, quad, RIICHI_DEPOSIT, RoundReplay } from "./engine";
import type { ReplayIssue } from "./types";

/**
 * Replays a round strictly and reports every inconsistency (empty array = consistent).
 * `playerCount` is the game's (GameLog.playerCount); with 3, seat 3 must be the empty chair.
 */
export function checkRound(round: Round, playerCount: PlayerCount = 4): ReplayIssue[] {
  const issues: ReplayIssue[] = [];
  inspectRound(
    round,
    (eventIndex, message) => issues.push({ eventIndex, message }),
    playerCount === 3 ? 3 : 4,
  );
  return byEvent(issues);
}

/**
 * Checks the player count, every round plus score continuity between rounds and against final
 * scores. A three-player game must keep the empty chair's placeholders (see model.ts): player slot
 * 3 is exactly `{ name: "" }`, and seat 3 has no tiles, events, points or deltas.
 */
export function checkGame(game: GameLog): ReplayIssue[] {
  if (typeof game !== "object" || game === null) {
    return [{ eventIndex: -1, message: "The game is not an object" }];
  }
  const issues: ReplayIssue[] = [];
  const declared: unknown = game.playerCount;
  if (declared !== 3 && declared !== 4) {
    issues.push({ eventIndex: -1, message: `Invalid player count ${String(declared)}` });
  }
  const playerCount: PlayerCount = declared === 3 ? 3 : 4;
  if (!Array.isArray(game.players) || game.players.length !== 4) {
    issues.push({ eventIndex: -1, message: "A game needs exactly four player slots" });
  } else if (playerCount === 3 && !isEmptyChair(game.players[3])) {
    issues.push({
      eventIndex: -1,
      message: `Player slot 3 of a three-player game is ${JSON.stringify(game.players[3]) ?? "undefined"} instead of {"name":""}`,
    });
  }
  const rounds: readonly Round[] = Array.isArray(game.rounds) ? game.rounds : [];
  if (rounds.length === 0) {
    issues.push({ eventIndex: -1, message: "The game has no rounds" });
  }
  const redFives = game.rules?.redFives;
  let previous: { round: Round; replay: RoundReplay } | null = null;
  for (const [roundIndex, round] of rounds.entries()) {
    const roundIssues: ReplayIssue[] = [];
    const report: IssueSink = (eventIndex, message) =>
      roundIssues.push({ roundIndex, eventIndex, message });
    const replay = inspectRound(round, report, playerCount);
    if (previous !== null) {
      checkContinuity(previous.round, previous.replay, round, report);
    }
    if (typeof redFives === "boolean") {
      checkRedFives(round, redFives, report);
    }
    if (roundIndex === rounds.length - 1 && game.finalScores !== undefined) {
      checkFinalScores(replay, game.finalScores, lastEventIndex(round), report, playerCount);
    }
    issues.push(...byEvent(roundIssues));
    previous = { round, replay };
  }
  return issues;
}

/** The placeholder of the empty chair: exactly `{ name: "" }`. */
function isEmptyChair(player: unknown): boolean {
  return (
    typeof player === "object" &&
    player !== null &&
    Object.keys(player).length === 1 &&
    (player as { name?: unknown }).name === ""
  );
}

function inspectRound(round: Round, report: IssueSink, playerCount: PlayerCount): RoundReplay {
  checkStart(round, report, playerCount);
  const replay = new RoundReplay(round, report, playerCount);
  const events = eventsOf(round);
  for (const [index, event] of events.entries()) {
    replay.apply(event, index);
  }
  replay.finish(events.length - 1);
  checkTileCounts(round, report, playerCount);
  return replay;
}

function eventsOf(round: Round): readonly RoundEvent[] {
  return typeof round === "object" && round !== null && Array.isArray(round.events)
    ? round.events
    : [];
}

function lastEventIndex(round: Round): number {
  return eventsOf(round).length - 1;
}

/** Stable sort by event index, so start-state issues (-1) come first. */
function byEvent(issues: ReplayIssue[]): ReplayIssue[] {
  return issues.sort((a, b) => a.eventIndex - b.eventIndex);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isScoreList(value: unknown): value is Quad<number> {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function checkStart(round: Round, report: IssueSink, playerCount: PlayerCount): void {
  if (typeof round !== "object" || round === null) {
    report(-1, "The round is not an object");
    return;
  }
  const sanma = playerCount === 3;
  if (!(isNonNegativeInteger(round.wind) && round.wind <= 3)) {
    report(-1, `Invalid prevailing wind ${String(round.wind)}`);
  }
  const numberValid =
    Number.isInteger(round.number) && round.number >= 1 && round.number <= playerCount;
  if (!numberValid) {
    report(
      -1,
      `Invalid round number ${String(round.number)}${sanma ? " in a three-player game" : ""}`,
    );
  }
  const dealer = asSeat(round.dealer);
  if (dealer === null) {
    report(-1, `Invalid dealer ${String(round.dealer)}`);
  } else if (sanma && dealer === 3) {
    report(-1, "Dealer seat 3 is the empty chair of a three-player game");
  } else if (numberValid && dealer !== round.number - 1) {
    report(-1, `Dealer seat ${dealer} does not match round number ${round.number}`);
  }
  if (!isNonNegativeInteger(round.honba)) {
    report(-1, `Invalid honba count ${String(round.honba)}`);
  }
  if (!isNonNegativeInteger(round.riichiSticks)) {
    report(-1, `Invalid riichi deposit count ${String(round.riichiSticks)}`);
  }
  if (!isScoreList(round.scores)) {
    report(-1, "Start scores are not four numbers");
  } else if (sanma && round.scores[3] !== 0) {
    report(
      -1,
      `The empty seat 3 of a three-player game starts with ${round.scores[3]} points instead of 0`,
    );
  }
  const hands: unknown = round.hands;
  if (!Array.isArray(hands) || hands.length !== 4) {
    report(-1, "Expected four starting hands");
  } else {
    for (const [seat, hand] of hands.entries()) {
      if (!Array.isArray(hand)) {
        report(-1, `The starting hand of seat ${seat} is not a list of tiles`);
        continue;
      }
      if (sanma && seat === 3) {
        if (hand.length !== 0) {
          report(
            -1,
            `The empty seat 3 of a three-player game is dealt ${hand.length} tiles instead of none`,
          );
        }
      } else if (hand.length !== 13) {
        report(-1, `The starting hand of seat ${seat} has ${hand.length} tiles instead of 13`);
      }
      const invalid = hand.filter((tile: unknown) => typeof tile !== "string" || !isTile(tile));
      if (invalid.length > 0) {
        report(-1, `The starting hand of seat ${seat} has invalid tiles: ${invalid.join(", ")}`);
      }
    }
  }
  const indicators: unknown = round.doraIndicators;
  if (!Array.isArray(indicators) || indicators.length < 1 || indicators.length > 5) {
    report(-1, "Expected one to five starting dora indicators");
  } else if (
    !indicators.every((tile: unknown) => typeof tile === "string" && isTile(tile) && tile !== "?")
  ) {
    report(-1, `Invalid starting dora indicators: ${indicators.join(", ")}`);
  }
  if (!Array.isArray(round.events)) {
    report(-1, "The round has no event list");
  }
}

/**
 * Every physical tile the round shows once: dealt tiles, draws and dora/ura indicators (discards and
 * calls move tiles that were already counted). Unknown tiles are skipped.
 */
function visibleTiles(round: Round): Array<{ tile: Tile; eventIndex: number }> {
  const seen: Array<{ tile: Tile; eventIndex: number }> = [];
  const add = (value: unknown, eventIndex: number) => {
    if (typeof value === "string" && isTile(value) && isKnownTile(value)) {
      seen.push({ tile: value, eventIndex });
    }
  };
  if (typeof round !== "object" || round === null) {
    return seen;
  }
  for (const hand of Array.isArray(round.hands) ? round.hands : []) {
    for (const tile of Array.isArray(hand) ? hand : []) {
      add(tile, -1);
    }
  }
  for (const tile of Array.isArray(round.doraIndicators) ? round.doraIndicators : []) {
    add(tile, -1);
  }
  // Ura indicators are shared by every winner of a multiple ron, so only the longest list counts.
  let ura: { tiles: unknown[]; eventIndex: number } | null = null;
  for (const [index, event] of eventsOf(round).entries()) {
    if (typeof event !== "object" || event === null) {
      continue;
    }
    if (event.type === "draw") {
      add(event.tile, index);
    } else if (event.type === "dora") {
      add(event.indicator, index);
    } else if (
      event.type === "win" &&
      Array.isArray(event.uraIndicators) &&
      event.uraIndicators.length > (ura?.tiles.length ?? 0)
    ) {
      ura = { tiles: event.uraIndicators, eventIndex: index };
    }
  }
  if (ura !== null) {
    for (const tile of ura.tiles) {
      add(tile, ura.eventIndex);
    }
  }
  return seen;
}

/** At most four tiles of a kind; with three players, no 2m-8m (and so no red 5m) at all. */
function checkTileCounts(round: Round, report: IssueSink, playerCount: PlayerCount): void {
  const counts = new Map<number, number>();
  for (const { tile, eventIndex } of visibleTiles(round)) {
    const kind = tileKind(tile);
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    if (playerCount === 3 && SANMA_UNUSED_KINDS.has(kind)) {
      if (count === 1) {
        report(eventIndex, `${tile} appears in a three-player game, which has no 2m-8m`);
      }
    } else if (count === 5) {
      report(eventIndex, `More than four ${normalizeTile(tile)} tiles appear in the round`);
    }
  }
}

function checkRedFives(round: Round, redFives: boolean, report: IssueSink): void {
  const reds = new Map<string, number>();
  const plain = new Map<string, number>();
  for (const { tile, eventIndex } of visibleTiles(round)) {
    const suit = tile[1] as string;
    if (isRedFive(tile)) {
      const count = (reds.get(suit) ?? 0) + 1;
      reds.set(suit, count);
      if (!redFives && count === 1) {
        report(eventIndex, `Red five ${tile} in a game without red fives`);
      } else if (redFives && count === 2) {
        report(eventIndex, `More than one red five ${tile} appears in the round`);
      }
    } else if (tile[0] === "5" && suit !== "z") {
      const count = (plain.get(suit) ?? 0) + 1;
      plain.set(suit, count);
      if (redFives && count === 4) {
        report(
          eventIndex,
          `Four plain ${tile} tiles in a game with red fives (one of them should be 0${suit})`,
        );
      }
    }
  }
}

function checkContinuity(
  previousRound: Round,
  previous: RoundReplay,
  round: Round,
  report: IssueSink,
): void {
  if (previous.results.length === 0 || typeof round !== "object" || round === null) {
    // The missing result is already reported; there is no end state to compare with.
    return;
  }
  const endScores = previous.seats.map((view) => view.score);
  if (isScoreList(round.scores) && round.scores.some((score, seat) => score !== endScores[seat])) {
    report(
      -1,
      `Start scores ${round.scores.join(", ")} differ from the previous round's end scores ${endScores.join(", ")}`,
    );
  }
  if (round.riichiSticks !== previous.riichiSticks) {
    report(
      -1,
      `The round starts with ${String(round.riichiSticks)} riichi deposits, but ${previous.riichiSticks} were left on the table`,
    );
  }
  const wins = previous.results.filter(isWin);
  const renchan = wins.length === 0 || wins.some((win) => win.seat === previousRound.dealer);
  const expectedHonba = renchan ? previous.honba + 1 : 0;
  if (round.honba !== expectedHonba) {
    report(
      -1,
      `The round starts with honba ${String(round.honba)}, expected ${expectedHonba} after the previous result`,
    );
  }
}

/**
 * Final scores must equal the last round's end scores. Tenhou gives deposits still on the table at
 * the end to the top player (ties go to the seat nearest the first dealer), so that is accepted too.
 */
function checkFinalScores(
  last: RoundReplay,
  finalScores: unknown,
  eventIndex: number,
  report: IssueSink,
  playerCount: PlayerCount,
): void {
  if (!isScoreList(finalScores)) {
    report(eventIndex, "Final scores are not four numbers");
    return;
  }
  const endScores = quad((seat) => last.seats[seat].score);
  const equals = (scores: Quad<number>) =>
    scores.every((score, seat) => score === finalScores[seat]);
  if (equals(endScores)) {
    return;
  }
  const leftover = last.riichiSticks;
  if (leftover > 0) {
    let top: Seat = 0;
    for (const seat of activeSeats(playerCount)) {
      if (endScores[seat] > endScores[top]) {
        top = seat;
      }
    }
    const withDeposits = quad(
      (seat) => endScores[seat] + (seat === top ? leftover * RIICHI_DEPOSIT : 0),
    );
    if (equals(withDeposits)) {
      return;
    }
  }
  report(
    eventIndex,
    `Final scores ${finalScores.join(", ")} differ from the last round's end scores ${endScores.join(", ")}${leftover > 0 ? ` (${leftover} riichi deposits left on the table)` : ""}`,
  );
}
