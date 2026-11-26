/**
 * Format-independent game model. Every parser (tenhou.net/6 JSON, mjlog XML, mjai JSONL) produces a
 * GameLog, and the replay engine and UI only ever read this model.
 *
 * Seats are absolute indexes as listed in the log: seat 0 is the player who starts as East.
 * Points are plain points (25000), never hundreds.
 *
 * Three-player (sanma) games keep four seat slots, as Tenhou's own formats do: seats 0-2 play and
 * seat 3 is an empty chair. Seat geometry stays four-seat (the empty chair sits between seat 2 and
 * seat 0, so seats 0 and 2 face each other), while turn order and seat winds cycle over the three
 * playing seats (see src/core/players.ts). Every per-seat value of the empty chair is a fixed
 * placeholder: `players[3]` is `{ name: "" }`, `scores[3]` and every `deltas[3]` are 0, `hands[3]`
 * is `[]`, `tenpai` never contains 3 and a draw's `hands[3]` is null.
 *
 * Where the formats record the same game differently, the contract below says which differences
 * are allowed (hand order, fu of limit hands, source metadata); src/formats/cross-format.test.ts
 * checks that the parsers agree on everything else.
 */

import type { KnownTile, Tile } from "./tile";
import type { YakuKey } from "./yaku";

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** Number of players: 3 for three-player mahjong (sanma), where seat 3 is an empty chair. */
export type PlayerCount = 3 | 4;

/** 0 East, 1 South, 2 West, 3 North. Three-player seat winds are East, South and West only. */
export type Wind = 0 | 1 | 2 | 3;

export type Quad<T> = [T, T, T, T];

export type LogFormat = "tenhou-json" | "mjlog" | "mjai";

export interface GameLog {
  format: LogFormat;
  /** Source identifier when the log carries one, e.g. a Tenhou log id. */
  id?: string;
  /** 3 for a three-player game, whose seat 3 is the empty-chair placeholder described above. */
  playerCount: PlayerCount;
  players: Quad<PlayerInfo>;
  rules: GameRules;
  rounds: Round[];
  /**
   * Final points per seat as the source records them, when it does. Tenhou gives the riichi
   * deposits still on the table at the end to the top player, so this can differ from the last
   * round's end scores by those deposits.
   */
  finalScores?: Quad<number>;
}

export interface PlayerInfo {
  name: string;
  /** Rank label as given by the source (e.g. Tenhou dan), when available. */
  rank?: string;
  /**
   * Tenhou dan index when known, so the UI can localize the rank: 0 新人, 1-9 9級..1級,
   * 10-19 初段..十段, 20 天鳳位.
   */
  danIndex?: number;
  rating?: number;
}

export interface GameRules {
  redFives: boolean;
  /** Game length when known. */
  length?: "east" | "south";
  /** Tenhou lobby room when known: 般 general, 上 upper, 特 special (tokujou), 鳳 phoenix (houou). */
  room?: "general" | "upper" | "special" | "phoenix";
  /** Whether open tanyao (kuitan, 喰) is allowed, when known. */
  openTanyao?: boolean;
  /** Fast game (速), when known. */
  fast?: boolean;
  /**
   * Human-readable rule text from the source, e.g. Tenhou's "鳳南喰赤" (mjlog builds the same
   * kind of text from its game type flags). Describes the source; not compared across formats.
   */
  description?: string;
}

export interface Round {
  /** Prevailing wind. */
  wind: Wind;
  /** 1-4 (1-3 with three players): the round number within the wind ("East 3" has number 3). */
  number: number;
  dealer: Seat;
  honba: number;
  /** Riichi deposits already on the table when the round starts. */
  riichiSticks: number;
  /** Points per seat at the start of the round. */
  scores: Quad<number>;
  /** Indicators revealed at the start (normally exactly one). */
  doraIndicators: KnownTile[];
  /**
   * Starting hands, 13 tiles each, in the order the source lists them: tenhou.net/6 sorts them,
   * mjlog keeps the deal order, mjai keeps whatever order the log has. Consumers must not rely on
   * the order (sort with sortTiles to display or compare).
   */
  hands: Quad<Tile[]>;
  events: RoundEvent[];
}

export type RoundEvent =
  | DrawEvent
  | DiscardEvent
  | CallEvent
  | AnkanEvent
  | KakanEvent
  | RiichiAcceptedEvent
  | DoraEvent
  | KitaEvent
  | WinEvent
  | RyukyokuEvent;

export interface DrawEvent {
  type: "draw";
  seat: Seat;
  tile: Tile;
}

