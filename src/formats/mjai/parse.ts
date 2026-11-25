import type {
  GameLog,
  LimitName,
  Quad,
  Round,
  RoundEvent,
  RyukyokuEvent,
  RyukyokuReason,
  Seat,
  Wind,
  WinEvent,
  YakuEntry,
} from "../../core/model";
import { tenpaiFromDeltas } from "../../core/tenpai";
import {
  isKnownTile,
  isRedFive,
  type KnownTile,
  sortTiles,
  type Tile,
  tileKind,
} from "../../core/tile";
import { type YakuKey, yakuKeyFromMjaiName } from "../../core/yaku";
import { LogParseError } from "../errors";
import { tileFromMjai } from "./tiles";

/**
 * Parses an mjai event log: JSON Lines (one event per line) or a JSON array of events.
 *
 * Both common flavors are read: the convlog/Mortal one (what mjai-reviewer produces from Tenhou
 * logs) and the gimite/mjai server one, which adds scores, yaku, fu and revealed hands. Unknown
 * event types and fields are ignored. Only the first game of a multi-game file is read.
 */
export function parseMjai(text: string): GameLog {
  return new MjaiReader().read(readEvents(text));
}

type RawEvent = Record<string, unknown> & { type: string };

interface NumberedEvent {
  event: RawEvent;
  /** Line number (JSON Lines) or 1-based position (JSON array), for error messages. */
  line: number;
}

const STARTING_POINTS = 25000;
const RIICHI_STICK = 1000;
/** Tiles drawn in a four-player round that ends in an exhaustive draw, rinshan draws included. */
const LIVE_WALL_SIZE = 70;
/** The most a seat can gain from noten payments; more means nagashi mangan. */
const MAX_NOTEN_PAYMENT = 3000;
/** gimite/mjai counts a yakuman as 100 han. */
const MJAI_YAKUMAN_HAN = 100;

// Lookup tables keyed by log text are Maps, so that "constructor" or "toString" finds nothing.
const WINDS = new Map<unknown, Wind>([
  ["E", 0],
  ["S", 1],
  ["W", 2],
  ["N", 3],
]);

const YAKUMAN_KEYS = new Set<YakuKey>([
  "tenhou",
  "chiihou",
  "daisangen",
  "suuankou",
  "suuankouTanki",
  "tsuuiisou",
  "ryuuiisou",
  "chinroutou",
  "chuurenPoutou",
  "junseiChuurenPoutou",
  "kokushiMusou",
  "kokushiMusou13",
  "daisuushii",
  "shousuushii",
  "suukantsu",
]);

/** Ryukyoku reasons as spelled by mjai implementations, lowercased without separators. */
const RYUKYOKU_REASONS = new Map<string, RyukyokuReason>(
  Object.entries<RyukyokuReason>({
    fanpai: "exhaustive",
    exhaustive: "exhaustive",
    howanpai: "exhaustive",
    nagashimangan: "nagashiMangan",
    kyushukyuhai: "kyuushuKyuuhai",
    kyusyukyuhai: "kyuushuKyuuhai",
    kyuushukyuuhai: "kyuushuKyuuhai",
    sufonrenta: "suufonRenda",
    sufonrenda: "suufonRenda",
    suufonrenta: "suufonRenda",
    suufonrenda: "suufonRenda",
    suchareach: "suuchaRiichi",
    suuchareach: "suuchaRiichi",
    sucharichi: "suuchaRiichi",
    suucharichi: "suuchaRiichi",
    suuchariichi: "suuchaRiichi",
    sukaikan: "suukaikan",
    suukaikan: "suukaikan",
    sukansanra: "suukaikan",
    suukansanra: "suukaikan",
    sanchaho: "sanchaHou",
    sanchahou: "sanchaHou",
    sanchahoo: "sanchaHou",
  }),
);

/** Abortive draws that happen after a discard nobody ronned, so a riichi on it is accepted. */
const RIICHI_ACCEPTING_REASONS = new Set<RyukyokuReason>([
  "suuchaRiichi",
  "suufonRenda",
  "suukaikan",
]);

