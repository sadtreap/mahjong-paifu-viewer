/** Parsing of the result entry of a tenhou.net/6 round ("和了" details, "流局" and abortive draws). */

import type { LimitName, Quad, RyukyokuReason, Seat, WinEvent, YakuEntry } from "../../core/model";
import { tenpaiFromDeltas } from "../../core/tenpai";
import { type YakuKey, yakuKeyFromTenhouName } from "../../core/yaku";
import { LogParseError } from "../errors";
import { yakuKeyFromEnglishName } from "./yaku-names";

/** A win as the result entry records it; the optional fields are only present when known. */
export type WinDetail = Pick<
  WinEvent,
  "seat" | "from" | "deltas" | "pao" | "han" | "fu" | "limit" | "points" | "yaku"
>;

export type RoundResult =
  | { kind: "win"; wins: WinDetail[] }
  | { kind: "ryukyoku"; reason: RyukyokuReason; deltas: Quad<number>; tenpai?: Seat[] };

function invalid(detail: string): never {
  throw new LogParseError("invalid", detail);
}

function isSeat(value: unknown): value is Seat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isDeltas(value: unknown): value is Quad<number> {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

const LIMITS: ReadonlyArray<[RegExp, LimitName]> = [
  [/三倍満|sanbaiman/i, "sanbaiman"],
  [/倍満|baiman/i, "baiman"],
  [/跳満|haneman/i, "haneman"],
  [/役満|yakuman/i, "yakuman"],
  [/満貫|mangan/i, "mangan"],
];

/**
 * Longest score or yaku text that is parsed. Real ones are at most about 40 characters (e.g.
 * "Single-wait Four Concealed Triplets(役満)"); longer text is not a real entry, and the patterns
 * below would backtrack over it for seconds.
 */
const MAX_TEXT_LENGTH = 100;

export interface ScoreText {
  fu?: number;
  han?: number;
  limit?: LimitName;
  /** Total value of the hand: the ron payment, or the sum of all tsumo payments. */
  points?: number;
}

/**
 * Parses the score text of a win: "30符1飜1000点" (ron), "満貫8000点", "30符2飜500-1000点"
 * (non-dealer tsumo: each non-dealer pays 500, the dealer 1000) or "30符4飜3900点∀" (dealer tsumo:
 * everyone pays 3900). Text longer than any real score gives nothing.
 */
export function parseScoreText(text: string): ScoreText {
  const result: ScoreText = {};
  if (text.length > MAX_TEXT_LENGTH) {
    return result;
  }
  const fu = /(\d+)\s*(?:符|fu)/i.exec(text);
  if (fu) {
    result.fu = Number(fu[1]);
  }
  const han = /(\d+)\s*(?:飜|翻|han)/i.exec(text);
  if (han) {
    result.han = Number(han[1]);
  }
  const limit = LIMITS.find(([pattern]) => pattern.test(text));
  if (limit) {
    result.limit = limit[1];
  }
  // Each optional part starts with its own token, so the spaces between them parse one way only.
  const payment = /(\d+)(?:\s*-\s*(\d+))?(?:\s*(?:点|pts?|points?))?(?:\s*(∀))?$/i.exec(
    text.trimEnd(),
  );
  if (payment) {
    const first = Number(payment[1]);
    if (payment[2] !== undefined) {
      result.points = first * 2 + Number(payment[2]);
    } else {
      result.points = payment[3] ? first * 3 : first;
    }
  }
  return result;
}

const YAKUMAN_MULTIPLIERS: ReadonlyArray<[RegExp, number]> = [
  [/ダブル|2倍|２倍|double/i, 2],
  [/トリプル|3倍|３倍|triple/i, 3],
];

/**
 * Parses a yaku entry such as "立直(1飜)", "大三元(役満)" or "Riichi(1飜)". Text longer than any
 * real entry is kept, shortened, as an unknown yaku worth 0 han (which parseRoundResult drops).
 */
export function parseYakuText(text: string): YakuEntry {
  if (text.length > MAX_TEXT_LENGTH) {
    return { key: null, raw: text.slice(0, MAX_TEXT_LENGTH), han: 0 };
  }
  const match = /^(.*?)\s*[(（]([^()（）]*)[)）]\s*$/.exec(text);
  const name = (match?.[1] ?? text).trim();
  const value = match?.[2] ?? "";
  const key: YakuKey | undefined = yakuKeyFromTenhouName(name) ?? yakuKeyFromEnglishName(name);
  const entry: YakuEntry = { key: key ?? null, han: 0 };
  if (!key) {
    entry.raw = name;
  }
  const han = /^\s*(\d+)\s*(?:飜|翻|han)\s*$/i.exec(value);
  if (han) {
    entry.han = Number(han[1]);
  } else if (/役満|yakuman/i.test(value)) {
    const multiplier = YAKUMAN_MULTIPLIERS.find(([pattern]) => pattern.test(value))?.[1] ?? 1;
    entry.han = 13 * multiplier;
    entry.yakuman = true;
  }
  return entry;
}

/** Parses one "和了" pair: the deltas and [who, from, paoWho, score text, ...yaku]. */
function parseWin(deltas: unknown, info: unknown): WinDetail {
  if (!isDeltas(deltas) || !Array.isArray(info)) {
    return invalid("Invalid win entry");
  }
  const [seat, from, paoSeat, scoreText, ...yakuTexts] = info as unknown[];
  if (!isSeat(seat) || !isSeat(from)) {
    return invalid("Invalid winner or dealer-in seat");
  }
  const win: WinDetail = { seat, from, deltas };
  if (isSeat(paoSeat) && paoSeat !== seat && paoSeat !== from) {
    win.pao = paoSeat;
  }
  if (typeof scoreText === "string") {
    Object.assign(win, parseScoreText(scoreText));
    // Entries worth nothing (Tenhou sometimes lists "裏ドラ(0飜)") are dropped, as in every parser.
    const yaku = yakuTexts
      .filter((item): item is string => typeof item === "string")
      .map(parseYakuText)
      .filter((entry) => entry.han > 0);
    win.yaku = yaku;
    if (win.han === undefined && yaku.length > 0) {
      win.han = yaku.reduce((sum, entry) => sum + entry.han, 0);
    }
    if (win.limit === undefined && yaku.some((entry) => entry.yakuman)) {
      win.limit = "yakuman";
    }
  }
  return win;
}

const RYUKYOKU_REASONS = new Map<string, RyukyokuReason>([
  ["流局", "exhaustive"],
  ["全員聴牌", "exhaustive"],
  ["全員不聴", "exhaustive"],
  ["流し満貫", "nagashiMangan"],
  ["九種九牌", "kyuushuKyuuhai"],
  ["四家立直", "suuchaRiichi"],
  ["三家和了", "sanchaHou"],
  ["四槓散了", "suukaikan"],
  ["四風連打", "suufonRenda"],
  // tensoul's spellings in logs converted from Mahjong Soul.
  ["三家和", "sanchaHou"],
  ["四開槓", "suukaikan"],
]);

/** Tenpai seats at an exhaustive draw: from the all-tenpai/all-noten names, else the payments. */
function inferTenpai(status: string, deltas: Quad<number>): Seat[] | undefined {
  if (status === "全員聴牌") {
    return [0, 1, 2, 3];
  }
  if (status === "全員不聴") {
    return [];
  }
  return tenpaiFromDeltas(deltas);
}

/** Parses the last entry of a round, e.g. ["和了", deltas, info, ...] or ["流局", deltas]. */
export function parseRoundResult(entry: unknown): RoundResult {
  if (entry === undefined) {
    // An unfinished log: keep the round, with an unknown ending.
    return { kind: "ryukyoku", reason: "unknown", deltas: [0, 0, 0, 0] };
  }
  if (!Array.isArray(entry) || typeof entry[0] !== "string") {
    return invalid("Invalid round result");
  }
  const [status, ...rest] = entry as [string, ...unknown[]];
  if (status === "和了" || Array.isArray(rest[1])) {
    const wins: WinDetail[] = [];
    for (let index = 0; index < rest.length; index += 2) {
      wins.push(parseWin(rest[index], rest[index + 1]));
    }
    if (wins.length === 0) {
      return invalid("A win result without winners");
    }
    return { kind: "win", wins };
  }
  const deltas: Quad<number> = isDeltas(rest[0]) ? rest[0] : [0, 0, 0, 0];
  const reason = RYUKYOKU_REASONS.get(status) ?? "unknown";
  const result: RoundResult = { kind: "ryukyoku", reason, deltas };
  if (reason === "exhaustive") {
    const tenpai = inferTenpai(status, deltas);
    if (tenpai) {
      result.tenpai = tenpai;
    }
  }
  return result;
}