export interface DiscardEvent {
  type: "discard";
  seat: Seat;
  tile: Tile;
  /** The tile just drawn was discarded. */
  tsumogiri: boolean;
  /** This discard declares riichi (drawn sideways in the pond). */
  riichi: boolean;
}

/** Chi, pon or open kan on another player's discard. */
export interface CallEvent {
  type: "chi" | "pon" | "daiminkan";
  seat: Seat;
  /** Seat whose discard was called. */
  from: Seat;
  /** The called tile. */
  tile: Tile;
  /** Tiles taken from the caller's hand: 2 for chi and pon, 3 for daiminkan. */
  consumed: Tile[];
}

export interface AnkanEvent {
  type: "ankan";
  seat: Seat;
  /** The four tiles, all from the hand. */
  tiles: Tile[];
}

/** Upgrades an existing pon of the same kind to a kan. */
export interface KakanEvent {
  type: "kakan";
  seat: Seat;
  /** The added tile. */
  tile: Tile;
}

/** The riichi discard passed without a ron; the 1000-point stick is now on the table. */
export interface RiichiAcceptedEvent {
  type: "riichiAccepted";
  seat: Seat;
}

/** A new dora indicator is revealed (after a kan). */
export interface DoraEvent {
  type: "dora";
  indicator: KnownTile;
}

/**
 * Three-player only: the seat sets a North tile aside as a bonus dora (kita, 抜きドラ; Tenhou's
 * nukidora). The same seat then draws a replacement tile, unless another seat wins on the North
 * (a ron on the set-aside tile, whose WinEvent has `from` = this seat and `tile` "4z").
 */
export interface KitaEvent {
  type: "kita";
  seat: Seat;
  /** The North tile set aside: "4z" in a valid log. */
  tile: Tile;
}

export type LimitName = "mangan" | "haneman" | "baiman" | "sanbaiman" | "yakuman";

/**
 * One yaku of a win. Entries worth 0 han are dropped by every parser (mjlog writes 裏ドラ with 0 han
 * on every riichi win without ura dora, tenhou.net/6 only sometimes), so `han` is always positive.
 */
export interface YakuEntry {
  /** Canonical yaku, or null when the source names a yaku we do not know. */
  key: YakuKey | null;
  /** Source text, kept when the key is null so the UI can still show something. */
  raw?: string;
  /** Han value, always positive; 13 per yakuman multiple for yakuman. */
  han: number;
  yakuman?: boolean;
}

export interface WinEvent {
  type: "win";
  seat: Seat;
  /** Seat that dealt in (or whose kita North was won on); equal to `seat` for tsumo. */
  from: Seat;
  /** Point changes for this win, including honba and riichi deposits collected. */
  deltas: Quad<number>;
  /** Winning tile when the log records it. */
  tile?: Tile;
  /**
   * Concealed tiles at the win (including the winning tile) when the log records them. The order
   * is the source's; consumers must not rely on it.
   */
  hand?: Tile[];
  /**
   * Ura dora indicators, only on the win of a player who declared riichi: mjlog records them only
   * then, and the tenhou.net/6 and mjai parsers leave them out for other winners (those formats
   * list the round's ura indicators once per round or on every hora).
   */
  uraIndicators?: KnownTile[];
  han?: number;
  /**
   * Fu when the source records it. Kept for limit hands when the source has it (mjlog always
   * records fu), but tenhou.net/6 JSON has none for limit hands, so comparisons and the UI should
   * ignore fu when `limit` is set.
   */
  fu?: number;
  limit?: LimitName;
  /**
   * Value of the hand as the source states it (e.g. 12000), before honba and deposits. With three
   * players a tsumo is worth what its two payers pay (Tenhou's tsumo loss), as mjlog records it.
   */
  points?: number;
  /** Undefined when the source does not list yaku (e.g. mjai logs converted from Tenhou). */
  yaku?: YakuEntry[];
  /** Seat liable for the hand (pao), when different from the winner and dealer-in. */
  pao?: Seat;
}

/** suufonRenda, suuchaRiichi and sanchaHou need four players and never occur with three. */
export type RyukyokuReason =
  | "exhaustive"
  | "nagashiMangan"
  | "kyuushuKyuuhai"
  | "suufonRenda"
  | "suuchaRiichi"
  | "suukaikan"
  | "sanchaHou"
  | "unknown";

export interface RyukyokuEvent {
  type: "ryukyoku";
  reason: RyukyokuReason;
  deltas: Quad<number>;
  /** Seats that were tenpai at an exhaustive draw, when known. */
  tenpai?: Seat[];
  /** Hands revealed at the draw, when the log records them (null = not revealed). */
  hands?: Quad<Tile[] | null>;
}