function readEvents(text: string): NumberedEvent[] {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed === "") {
    throw new LogParseError("empty");
  }
  // A JSON array of events, or a single (possibly pretty-printed) event.
  const whole = tryParseJson(trimmed);
  if (whole !== undefined) {
    const values = Array.isArray(whole) ? whole : [whole];
    return values.map((value, index) => toNumberedEvent(value, index + 1));
  }
  const events: NumberedEvent[] = [];
  const lines = trimmed.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") {
      continue;
    }
    const value = tryParseJson(line);
    if (value === undefined) {
      throw new LogParseError("invalid", `Line ${index + 1} is not valid JSON`);
    }
    events.push(toNumberedEvent(value, index + 1));
  }
  return events;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toNumberedEvent(value: unknown, line: number): NumberedEvent {
  if (!isObject(value) || typeof value.type !== "string") {
    throw new LogParseError("invalid", `Event ${line} is not an mjai event`);
  }
  return { event: value as RawEvent, line };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Per-round bookkeeping that is not part of the model. */
interface RoundState {
  round: Round;
  /** Seats that sent "reach" and have not made the riichi discard yet. */
  declared: Set<Seat>;
  /** Seats that made a riichi discard this round. */
  riichi: Set<Seat>;
  /** Seats whose riichi stick was accepted. */
  accepted: Set<Seat>;
  /** Seat whose riichi discard is neither accepted nor ronned yet. */
  unaccepted: Seat | null;
  draws: number;
  /** Seat of every kan, in order. */
  kans: Seat[];
  hasResult: boolean;
  /** Results that carried neither deltas nor scores. */
  unknownDeltas: (WinEvent | RyukyokuEvent)[];
}

class MjaiReader {
  private line = 0;
  private names: string[] | undefined;
  private redFives: boolean | undefined;
  private sawRedFive = false;
  private length: "east" | "south" | undefined;
  private id: string | undefined;
  private finalScores: Quad<number> | undefined;
  private readonly rounds: Round[] = [];
  /** Running points, updated by riichi sticks and results. */
  private scores: Quad<number> = [
    STARTING_POINTS,
    STARTING_POINTS,
    STARTING_POINTS,
    STARTING_POINTS,
  ];
  private current: RoundState | undefined;
  /** A finished round's only result without deltas, filled in from the next known scores. */
  private pendingDeltas:
    | { result: WinEvent | RyukyokuEvent; scoresAfter: Quad<number> }
    | undefined;

  read(events: NumberedEvent[]): GameLog {
    for (const { event, line } of events) {
      this.line = line;
      if (this.handle(event) === "stop") {
        break;
      }
    }
    this.finishRound();
    if (this.rounds.length === 0) {
      throw new LogParseError("invalid", "The log has no start_kyoku event");
    }
    const names = this.names ?? ["", "", "", ""];
    const game: GameLog = {
      format: "mjai",
      players: [
        { name: names[0] ?? "" },
        { name: names[1] ?? "" },
        { name: names[2] ?? "" },
        { name: names[3] ?? "" },
      ],
      rules: { redFives: this.redFives ?? this.sawRedFive },
      rounds: this.rounds,
    };
    if (this.length) {
      game.rules.length = this.length;
    }
    if (this.id !== undefined) {
      game.id = this.id;
    }
    if (this.finalScores) {
      game.finalScores = this.finalScores;
    }
    return game;
  }

  private handle(event: RawEvent): "stop" | undefined {
    switch (event.type) {
      case "start_game":
        if (this.rounds.length > 0 || this.current) {
          // A second game in the same file.
          return "stop";
        }
        this.startGame(event);
        return undefined;
      case "end_game":
        this.finishRound();
        if (event.scores !== undefined) {
          this.finalScores = this.quad(event.scores, "scores");
          this.fillPendingDeltas(this.finalScores);
        }
        return "stop";
      case "start_kyoku":
        this.finishRound();
        this.startRound(event);
        return undefined;
      case "end_kyoku":
        this.finishRound();
        return undefined;
      case "nukidora":
        throw new LogParseError("unsupportedPlayers", "Three-player event nukidora");
      case "tsumo":
      case "dahai":
      case "chi":
      case "pon":
      case "daiminkan":
      case "kakan":
      case "ankan":
      case "dora":
      case "reach":
      case "reach_accepted":
        this.play(this.roundState(event.type, false), event);
        return undefined;
      case "hora":
        this.hora(this.roundState(event.type, true), event);
        return undefined;
      case "ryukyoku":
        this.ryukyoku(this.roundState(event.type, false), event);
        return undefined;
      default:
        // Unknown events (e.g. "none", "error" or tool-specific ones) carry nothing we show.
        return undefined;
    }
  }

  private startGame(event: RawEvent): void {
    if (event.names !== undefined) {
      if (!Array.isArray(event.names)) {
        throw this.invalid("names is not an array");
      }
      if (event.names.length !== 4) {
        throw new LogParseError("unsupportedPlayers", `${event.names.length} players`);
      }
      this.names = event.names.map((name) => (typeof name === "string" ? name : ""));
    }
    if (typeof event.aka_flag === "boolean") {
      this.redFives = event.aka_flag;
    }
    // convlog writes kyoku_first 0 for a hanchan and 4 for an east-only game.
    if (event.kyoku_first === 0) {
      this.length = "south";
    } else if (event.kyoku_first === 4) {
      this.length = "east";
    }
    // gimite/mjai's numeric id is the receiving player's seat, not a log id.
    if (typeof event.id === "string" && event.id !== "") {
      this.id = event.id;
    }
  }

  private startRound(event: RawEvent): void {
    if (Array.isArray(event.tehais) && event.tehais.length === 3) {
      throw new LogParseError("unsupportedPlayers", "Three starting hands");
    }
    if (Array.isArray(event.scores) && event.scores.length === 3) {
      throw new LogParseError("unsupportedPlayers", "Three scores");
    }
    const hands = this.quadOf(event.tehais, "tehais", (value) => this.tiles(value, "tehais", 13));
    const scores = event.scores === undefined ? this.scores : this.quad(event.scores, "scores");
    this.fillPendingDeltas(scores);
    const wind = WINDS.get(event.bakaze);
    if (wind === undefined) {
      throw this.invalid(`Invalid bakaze ${JSON.stringify(event.bakaze)}`);
    }
    const number = this.integer(event.kyoku, "kyoku", 1, 4);
    const round: Round = {
      wind,
      number,
      dealer: event.oya === undefined ? ((number - 1) as Seat) : this.seat(event.oya, "oya"),
      honba: event.honba === undefined ? 0 : this.integer(event.honba, "honba", 0),
      riichiSticks: event.kyotaku === undefined ? 0 : this.integer(event.kyotaku, "kyotaku", 0),
      scores: [...scores],
      doraIndicators:
        event.dora_marker === undefined ? [] : [this.knownTile(event.dora_marker, "dora_marker")],
      hands,
      events: [],
    };
    this.scores = [...scores];
    this.current = {
      round,
      declared: new Set(),
      riichi: new Set(),
      accepted: new Set(),
      unaccepted: null,
      draws: 0,
      kans: [],
      hasResult: false,
      unknownDeltas: [],
    };
  }

  private finishRound(): void {
    const state = this.current;
    if (!state) {
      return;
    }
    this.rounds.push(state.round);
    const [unknown, ...others] = state.unknownDeltas;
    this.pendingDeltas =
      unknown && others.length === 0
        ? { result: unknown, scoresAfter: [...this.scores] }
        : undefined;
    this.current = undefined;
  }

  /** Gives the previous round's result without deltas the difference to the next known scores. */
  private fillPendingDeltas(scores: Quad<number>): void {
    if (this.pendingDeltas) {
      const { result, scoresAfter } = this.pendingDeltas;
      result.deltas = subtract(scores, scoresAfter);
      if (result.type === "ryukyoku") {
        inferTenpai(result);
      }
      this.pendingDeltas = undefined;
    }
  }

  private roundState(type: string, resultAllowed: boolean): RoundState {
    const state = this.current;
    if (!state) {
      throw this.invalid(`${type} outside a round`);
    }
    if (state.hasResult && !resultAllowed) {
      throw this.invalid(`${type} after the round result`);
    }
    return state;
  }

  private play(state: RoundState, event: RawEvent): void {
    const events = state.round.events;
    switch (event.type) {
      case "tsumo": {
        this.acceptRiichi(state);
        events.push({
          type: "draw",
          seat: this.seat(event.actor, "actor"),
          tile: this.tile(event.pai, "pai"),
        });
        state.draws += 1;
        return;
      }
      case "dahai": {
        const seat = this.seat(event.actor, "actor");
        const tile = this.tile(event.pai, "pai");
        const riichi = state.declared.delete(seat);
        if (riichi) {
          state.riichi.add(seat);
          state.unaccepted = seat;
        }
        let tsumogiri: boolean;
        if (typeof event.tsumogiri === "boolean") {
          tsumogiri = event.tsumogiri;
        } else {
          // Older logs leave it out: the drawn tile was discarded if the same face was just drawn.
          const last = events.at(-1);
          tsumogiri =
            last?.type === "draw" && last.seat === seat && isKnownTile(tile) && last.tile === tile;
        }
        events.push({ type: "discard", seat, tile, tsumogiri, riichi });
        return;
      }
      case "chi":
      case "pon":
      case "daiminkan": {
        this.acceptRiichi(state);
        const seat = this.seat(event.actor, "actor");
        const from = this.seat(event.target, "target");
        if (from === seat) {
          throw this.invalid(`${event.type} from the caller's own discard`);
        }
        const consumed = this.tiles(event.consumed, "consumed", event.type === "daiminkan" ? 3 : 2);
        events.push({ type: event.type, seat, from, tile: this.tile(event.pai, "pai"), consumed });
        if (event.type === "daiminkan") {
          state.kans.push(seat);
        }
        return;
      }
      case "kakan": {
        const seat = this.seat(event.actor, "actor");
        events.push({ type: "kakan", seat, tile: this.tile(event.pai, "pai") });
        state.kans.push(seat);
        return;
      }
      case "ankan": {
        const seat = this.seat(event.actor, "actor");
        events.push({ type: "ankan", seat, tiles: this.tiles(event.consumed, "consumed", 4) });
        state.kans.push(seat);
        return;
      }
      case "dora":
        events.push({ type: "dora", indicator: this.knownTile(event.dora_marker, "dora_marker") });
        return;
      case "reach":
        state.declared.add(this.seat(event.actor, "actor"));
        return;
      case "reach_accepted": {
        const seat = this.seat(event.actor, "actor");
        if (state.accepted.has(seat)) {
          return;
        }
        this.pushRiichiAccepted(state, seat);
        if (event.scores !== undefined) {
          this.scores = this.quad(event.scores, "scores");
        } else if (event.deltas !== undefined) {
          this.scores = add(this.scores, this.quad(event.deltas, "deltas"));
        } else {
          this.scores[seat] -= RIICHI_STICK;
        }
        return;
      }
    }
  }

  private pushRiichiAccepted(state: RoundState, seat: Seat): void {
    state.round.events.push({ type: "riichiAccepted", seat });
    state.accepted.add(seat);
    if (state.unaccepted === seat) {
      state.unaccepted = null;
    }
  }

  /** Accepts a riichi whose reach_accepted the log left out, once play moves on. */
  private acceptRiichi(state: RoundState): void {
    if (state.unaccepted !== null) {
      const seat = state.unaccepted;
      this.pushRiichiAccepted(state, seat);
      this.scores[seat] -= RIICHI_STICK;
    }
  }

  private hora(state: RoundState, event: RawEvent): void {
    const seat = this.seat(event.actor, "actor");
    const from = event.target === undefined ? seat : this.seat(event.target, "target");
    if (state.unaccepted === from && from !== seat) {
      // The riichi discard was ronned, so its stick is never paid.
      state.unaccepted = null;
    }
    const win: WinEvent = { type: "win", seat, from, deltas: [0, 0, 0, 0] };

    const tile =
      event.pai === undefined
        ? winningTile(state.round.events, seat, from)
        : this.tile(event.pai, "pai");
    if (tile !== undefined && isKnownTile(tile)) {
      win.tile = tile;
    }
    if (event.hora_tehais !== undefined) {
      const hand = this.tiles(event.hora_tehais, "hora_tehais");
      // gimite/mjai leaves the ron tile out of the hand.
      if (hand.length % 3 === 1 && win.tile !== undefined) {
        hand.push(win.tile);
      }
      win.hand = sortTiles(hand);
    }
    const ura = event.ura_markers ?? event.uradora_markers;
    if (ura !== undefined) {
      const indicators = this.tiles(ura, "ura_markers").map((value) =>
        this.asKnown(value, "ura_markers"),
      );
      // convlog lists the round's ura indicators on every hora; they only count for riichi winners.
      if (indicators.length > 0 && state.riichi.has(seat)) {
        win.uraIndicators = indicators;
      }
    }

    let yakuman = false;
    if (event.yakus !== undefined) {
      win.yaku = this.yaku(event.yakus);
      yakuman = win.yaku.some((entry) => entry.yakuman);
    }
    if (event.fu !== undefined) {
      win.fu = this.integer(event.fu, "fu", 0);
    }
    if (event.fan !== undefined) {
      const fan = this.integer(event.fan, "fan", 0);
      const yakumanHan =
        win.yaku?.filter((entry) => entry.yakuman).reduce((sum, entry) => sum + entry.han, 0) ?? 0;
      yakuman ||= fan >= MJAI_YAKUMAN_HAN;
      win.han = yakumanHan > 0 ? yakumanHan : yakuman ? toYakumanHan(fan) : fan;
      const limit = limitOf(win.han, win.fu, yakuman);
      if (limit) {
        win.limit = limit;
      }
    }
    if (event.hora_points !== undefined) {
      win.points = this.integer(event.hora_points, "hora_points", 0);
    }
    // gimite/mjai adds the liable player when a pao rule applies.
    if (event.pao !== undefined && event.pao !== null) {
      const pao = this.seat(event.pao, "pao");
      if (pao !== seat && pao !== from) {
        win.pao = pao;
      }
    }

    win.deltas = this.resultDeltas(state, win, event);
    state.round.events.push(win);
    state.hasResult = true;
  }

  private ryukyoku(state: RoundState, event: RawEvent): void {
    const givenDeltas = event.deltas === undefined ? undefined : this.quad(event.deltas, "deltas");
    const reason =
      event.reason === undefined || event.reason === null
        ? inferRyukyokuReason(state, givenDeltas)
        : (RYUKYOKU_REASONS.get(
            String(event.reason)
              .toLowerCase()
              .replace(/[^a-z0-9]/g, ""),
          ) ?? "unknown");
    if (state.unaccepted !== null) {
      if (RIICHI_ACCEPTING_REASONS.has(reason)) {
        // convlog emits reach_accepted only before the next draw, so it misses this one.
        this.acceptRiichi(state);
      } else {
        state.unaccepted = null;
      }
    }

    const result: RyukyokuEvent = { type: "ryukyoku", reason, deltas: [0, 0, 0, 0] };
    if (Array.isArray(event.tenpais) && (reason === "exhaustive" || reason === "nagashiMangan")) {
      const tenpais = this.quadOf(event.tenpais, "tenpais", (value) => value === true);
      result.tenpai = ([0, 1, 2, 3] as const).filter((seat) => tenpais[seat]);
    }
    if (event.tehais !== undefined) {
      const hands = this.quadOf(event.tehais, "tehais", (value) => {
        const tiles = this.tiles(value, "tehais");
        return tiles.some(isKnownTile) ? tiles : null;
      });
      if (hands.some((hand) => hand !== null)) {
        result.hands = hands;
      }
    }
    result.deltas = this.resultDeltas(state, result, event);
    // convlog and Mortal leave tenpais out; their deltas still carry the noten payments. Zeros that
    // stand in for unknown deltas are skipped here and handled in fillPendingDeltas.
    if (!state.unknownDeltas.includes(result)) {
      inferTenpai(result);
    }
    state.round.events.push(result);
    state.hasResult = true;
  }

  /** Deltas from the event, else from its scores, else zeros fixed up later from the next scores. */
  private resultDeltas(
    state: RoundState,
    result: WinEvent | RyukyokuEvent,
    event: RawEvent,
  ): Quad<number> {
    const scores = event.scores === undefined ? undefined : this.quad(event.scores, "scores");
    if (event.deltas !== undefined) {
      const deltas = this.quad(event.deltas, "deltas");
      this.scores = scores ?? add(this.scores, deltas);
      return deltas;
    }
    if (scores) {
      const deltas = subtract(scores, this.scores);
      this.scores = scores;
      return deltas;
    }
    state.unknownDeltas.push(result);
    return [0, 0, 0, 0];
  }

  /** gimite/mjai `yakus`: [name, han] pairs. Entries worth 0 han (["uradora", 0]) are dropped. */
  private yaku(value: unknown): YakuEntry[] {
    if (!Array.isArray(value)) {
      throw this.invalid("yakus is not an array");
    }
    const entries: YakuEntry[] = [];
    for (const item of value) {
      if (!Array.isArray(item) || typeof item[0] !== "string") {
        throw this.invalid("Invalid yakus entry");
      }
      const name = item[0];
      const han = this.integer(item[1], "yakus", 0);
      const key = yakuKeyFromMjaiName(name) ?? null;
      const yakuman = (key !== null && YAKUMAN_KEYS.has(key)) || han >= MJAI_YAKUMAN_HAN;
      if (han === 0 && !yakuman) {
        continue;
      }
      const entry: YakuEntry = { key, han: yakuman ? toYakumanHan(han) : han };
      if (key === null) {
        entry.raw = name;
      }
      if (yakuman) {
        entry.yakuman = true;
      }
      entries.push(entry);
    }
    return entries;
  }

  private invalid(detail: string): LogParseError {
    return new LogParseError("invalid", `${detail} (event ${this.line})`);
  }

  private seat(value: unknown, field: string): Seat {
    if (value === 0 || value === 1 || value === 2 || value === 3) {
      return value;
    }
    throw this.invalid(`Invalid ${field} ${JSON.stringify(value)}`);
  }

  private integer(
    value: unknown,
    field: string,
    min: number,
    max = Number.MAX_SAFE_INTEGER,
  ): number {
    if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) {
      return value;
    }
    throw this.invalid(`Invalid ${field} ${JSON.stringify(value)}`);
  }

  private tile(value: unknown, field: string): Tile {
    const tile = typeof value === "string" ? tileFromMjai(value) : undefined;
    if (tile === undefined) {
      throw this.invalid(`Invalid ${field} tile ${JSON.stringify(value)}`);
    }
    if (isRedFive(tile)) {
      this.sawRedFive = true;
    }
    return tile;
  }

  private knownTile(value: unknown, field: string): KnownTile {
    return this.asKnown(this.tile(value, field), field);
  }

  private asKnown(tile: Tile, field: string): KnownTile {
    if (!isKnownTile(tile)) {
      throw this.invalid(`Unknown tile in ${field}`);
    }
    return tile;
  }

  private tiles(value: unknown, field: string, count?: number): Tile[] {
    if (!Array.isArray(value) || (count !== undefined && value.length !== count)) {
      throw this.invalid(`Invalid ${field}`);
    }
    return value.map((item) => this.tile(item, field));
  }

  private quad(value: unknown, field: string): Quad<number> {
    return this.quadOf(value, field, (item) => {
      if (typeof item !== "number" || !Number.isFinite(item)) {
        throw this.invalid(`Invalid ${field}`);
      }
      return item;
    });
  }

  private quadOf<T>(value: unknown, field: string, read: (item: unknown) => T): Quad<T> {
    if (!Array.isArray(value) || value.length !== 4) {
      throw this.invalid(`${field} must have four entries`);
    }
    return [read(value[0]), read(value[1]), read(value[2]), read(value[3])];
  }
}

