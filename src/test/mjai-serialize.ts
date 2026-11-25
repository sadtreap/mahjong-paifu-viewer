/**
 * Test-only GameLog -> mjai serializer that writes the events convlog (the tenhou.net/6 -> mjai
 * converter used by Mortal and mjai-reviewer, src/conv.rs) would write for the same game: the same
 * event order, field names and field order, so `JSON.stringify` output matches convlog's line for
 * line. Used to cross-check parsers: parseMjai(toMjaiJsonl(game)) should give back `game` minus
 * what mjai cannot carry (see stripMjaiUnsupported).
 *
 * Event order follows convlog rather than the model's own order:
 * - reach_accepted is written right before the next draw or call, so a riichi accepted right
 *   before the round ends (the fourth riichi of suucha riichi) is not written at all.
 * - Kan dora are re-timed from the round's indicator list: an ankan reveals one right after the
 *   ankan; a daiminkan or kakan reveals one before the next discard or ankan (before the next
 *   draw instead when that action is another kakan). A riichi discard does not reveal a pending kan
 *   dora (a convlog quirk), so it moves on to the next discard. Indicators convlog never gets to
 *   (e.g. the round ends first) are not written.
 * - Every hora carries the round's ura indicators (the first win's that has any), whoever declared
 *   riichi, as convlog copies the round's list onto each hora.
 *
 * Checked against convlog itself when it was written: for convlog's own test games (the tenhou.net/6
 * fixtures) and for the hand-made game in roundtrip.test.ts, it wrote what convlog writes.
 */
import type {
  CallEvent,
  GameLog,
  Quad,
  Round,
  RoundEvent,
  RyukyokuEvent,
  Seat,
  WinEvent,
} from "../core/model";
import { tenpaiFromDeltas } from "../core/tenpai";
import { type KnownTile, type Tile, tileKind } from "../core/tile";
import { tileToMjai } from "../formats/mjai/tiles";

export type MjaiJsonEvent = { type: string } & Record<string, unknown>;

const BAKAZE = ["E", "S", "W", "N"] as const;

export function toMjaiEvents(game: GameLog): MjaiJsonEvent[] {
  const events: MjaiJsonEvent[] = [
    {
      type: "start_game",
      names: game.players.map((player) => player.name),
      // convlog: 0 for a hanchan, 4 for an east-only game.
      kyoku_first: game.rules.length === "east" ? 4 : 0,
      aka_flag: game.rules.redFives,
    },
  ];
  for (const round of game.rounds) {
    events.push(...roundToMjai(round));
  }
  events.push({ type: "end_game" });
  return events;
}

export function toMjaiJsonl(game: GameLog): string {
  return `${toMjaiEvents(game)
    .map((event) => JSON.stringify(event))
    .join("\n")}\n`;
}

/**
 * Removes what a convlog-flavor mjai log cannot carry, so a game can be compared with
 * parseMjai(toMjaiJsonl(game)). Dropped:
 * - game: id, finalScores, player rank, danIndex and rating, rules.room, openTanyao, fast and
 *   description (format becomes "mjai"); an unknown rules.length becomes "south", as convlog always
 *   writes kyoku_first (0 unless the game is east-only)
 * - win: hand, han, fu, limit, points, yaku, pao, and uraIndicators when empty
 * - ryukyoku: hands, and tenpai unless the draw is exhaustive and its deltas tell the tenpai seats
 *   (parseMjai reads them from the noten payments with tenpaiFromDeltas; an all-tenpai or all-noten
 *   draw pays nothing, so its tenpai is lost)
 *
 * Not handled here (they change event order or values, not just fields): kan dora timing and the
 * dropped reach_accepted described at the top of this file, and ura indicators, which parseMjai
 * keeps only for winners who declared riichi. parseMjai restores a riichiAccepted right before an
 * abortive draw and infers ryukyoku reasons and winning tiles from the events. Every parser already
 * emits kan dora where convlog does and ura indicators only for riichi winners, so parsed games
 * round-trip exactly (src/formats/cross-format.test.ts checks this on every real fixture).
 */
export function stripMjaiUnsupported(game: GameLog): GameLog {
  const stripped: GameLog = {
    format: "mjai",
    players: game.players.map((player) => ({ name: player.name })) as Quad<{ name: string }>,
    rules: { redFives: game.rules.redFives, length: game.rules.length ?? "south" },
    rounds: game.rounds.map((round) => ({
      ...round,
      scores: [...round.scores],
      doraIndicators: [...round.doraIndicators],
      hands: round.hands.map((hand) => [...hand]) as Quad<Tile[]>,
      events: round.events.map(stripEvent),
    })),
  };
  return stripped;
}

function stripEvent(event: RoundEvent): RoundEvent {
  if (event.type === "win") {
    const win: WinEvent = {
      type: "win",
      seat: event.seat,
      from: event.from,
      deltas: [...event.deltas],
    };
    if (event.tile !== undefined) {
      win.tile = event.tile;
    }
    if (event.uraIndicators && event.uraIndicators.length > 0) {
      win.uraIndicators = [...event.uraIndicators];
    }
    return win;
  }
  if (event.type === "ryukyoku") {
    const ryukyoku: RyukyokuEvent = {
      type: "ryukyoku",
      reason: event.reason,
      deltas: [...event.deltas],
    };
    if (event.tenpai && event.reason === "exhaustive" && tenpaiFromDeltas(event.deltas)) {
      ryukyoku.tenpai = [...event.tenpai];
    }
    return ryukyoku;
  }
  return { ...event };
}

