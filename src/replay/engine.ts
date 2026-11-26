import type {
  AnkanEvent,
  CallEvent,
  DiscardEvent,
  DoraEvent,
  DrawEvent,
  KakanEvent,
  KitaEvent,
  PlayerCount,
  Quad,
  RiichiAcceptedEvent,
  Round,
  RoundEvent,
  RyukyokuEvent,
  RyukyokuReason,
  Seat,
  WinEvent,
} from "../core/model";
import { SEATS } from "../core/model";
import {
  activeSeats,
  isActiveSeat,
  LIVE_WALL_SIZE,
  NOTEN_PENALTY_TOTAL,
  nextSeat,
} from "../core/players";
import {
  compareTiles,
  isKnownTile,
  isSameKind,
  isTile,
  type KnownTile,
  sortTiles,
  type Tile,
  tileKind,
  UNKNOWN_TILE,
} from "../core/tile";
import type { BoardState, MeldView, SeatView } from "./types";

/** Receives one diagnostic of the strict replay. */
export type IssueSink = (eventIndex: number, message: string) => void;

const HAND_SIZE = 13;
const MAX_KANS = 4;
export const RIICHI_DEPOSIT = 1000;

type Phase = "draw" | "discard";

/**
 * The latest tile another seat may claim: a discard, the tile of a kan (chankan) or a North set
 * aside as kita (three-player games, where a ron on it is allowed).
 */
interface Claimable {
  kind: "discard" | "kakan" | "ankan" | "kita";
  seat: Seat;
  tile: Tile;
  /** The discard declared riichi. */
  riichi: boolean;
  /** A riichiAccepted event already followed the discard. */
  riichiAccepted: boolean;
}

const IGNORE_ISSUES: IssueSink = () => {};

export function quad<T>(make: (seat: Seat) => T): Quad<T> {
  return [make(0), make(1), make(2), make(3)];
}

export function asSeat(value: unknown): Seat | null {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : null;
}