function add(a: Quad<number>, b: Quad<number>): Quad<number> {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

function subtract(a: Quad<number>, b: Quad<number>): Quad<number> {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
}

/** Fills in the tenpai seats of an exhaustive draw from its noten payments, unless already known. */
function inferTenpai(result: RyukyokuEvent): void {
  if (result.reason === "exhaustive" && result.tenpai === undefined) {
    const tenpai = tenpaiFromDeltas(result.deltas);
    if (tenpai) {
      result.tenpai = tenpai;
    }
  }
}

/** Maps a yakuman han value (100 per yakuman in gimite/mjai, or a multiple) to 13 per yakuman. */
function toYakumanHan(han: number): number {
  if (han >= MJAI_YAKUMAN_HAN) {
    return 13 * Math.max(1, Math.round(han / MJAI_YAKUMAN_HAN));
  }
  if (han >= 13) {
    return han;
  }
  return 13 * Math.max(1, han);
}

function limitOf(han: number, fu: number | undefined, yakuman: boolean): LimitName | undefined {
  if (yakuman || han >= 13) return "yakuman";
  if (han >= 11) return "sanbaiman";
  if (han >= 8) return "baiman";
  if (han >= 6) return "haneman";
  if (han >= 5) return "mangan";
  // Below 5 han a hand is a mangan when its base points reach 2000 (no kiriage).
  if (fu !== undefined && han > 0 && fu * 2 ** (han + 2) >= 2000) return "mangan";
  return undefined;
}

type ActionEvent = Exclude<RoundEvent, { type: "dora" | "riichiAccepted" | "win" }>;

/** The last action of the round: what a win or a draw happened on. */
function lastAction(events: readonly RoundEvent[]): ActionEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && event.type !== "dora" && event.type !== "riichiAccepted" && event.type !== "win") {
      return event;
    }
  }
  return undefined;
}