function isTake(event: RoundEvent): boolean {
  return (
    event.type === "draw" ||
    event.type === "chi" ||
    event.type === "pon" ||
    event.type === "daiminkan"
  );
}

function tiles(list: readonly Tile[]): string[] {
  return list.map(tileToMjai);
}

function roundToMjai(round: Round): MjaiJsonEvent[] {
  const [startIndicator, ...extraIndicators] = round.doraIndicators;
  if (startIndicator === undefined) {
    throw new Error("convlog needs a dora indicator at the start of every round");
  }
  const out: MjaiJsonEvent[] = [
    {
      type: "start_kyoku",
      bakaze: BAKAZE[round.wind],
      dora_marker: tileToMjai(startIndicator),
      kyoku: round.number,
      honba: round.honba,
      kyotaku: round.riichiSticks,
      oya: round.dealer,
      scores: [...round.scores],
      tehais: round.hands.map(tiles),
    },
  ];

  // convlog only knows the round's indicator list and decides itself when each one is revealed.
  const doraQueue: KnownTile[] = [...extraIndicators];
  for (const event of round.events) {
    if (event.type === "dora") {
      doraQueue.push(event.indicator);
    }
  }
  const revealDora = () => {
    const indicator = doraQueue.shift();
    if (indicator !== undefined) {
      out.push({ type: "dora", dora_marker: tileToMjai(indicator) });
    }
  };

  const firstUra = round.events.find(
    (event): event is WinEvent => event.type === "win" && (event.uraIndicators?.length ?? 0) > 0,
  );
  const uraMarkers = tiles(firstUra?.uraIndicators ?? []);

  const lastTake = round.events.findLastIndex(isTake);
  const pons = new Map<string, CallEvent>();
  const pendingAccepts: Seat[] = [];
  let doraAtDiscard = false;
  let doraAtDraw = false;

  const acceptRiichi = () => {
    for (const seat of pendingAccepts.splice(0)) {
      out.push({ type: "reach_accepted", actor: seat });
    }
  };

  for (const [index, event] of round.events.entries()) {
    switch (event.type) {
      case "draw":
        acceptRiichi();
        if (doraAtDraw) {
          revealDora();
          doraAtDraw = false;
        }
        out.push({ type: "tsumo", actor: event.seat, pai: tileToMjai(event.tile) });
        break;
      case "chi":
      case "pon":
      case "daiminkan":
        acceptRiichi();
        if (event.type === "daiminkan" && doraAtDiscard) {
          revealDora();
        }
        out.push({
          type: event.type,
          actor: event.seat,
          target: event.from,
          pai: tileToMjai(event.tile),
          consumed: tiles(event.consumed),
        });
        if (event.type === "pon") {
          pons.set(`${event.seat}:${tileKind(event.tile)}`, event);
        }
        if (event.type === "daiminkan") {
          doraAtDiscard = true;
        }
        break;
      case "discard":
        if (event.riichi) {
          out.push({ type: "reach", actor: event.seat });
        } else if (doraAtDiscard) {
          revealDora();
          doraAtDiscard = false;
        }
        out.push({
          type: "dahai",
          actor: event.seat,
          pai: tileToMjai(event.tile),
          tsumogiri: event.tsumogiri,
        });
        break;
      case "ankan":
        if (doraAtDiscard) {
          revealDora();
          doraAtDiscard = false;
        }
        out.push({ type: "ankan", actor: event.seat, consumed: tiles(event.tiles) });
        // convlog checks for the round end (a kokushi ron on the ankan) before revealing it.
        if (index < lastTake) {
          revealDora();
        }
        break;
      case "kakan": {
        if (doraAtDiscard) {
          doraAtDraw = true;
        }
        const pon = pons.get(`${event.seat}:${tileKind(event.tile)}`);
        out.push({
          type: "kakan",
          actor: event.seat,
          pai: tileToMjai(event.tile),
          consumed: tiles(pon ? kakanConsumed(pon) : [event.tile, event.tile, event.tile]),
        });
        doraAtDiscard = true;
        break;
      }
      case "riichiAccepted":
        pendingAccepts.push(event.seat);
        break;
      case "dora":
        // Re-timed through doraQueue.
        break;
      case "win":
        out.push({
          type: "hora",
          actor: event.seat,
          target: event.from,
          deltas: [...event.deltas],
          ura_markers: uraMarkers,
        });
        break;
      case "ryukyoku":
        out.push({ type: "ryukyoku", deltas: [...event.deltas] });
        break;
    }
  }
  out.push({ type: "end_kyoku" });
  return out;
}

/**
 * The pon's three tiles in tenhou.net/6 meld-string order, which convlog keeps for kakan: the called
 * tile sits first, in the middle or last for a pon from the left, across or right.
 */
function kakanConsumed(pon: CallEvent): Tile[] {
  const [first, second] = pon.consumed as [Tile, Tile];
  switch ((pon.from - pon.seat + 4) % 4) {
    case 3:
      return [pon.tile, first, second];
    case 2:
      return [first, pon.tile, second];
    default:
      return [first, second, pon.tile];
  }
}