function asKnownTile(value: unknown): KnownTile | null {
  return typeof value === "string" && isTile(value) && isKnownTile(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function isWin(result: WinEvent | RyukyokuEvent): result is WinEvent {
  return result.type === "win";
}

function formatTiles(tiles: readonly Tile[]): string {
  return tiles.length === 0 ? "(none)" : tiles.join(" ");
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** The four-player seat to the left, whose discards a seat may chi. */
const leftSeat = (seat: Seat): Seat => ((seat + 3) % 4) as Seat;

/** Abortive draws that need four players: four winds, four riichi and a triple ron. */
const FOUR_PLAYER_DRAWS: ReadonlySet<RyukyokuReason> = new Set([
  "suufonRenda",
  "suuchaRiichi",
  "sanchaHou",
]);

/** The North tile, the only tile a kita sets aside. */
const NORTH = "4z";

/** Same tile, or one side is unknown. */
function tilesMatch(a: Tile, b: Tile): boolean {
  return a === b || a === UNKNOWN_TILE || b === UNKNOWN_TILE;
}

/** Removes `tile` from a sorted hand; a "?" stands in for a missing known tile. */
function takeExact(hand: Tile[], tile: Tile): Tile | null {
  let index = hand.indexOf(tile);
  if (index < 0 && tile !== UNKNOWN_TILE) {
    index = hand.indexOf(UNKNOWN_TILE);
  }
  return index < 0 ? null : (hand.splice(index, 1)[0] ?? null);
}

/** Removes a tile of the same kind but a different face (a red five for a plain five or back). */
function takeSameKind(hand: Tile[], tile: Tile): Tile | null {
  const index = hand.findIndex((held) => isSameKind(held, tile));
  return index < 0 ? null : (hand.splice(index, 1)[0] ?? null);
}

/** True when the known tiles all share one kind ("?" is ignored). */
function allSameKind(tiles: readonly Tile[]): boolean {
  const kinds = new Set(tiles.filter(isKnownTile).map(tileKind));
  return kinds.size <= 1;
}

/** True for three suited tiles in a row; tiles with "?" cannot be judged and pass. */
function isSequence(tiles: readonly Tile[]): boolean {
  if (tiles.length !== 3) {
    return false;
  }
  if (!tiles.every(isKnownTile)) {
    return true;
  }
  const kinds = tiles.map(tileKind).sort((a, b) => a - b);
  const [low = -1, middle = -1, high = -1] = kinds;
  return (
    low < 27 &&
    Math.floor(low / 9) === Math.floor(high / 9) &&
    middle === low + 1 &&
    high === low + 2
  );
}

/** Multiset equality where a "?" on either side matches any one tile. */
function sameTiles(a: readonly Tile[], b: readonly Tile[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const rest = [...b];
  const unmatched: Tile[] = [];
  for (const tile of a) {
    const index = rest.indexOf(tile);
    if (index >= 0) {
      rest.splice(index, 1);
    } else {
      unmatched.push(tile);
    }
  }
  const unknownIn = (tiles: Tile[]) => tiles.filter((tile) => tile === UNKNOWN_TILE).length;
  const knownIn = (tiles: Tile[]) => tiles.length - unknownIn(tiles);
  return knownIn(unmatched) <= unknownIn(rest) && knownIn(rest) <= unknownIn(unmatched);
}

/**
 * Exhaustive-draw payments: the noten penalty (3000 points, or 2000 with three players) split
 * between the tenpai and the noten seats. The empty chair of a three-player game neither pays nor
 * receives.
 */
function tenpaiPayments(tenpai: readonly Seat[], playerCount: PlayerCount): Quad<number> {
  const seats = activeSeats(playerCount);
  const count = new Set(tenpai.filter((seat) => seats.includes(seat))).size;
  if (count === 0 || count === seats.length) {
    return [0, 0, 0, 0];
  }
  const total = NOTEN_PENALTY_TOTAL[playerCount];
  return quad((seat) => {
    if (!seats.includes(seat)) {
      return 0;
    }
    return tenpai.includes(seat) ? total / count : -total / (seats.length - count);
  });
}

function copyMeld(meld: MeldView): MeldView {
  return { ...meld, tiles: [...meld.tiles] };
}

function copySeat(view: SeatView): SeatView {
  return {
    hand: [...view.hand],
    drawn: view.drawn,
    melds: view.melds.map(copyMeld),
    kita: [...view.kita],
    discards: view.discards.map((discard) => ({ ...discard })),
    score: view.score,
    riichi: view.riichi,
  };
}

/**
 * Mutable table state that applies round events one by one. It never throws: inconsistent events are
 * applied as well as possible and reported to the issue sink (the timeline ignores them, the strict
 * checker collects them).
 *
 * With three players (`playerCount` 3) turns pass from seat 2 back to seat 0, the live wall holds 55
 * tiles and the noten penalty is 2000; seat 3 is the empty chair, so any event or result value for
 * it, a chi and a four-player-only abortive draw are reported. A kita sets a North aside from the
 * drawn tile or the hand (SeatView.kita), lets the other seats ron it and gives the same seat a
 * replacement draw, which counts against the live wall like every draw. A kita right after a chi or
 * pon (Tenhou forbids it), one in riichi that takes a North from the hand (the locked hand would
 * change) and one on an empty wall (no tile is left for the replacement) are reported.
 */
export class RoundReplay {
  readonly seats: Quad<SeatView>;
  readonly doraIndicators: KnownTile[];
  readonly honba: number;
  /** 3 or 4; any other value given to the constructor replays as four players. */
  readonly playerCount: PlayerCount;
  riichiSticks: number;
  wallRemaining: number;
  readonly results: Array<WinEvent | RyukyokuEvent> = [];

  private readonly report: IssueSink;
  private turn: { seat: Seat; phase: Phase } | null;
  private claimable: Claimable | null = null;
  private pendingRiichi: { seat: Seat; eventIndex: number } | null = null;
  /**
   * Seats that declared riichi, accepted or not, for the strict checks (a riichi seat discards only
   * its drawn tile and never calls). SeatView.riichi differs: it is set only once the deposit is paid.
   */
  private readonly riichiDeclared = [false, false, false, false];
  /** The seat that made the latest chi or pon and has not drawn since, with the call's type. */
  private openCall: { seat: Seat; type: CallEvent["type"] } | null = null;
  private kans = 0;
  private doraEvents = 0;
  /** Riichi deposits on the table when the first win was applied, and that win's index. */
  private firstWin: { eventIndex: number; sticks: number } | null = null;
  private winDeltaTotal = 0;
  /** Hand size problems are reported once per seat, since one missing tile skews every later turn. */
  private readonly sizeReported = [false, false, false, false];

  constructor(round: Round, report: IssueSink = IGNORE_ISSUES, playerCount: PlayerCount = 4) {
    this.report = report;
    this.playerCount = playerCount === 3 ? 3 : 4;
    this.wallRemaining = LIVE_WALL_SIZE[this.playerCount];
    const source: Partial<Round> = typeof round === "object" && round !== null ? round : {};
    const hands: unknown[] = Array.isArray(source.hands) ? source.hands : [];
    const scores: unknown[] = Array.isArray(source.scores) ? source.scores : [];
    this.seats = quad((seat) => ({
      hand: sortTiles(this.tileList(hands[seat], -1, false)),
      drawn: null,
      melds: [],
      kita: [],
      discards: [],
      score: finiteOr(scores[seat], 0),
      riichi: false,
    }));
    const indicators: unknown[] = Array.isArray(source.doraIndicators) ? source.doraIndicators : [];
    this.doraIndicators = indicators.flatMap((value) => asKnownTile(value) ?? []);
    this.honba = nonNegativeInteger(source.honba);
    this.riichiSticks = nonNegativeInteger(source.riichiSticks);
    const dealer = asSeat(source.dealer);
    this.turn = dealer === null ? null : { seat: dealer, phase: "draw" };
  }

  /** Applies one event; never throws. */
  apply(event: RoundEvent, eventIndex: number): void {
    try {
      this.applyEvent(event, eventIndex);
    } catch (error) {
      this.report(
        eventIndex,
        `Replay error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Reports problems that only show once every event is applied. */
  finish(lastEventIndex: number): void {
    if (this.results.length === 0) {
      this.report(lastEventIndex, "The round ends without a win or draw result");
    }
    if (this.firstWin !== null) {
      const expected = this.firstWin.sticks * RIICHI_DEPOSIT;
      if (this.winDeltaTotal !== expected) {
        this.report(
          this.firstWin.eventIndex,
          `Win deltas add up to ${this.winDeltaTotal}, but ${this.firstWin.sticks} riichi deposits (${expected} points) were on the table`,
        );
      }
    }
  }

  snapshot(eventIndex: number, lastEvent: RoundEvent | null, activeSeat: Seat | null): BoardState {
    return {
      seats: quad((seat) => copySeat(this.seats[seat])),
      doraIndicators: [...this.doraIndicators],
      riichiSticks: this.riichiSticks,
      honba: this.honba,
      wallRemaining: this.wallRemaining,
      eventIndex,
      lastEvent,
      activeSeat,
      results: [...this.results],
    };
  }

  private applyEvent(event: RoundEvent, index: number): void {
    if (typeof event !== "object" || event === null) {
      this.report(index, "The event is not an object");
      return;
    }
    const type: string = event.type;
    if (this.results.length > 0 && !(type === "win" && this.results.every(isWin))) {
      this.report(index, `A "${type}" event follows the round result`);
    }
    const pending = this.pendingRiichi;
    if (pending !== null && type !== "riichiAccepted" && type !== "dora") {
      if (type !== "win" && type !== "ryukyoku") {
        this.report(
          index,
          `The riichi discard of seat ${pending.seat} (event ${pending.eventIndex}) is not followed by riichiAccepted`,
        );
      }
      this.pendingRiichi = null;
    }
    switch (event.type) {
      case "draw":
        this.draw(event, index);
        break;
      case "discard":
        this.discard(event, index);
        break;
      case "chi":
      case "pon":
      case "daiminkan":
        this.call(event, index);
        break;
      case "ankan":
        this.ankan(event, index);
        break;
      case "kakan":
        this.kakan(event, index);
        break;
      case "riichiAccepted":
        this.riichiAccepted(event, index);
        break;
      case "dora":
        this.dora(event, index);
        break;
      case "kita":
        this.kita(event, index);
        break;
      case "win":
        this.win(event, index);
        break;
      case "ryukyoku":
        this.ryukyoku(event, index);
        break;
      default:
        this.report(index, `Unknown event type "${type}"`);
    }
  }

  private draw(event: DrawEvent, index: number): void {
    const seat = this.seat(event.seat, index);
    if (seat === null) {
      return;
    }
    const tile = this.tile(event.tile, index);
    this.expectTurn(seat, "draw", index, "draws");
    this.expectSize(seat, HAND_SIZE, index, "before drawing");
    if (this.wallRemaining <= 0) {
      this.report(index, `Seat ${seat} draws from an empty wall`);
    }
    this.wallRemaining = Math.max(0, this.wallRemaining - 1);
    const view = this.seats[seat];
    this.mergeDrawn(view);
    view.drawn = tile;
    this.turn = { seat, phase: "discard" };
    this.claimable = null;
    this.openCall = null;
  }

  private discard(event: DiscardEvent, index: number): void {
    const seat = this.seat(event.seat, index);
    if (seat === null) {
      return;
    }
    const tile = this.tile(event.tile, index);
    const tsumogiri = event.tsumogiri === true;
    const riichi = event.riichi === true;
    const view = this.seats[seat];
    this.expectTurn(seat, "discard", index, "discards");
    this.expectSize(seat, HAND_SIZE + 1, index, "before discarding");
    if (riichi) {
      if (this.riichiDeclared[seat]) {
        this.report(index, `Seat ${seat} declares riichi a second time`);
      }
      if (view.melds.some((meld) => meld.type !== "ankan")) {
        this.report(index, `Seat ${seat} declares riichi with an open hand`);
      }
    } else if (this.riichiDeclared[seat] && !tsumogiri) {
      this.report(index, `Seat ${seat} is in riichi but discards ${tile} from the hand`);
    }
    this.removeDiscard(seat, tile, tsumogiri, index);
    view.discards.push({ tile, tsumogiri, riichi, called: false });
    if (riichi) {
      // Only riichiAccepted sets view.riichi: a declaration tile that is ronned pays no deposit.
      this.riichiDeclared[seat] = true;
      this.pendingRiichi = { seat, eventIndex: index };
    }
    this.claimable = { kind: "discard", seat, tile, riichi, riichiAccepted: false };
    this.turn = { seat: nextSeat(seat, this.playerCount), phase: "draw" };
  }

  /** Takes a discarded tile from the drawn tile or the hand, preferring what the flags say. */
  private removeDiscard(seat: Seat, tile: Tile, tsumogiri: boolean, index: number): void {
    const view = this.seats[seat];
    const drawn = view.drawn;
    if (tsumogiri && drawn !== null && (tilesMatch(drawn, tile) || isSameKind(drawn, tile))) {
      if (drawn !== tile && drawn !== UNKNOWN_TILE && tile !== UNKNOWN_TILE) {
        this.report(index, `Seat ${seat} discards ${tile} as tsumogiri but drew ${drawn}`);
      }
      view.drawn = null;
      return;
    }
    if (tsumogiri) {
      this.report(
        index,
        drawn === null
          ? `Seat ${seat} discards ${tile} as tsumogiri without a drawn tile`
          : `Seat ${seat} discards ${tile} as tsumogiri but drew ${drawn}`,
      );
    }
    if (takeExact(view.hand, tile) !== null) {
      this.mergeDrawn(view);
      return;
    }
    if (drawn !== null && tilesMatch(drawn, tile)) {
      if (!tsumogiri) {
        this.report(
          index,
          `Seat ${seat} discards ${tile} from the hand, but only its drawn tile is ${tile}`,
        );
      }
      view.drawn = null;
      return;
    }
    const substitute = takeSameKind(view.hand, tile);
    if (substitute !== null) {
      this.report(index, `Seat ${seat} discards ${tile} but holds ${substitute}`);
      this.mergeDrawn(view);
      return;
    }
    if (drawn !== null && isSameKind(drawn, tile)) {
      this.report(index, `Seat ${seat} discards ${tile} but drew ${drawn}`);
      view.drawn = null;
      return;
    }
    this.report(index, `Seat ${seat} discards ${tile}, which is not in its hand`);
    this.mergeDrawn(view);
  }

  private call(event: CallEvent, index: number): void {
    const seat = this.seat(event.seat, index);
    const from = this.seat(event.from, index, "from seat");
    if (seat === null || from === null) {
      return;
    }
    const type = event.type;
    const tile = this.tile(event.tile, index);
    const consumed = this.tileList(event.consumed, index);
    const view = this.seats[seat];
    if (from === seat) {
      this.report(index, `Seat ${seat} calls ${type} on its own discard`);
    } else {
      this.expectClaim(seat, from, tile, type, index);
    }
    if (this.riichiDeclared[seat]) {
      this.report(index, `Seat ${seat} calls ${type} while in riichi`);
    }
    this.expectSize(seat, HAND_SIZE, index, `before calling ${type}`);
    const expectedCount = type === "daiminkan" ? 3 : 2;
    const meldTiles = [tile, ...consumed];
    if (consumed.length !== expectedCount) {
      this.report(
        index,
        `The ${type} of seat ${seat} uses ${consumed.length} tiles from the hand, expected ${expectedCount}`,
      );
    } else if (type === "chi" && !isSequence(meldTiles)) {
      this.report(index, `The chi ${formatTiles(meldTiles)} of seat ${seat} is not a sequence`);
    } else if (type !== "chi" && !allSameKind(meldTiles)) {
      this.report(index, `The ${type} ${formatTiles(meldTiles)} of seat ${seat} mixes tile kinds`);
    }
    if (type === "chi" && this.playerCount === 3) {
      this.report(index, `Seat ${seat} calls chi in a three-player game`);
    } else if (type === "chi" && from !== leftSeat(seat)) {
      this.report(
        index,
        `Seat ${seat} calls chi from seat ${from}, which is not the seat to its left`,
      );
    }
    if (type === "daiminkan") {
      this.countKan(index);
    }

    this.mergeDrawn(view);
    for (const used of consumed) {
      this.takeFromHand(seat, used, index, type);
    }
    view.melds.push({ type, tiles: sortTiles(consumed), from, calledTile: tile });
    const calledDiscard = this.seats[from].discards.at(-1);
    if (calledDiscard !== undefined) {
      calledDiscard.called = true;
    }
    this.claimable = null;
    this.turn = { seat, phase: type === "daiminkan" ? "draw" : "discard" };
    this.openCall = type === "daiminkan" ? null : { seat, type };
  }

  private ankan(event: AnkanEvent, index: number): void {
    const seat = this.seat(event.seat, index);
    if (seat === null) {
      return;
    }
    const tiles = this.tileList(event.tiles, index);
    this.expectTurn(seat, "discard", index, "declares an ankan");
    this.expectSize(seat, HAND_SIZE + 1, index, "before an ankan");
    if (tiles.length !== 4 || !allSameKind(tiles)) {
      this.report(
        index,
        `The ankan ${formatTiles(tiles)} of seat ${seat} is not four tiles of one kind`,
      );
    }
    this.countKan(index);
    const view = this.seats[seat];
    this.mergeDrawn(view);
    for (const used of tiles) {
      this.takeFromHand(seat, used, index, "ankan");
    }
    view.melds.push({ type: "ankan", tiles: sortTiles(tiles) });
    const tile = tiles.find(isKnownTile) ?? UNKNOWN_TILE;
    this.claimable = { kind: "ankan", seat, tile, riichi: false, riichiAccepted: false };
    this.turn = { seat, phase: "draw" };
  }

  private kakan(event: KakanEvent, index: number): void {
    const seat = this.seat(event.seat, index);
    if (seat === null) {
      return;
    }
    const tile = this.tile(event.tile, index);
    this.expectTurn(seat, "discard", index, "declares a kakan");
    this.expectSize(seat, HAND_SIZE + 1, index, "before a kakan");
    this.countKan(index);
    const view = this.seats[seat];
    this.mergeDrawn(view);
    this.takeFromHand(seat, tile, index, "kakan");
    const pon = view.melds.find(
      (meld) =>
        meld.type === "pon" &&
        (tile === UNKNOWN_TILE ||
          [meld.calledTile, ...meld.tiles].some(
            (held) => held !== undefined && isSameKind(held, tile),
          )),
    );
    if (pon === undefined) {
      this.report(index, `Seat ${seat} adds ${tile} as a kakan without a pon of that tile`);
    } else {
      pon.type = "kakan";
      pon.addedTile = tile;
    }
    this.claimable = { kind: "kakan", seat, tile, riichi: false, riichiAccepted: false };
    this.turn = { seat, phase: "draw" };
  }

  /**
   * Sets a North aside. Logs do not say whether it was the tile just drawn (Tenhou does not mark
   * it), so the drawn tile is taken when it is a North, then a North from the hand; in a hand
   * recorded from another seat a "?" stands in for it, the drawn one first. Not a kan, so it
   * reveals no dora and counts towards no kan limit. Allowed in riichi, but only with the North
   * just drawn, since one from the hand would change the locked hand. Reported right after a chi
   * or pon (Tenhou's rules: "ポンの直後は抜けない") and on an empty wall, which has no tile left for
   * the replacement draw.
   */
  private kita(event: KitaEvent, index: number): void {
    const seat = this.seat(event.seat, index);
    if (seat === null) {
      return;
    }
    const tile = this.tile(event.tile, index);
    if (this.playerCount !== 3) {
      this.report(index, `Seat ${seat} declares kita in a four-player game`);
    }
    if (tile !== NORTH && tile !== UNKNOWN_TILE) {
      this.report(index, `Seat ${seat} sets aside ${tile} as kita, which is not a North (4z)`);
    }
    this.expectTurn(seat, "discard", index, "declares kita");
    this.expectSize(seat, HAND_SIZE + 1, index, "before kita");
    const call = this.openCall;
    if (call !== null && call.seat === seat) {
      this.report(index, `Seat ${seat} declares kita right after calling ${call.type}`);
    }
    if (this.wallRemaining <= 0) {
      this.report(index, `Seat ${seat} declares kita with no tile left in the wall to replace it`);
    }
    const { removed, fromHand } = this.removeKita(seat, tile, index);
    if (fromHand && removed !== null && this.riichiDeclared[seat]) {
      const north = tile === UNKNOWN_TILE ? NORTH : tile;
      this.report(index, `Seat ${seat} is in riichi but sets aside ${north} from the hand`);
    }
    const setAside = tile === UNKNOWN_TILE && removed !== null ? removed : tile;
    this.seats[seat].kita.push(setAside);
    this.claimable = { kind: "kita", seat, tile: setAside, riichi: false, riichiAccepted: false };
    this.turn = { seat, phase: "draw" };
  }

  /**
   * Takes the kita tile (a North when the event's tile is "?") from the drawn tile or the hand, in
   * the order `kita` describes. `removed` is null when neither holds it; `fromHand` tells whether
   * the drawn tile was left in place.
   */
  private removeKita(
    seat: Seat,
    tile: Tile,
    index: number,
  ): { removed: Tile | null; fromHand: boolean } {
    const view = this.seats[seat];
    const drawn = view.drawn;
    const wanted = tile === UNKNOWN_TILE ? NORTH : tile;
    if (
      drawn !== null &&
      (drawn === wanted || (drawn === UNKNOWN_TILE && !view.hand.includes(wanted)))
    ) {
      view.drawn = null;
      return { removed: drawn, fromHand: false };
    }
    const taken = takeExact(view.hand, wanted);
    if (taken === null) {
      this.report(index, `Seat ${seat} has no ${wanted} for its kita`);
    }
    this.mergeDrawn(view);
    return { removed: taken, fromHand: true };
  }

  private riichiAccepted(event: RiichiAcceptedEvent, index: number): void {
    const seat = this.seat(event.seat, index);
    if (seat === null) {
      return;
    }
    const pending = this.pendingRiichi;
    if (pending === null || pending.seat !== seat) {
      this.report(index, `riichiAccepted for seat ${seat} does not follow its riichi discard`);
    }
    this.pendingRiichi = null;
    const claim = this.claimable;
    if (claim !== null && claim.kind === "discard" && claim.seat === seat) {
      claim.riichiAccepted = true;
    }
    const view = this.seats[seat];
    view.score -= RIICHI_DEPOSIT;
    view.riichi = true;
    // A stray acceptance still charges a deposit, so the seat is held to the riichi rules from here.
    this.riichiDeclared[seat] = true;
    this.riichiSticks += 1;
  }

  private dora(event: DoraEvent, index: number): void {
    const indicator = asKnownTile(event.indicator);
    if (indicator === null) {
      this.report(index, `Invalid dora indicator ${String(event.indicator)}`);
      return;
    }
    this.doraEvents += 1;
    if (this.doraEvents > this.kans) {
      this.report(index, `Dora indicator ${indicator} is revealed without a kan`);
    }
    this.doraIndicators.push(indicator);
  }

  private win(event: WinEvent, index: number): void {
    const seat = this.seat(event.seat, index);
    const from = this.seat(event.from, index, "from seat");
    const deltas = this.deltas(event.deltas, index);
    if (seat !== null && from !== null) {
      this.checkWin(event, seat, from, deltas, index);
    }
    if (this.firstWin === null) {
      this.firstWin = { eventIndex: index, sticks: this.riichiSticks };
    }
    this.winDeltaTotal += sum(deltas);
    this.riichiSticks = 0;
    this.endRound(event, deltas);
  }

  private checkWin(
    event: WinEvent,
    seat: Seat,
    from: Seat,
    deltas: Quad<number>,
    index: number,
  ): void {
    const view = this.seats[seat];
    const tsumo = from === seat;
    const earlierWins = this.results.filter(isWin);
    const first = earlierWins[0];
    if (first !== undefined) {
      if (tsumo || first.seat === first.from) {
        this.report(index, "Only ron wins can share a result");
      } else if (first.from !== from) {
        this.report(
          index,
          `Multiple ron wins name different discarders (${first.from} and ${from})`,
        );
      }
      if (earlierWins.some((earlier) => earlier.seat === seat)) {
        this.report(index, `Seat ${seat} wins twice`);
      }
    }
    let winTile = event.tile === undefined ? null : this.tile(event.tile, index);
    let concealed: Tile[];
    if (tsumo) {
      if (first === undefined) {
        this.expectTurn(seat, "discard", index, "wins by tsumo");
      }
      this.expectSize(seat, HAND_SIZE + 1, index, "at tsumo");
      if (view.drawn === null) {
        this.report(index, `Seat ${seat} wins by tsumo without a drawn tile`);
      } else if (winTile !== null && !tilesMatch(winTile, view.drawn)) {
        this.report(index, `The tsumo tile ${winTile} differs from the drawn tile ${view.drawn}`);
      }
      winTile ??= view.drawn;
      concealed = view.drawn === null ? [...view.hand] : [...view.hand, view.drawn];
    } else {
      const claim = this.claimable;
      if (claim === null) {
        this.report(
          index,
          this.playerCount === 3
            ? `Seat ${seat} wins by ron, but there is no discard, kan or kita to win on`
            : `Seat ${seat} wins by ron, but there is no discard or kan to win on`,
        );
      } else {
        if (claim.seat !== from) {
          this.report(
            index,
            `Seat ${seat} wins by ron from seat ${from}, but the last discard or kan was by seat ${claim.seat}`,
          );
        }
        if (winTile !== null && !tilesMatch(winTile, claim.tile)) {
          this.report(
            index,
            `The ron tile ${winTile} differs from the ${claim.kind} tile ${claim.tile}`,
          );
        }
        if (claim.riichi && claim.riichiAccepted) {
          this.report(
            index,
            `The riichi discard of seat ${claim.seat} is ronned after its riichiAccepted`,
          );
        }
        winTile ??= claim.tile;
      }
      this.expectSize(seat, HAND_SIZE, index, "before ron");
      concealed = view.drawn === null ? [...view.hand] : [...view.hand, view.drawn];
      if (winTile !== null) {
        concealed.push(winTile);
      }
    }
    if (event.hand !== undefined && winTile !== null) {
      const hand = this.tileList(event.hand, index);
      if (!sameTiles(hand, concealed)) {
        this.report(
          index,
          `The winning hand ${formatTiles(sortTiles(hand))} of seat ${seat} differs from the replayed hand ${formatTiles(sortTiles(concealed))}`,
        );
      }
    }
    if (deltas[seat] <= 0) {
      this.report(index, `The winner, seat ${seat}, gains ${deltas[seat]} points`);
    }
    if (event.pao !== undefined && this.playerCount === 3) {
      this.seat(event.pao, index, "pao seat");
    }
  }

  private ryukyoku(event: RyukyokuEvent, index: number): void {
    const deltas = this.deltas(event.deltas, index);
    const total = sum(deltas);
    if (total !== 0) {
      this.report(index, `Draw deltas add up to ${total} instead of 0`);
    }
    if (this.playerCount === 3) {
      this.checkThreePlayerDraw(event, index);
    }
    if (
      (event.reason === "exhaustive" || event.reason === "nagashiMangan") &&
      this.wallRemaining !== 0
    ) {
      this.report(index, `Exhaustive draw with ${this.wallRemaining} tiles left in the wall`);
    }
    if (event.reason === "exhaustive" && Array.isArray(event.tenpai)) {
      const tenpai = event.tenpai.flatMap((value) => asSeat(value) ?? []);
      const expected = tenpaiPayments(tenpai, this.playerCount);
      if (expected.some((value, seat) => value !== deltas[seat])) {
        this.report(
          index,
          `Draw deltas ${deltas.join(", ")} do not match the payments ${expected.join(", ")} for tenpai seats [${tenpai.join(", ")}]`,
        );
      }
    }
    this.endRound(event, deltas);
  }

  /** Three-player draws: no four-player-only reason, and nothing for the empty chair. */
  private checkThreePlayerDraw(event: RyukyokuEvent, index: number): void {
    if (FOUR_PLAYER_DRAWS.has(event.reason)) {
      this.report(index, `A ${event.reason} draw cannot happen in a three-player game`);
    }
    if (Array.isArray(event.tenpai) && event.tenpai.some((seat) => !this.isPlaying(seat))) {
      this.report(index, "The draw lists the empty seat 3 of a three-player game as tenpai");
    }
    const hands: unknown = event.hands;
    if (Array.isArray(hands) && hands[3] !== null && hands[3] !== undefined) {
      this.report(index, "The draw reveals a hand for the empty seat 3 of a three-player game");
    }
  }

  private isPlaying(value: unknown): boolean {
    const seat = asSeat(value);
    return seat === null || isActiveSeat(seat, this.playerCount);
  }

  private endRound(result: WinEvent | RyukyokuEvent, deltas: Quad<number>): void {
    for (const seat of SEATS) {
      this.seats[seat].score += deltas[seat];
    }
    this.results.push(result);
    this.turn = null;
  }

  private expectClaim(seat: Seat, from: Seat, tile: Tile, type: string, index: number): void {
    const claim = this.claimable;
    if (claim === null || claim.kind !== "discard") {
      this.report(index, `Seat ${seat} calls ${type} on ${tile}, but there is no discard to call`);
    } else if (claim.seat !== from) {
      this.report(
        index,
        `Seat ${seat} calls ${type} from seat ${from}, but the last discard was by seat ${claim.seat}`,
      );
    } else if (!tilesMatch(claim.tile, tile)) {
      this.report(index, `Seat ${seat} calls ${tile}, but seat ${from} discarded ${claim.tile}`);
    }
  }

  private expectTurn(seat: Seat, phase: Phase, index: number, action: string): void {
    const turn = this.turn;
    if (turn !== null && (turn.seat !== seat || turn.phase !== phase)) {
      this.report(
        index,
        `Seat ${seat} ${action} out of turn (seat ${turn.seat} should ${turn.phase} next)`,
      );
    }
  }

  private expectSize(seat: Seat, expected: number, index: number, when: string): void {
    if (this.sizeReported[seat]) {
      return;
    }
    const view = this.seats[seat];
    const count = view.hand.length + (view.drawn === null ? 0 : 1) + 3 * view.melds.length;
    if (count !== expected) {
      this.sizeReported[seat] = true;
      this.report(
        index,
        `Seat ${seat} holds ${count} tiles ${when}, expected ${expected} (each meld counts as 3)`,
      );
    }
  }

  private countKan(index: number): void {
    this.kans += 1;
    if (this.kans > MAX_KANS) {
      this.report(index, `Kan number ${this.kans} in one round (at most ${MAX_KANS} are possible)`);
    }
  }

  private takeFromHand(seat: Seat, tile: Tile, index: number, purpose: string): void {
    const hand = this.seats[seat].hand;
    if (takeExact(hand, tile) !== null) {
      return;
    }
    const substitute = takeSameKind(hand, tile);
    this.report(
      index,
      substitute === null
        ? `Seat ${seat} has no ${tile} for its ${purpose}`
        : `Seat ${seat} uses ${tile} for its ${purpose} but holds ${substitute}`,
    );
  }

  private mergeDrawn(view: SeatView): void {
    if (view.drawn !== null) {
      view.hand.push(view.drawn);
      view.hand.sort(compareTiles);
      view.drawn = null;
    }
  }

  /**
   * The seat an event names; null when invalid. The empty chair of a three-player game is reported
   * but still returned, so its events apply as well as possible.
   */
  private seat(value: unknown, index: number, label = "seat"): Seat | null {
    const seat = asSeat(value);
    if (seat === null) {
      this.report(index, `Invalid ${label} ${String(value)}`);
    } else if (!isActiveSeat(seat, this.playerCount)) {
      const name = label === "seat" ? "Seat" : `The ${label}`;
      this.report(index, `${name} ${seat} is the empty chair of a three-player game`);
    }
    return seat;
  }

  private tile(value: unknown, index: number): Tile {
    if (typeof value === "string" && isTile(value)) {
      return value;
    }
    this.report(index, `Invalid tile ${String(value)}`);
    return UNKNOWN_TILE;
  }

  /** Tiles of a list; invalid entries become "?" and are reported when `strict`. */
  private tileList(value: unknown, index: number, strict = true): Tile[] {
    if (!Array.isArray(value)) {
      if (strict) {
        this.report(index, "Expected a list of tiles");
      }
      return [];
    }
    return value.map((item: unknown) =>
      strict
        ? this.tile(item, index)
        : typeof item === "string" && isTile(item)
          ? item
          : UNKNOWN_TILE,
    );
  }

  private deltas(value: unknown, index: number): Quad<number> {
    const list: unknown[] = Array.isArray(value) ? value : [];
    const valid =
      list.length === 4 && list.every((item) => typeof item === "number" && Number.isFinite(item));
    if (!valid) {
      this.report(index, "Result deltas are not four numbers");
    }
    const deltas = quad((seat) => finiteOr(list[seat], 0));
    if (this.playerCount === 3 && deltas[3] !== 0) {
      this.report(
        index,
        `The empty seat 3 of a three-player game has a delta of ${deltas[3]} instead of 0`,
      );
    }
    return deltas;
  }
}