/** Winning tile of a convlog hora, which does not name it: the drawn tile, or the tile ronned. */
function winningTile(events: readonly RoundEvent[], seat: Seat, from: Seat): Tile | undefined {
  const last = lastAction(events);
  if (!last || last.type === "ryukyoku" || last.seat !== from) {
    return undefined;
  }
  if (seat === from) {
    return last.type === "draw" ? last.tile : undefined;
  }
  switch (last.type) {
    case "discard":
    case "kakan":
      return last.tile;
    case "ankan":
      // Only kokushi musou can ron an ankan.
      return last.tiles[0];
    default:
      return undefined;
  }
}

/** convlog's ryukyoku has no reason; it follows from how the round ended. */
function inferRyukyokuReason(state: RoundState, deltas: Quad<number> | undefined): RyukyokuReason {
  const events = state.round.events;
  const last = lastAction(events);
  if (!last) {
    return "unknown";
  }
  if (last.type === "draw") {
    return "kyuushuKyuuhai";
  }
  if (state.unaccepted !== null && state.riichi.size === 4) {
    return "suuchaRiichi";
  }
  if (state.draws >= LIVE_WALL_SIZE) {
    return deltas?.some((delta) => delta > MAX_NOTEN_PAYMENT) ? "nagashiMangan" : "exhaustive";
  }
  if (isSuufonRenda(events)) {
    return "suufonRenda";
  }
  if (last.type === "discard" && state.kans.length >= 4 && new Set(state.kans).size > 1) {
    return "suukaikan";
  }
  if (last.type === "discard" || last.type === "kakan" || last.type === "ankan") {
    // The only abortive draw left that ends on a discard: three players ron it.
    return "sanchaHou";
  }
  return "unknown";
}

/** Four first discards of the same wind, one per seat, with no calls or kans. */
function isSuufonRenda(events: readonly RoundEvent[]): boolean {
  const discards = events.filter((event) => event.type === "discard");
  const onlyDrawsAndDiscards = events.every(
    (event) => event.type === "draw" || event.type === "discard" || event.type === "riichiAccepted",
  );
  if (discards.length !== 4 || !onlyDrawsAndDiscards) {
    return false;
  }
  const kind = tileKind(discards[0]?.tile ?? "?");
  const isWind = kind >= tileKind("1z") && kind <= tileKind("4z");
  return (
    isWind &&
    discards.every((discard) => tileKind(discard.tile) === kind) &&
    new Set(discards.map((discard) => discard.seat)).size === 4
  );
}
