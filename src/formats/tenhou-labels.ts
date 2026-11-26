/**
 * Tenhou rank and rule labels, shared by the mjlog and tenhou.net/6 parsers so that both fill the
 * structured PlayerInfo.danIndex and GameRules fields the same way for the same game. mjlog records
 * numbers (UN `dan`, GO `type`), tenhou.net/6 the labels Tenhou shows ("七段", "鳳南喰赤"). The UI
 * localizes the structured fields; the labels here are only matched against source text or, for
 * mjlog, written as the description Tenhou itself would show.
 */
import type { GameRules, PlayerCount } from "../core/model";

/** Tenhou dan labels by dan index (mjlog UN `dan`), as Tenhou writes them (full-width kyu digits). */
export const TENHOU_DAN_LABELS = [
  "新人",
  "９級",
  "８級",
  "７級",
  "６級",
  "５級",
  "４級",
  "３級",
  "２級",
  "１級",
  "初段",
  "二段",
  "三段",
  "四段",
  "五段",
  "六段",
  "七段",
  "八段",
  "九段",
  "十段",
  "天鳳位",
] as const;

/** Full-width digits to ASCII, so "6級" and "６級" compare equal. */
function halfWidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

const DAN_INDEX = new Map<string, number>([
  ...TENHOU_DAN_LABELS.map((label, index): [string, number] => [halfWidthDigits(label), index]),
  // Tenhou's tenhou.net/6 export writes 天鳳位 as "天鳳".
  ["天鳳", TENHOU_DAN_LABELS.indexOf("天鳳位")],
]);

/**
 * Dan index of a Tenhou rank label such as "七段", "１級" or "天鳳" (天鳳位), or undefined for any
 * other text.
 */
export function tenhouDanIndex(label: string): number | undefined {
  return DAN_INDEX.get(halfWidthDigits(label.trim()));
}

export type TenhouRoom = NonNullable<GameRules["room"]>;

/** Room labels: 般 general, 上 upper (joukyuu), 特 special (tokujou), 鳳 phoenix (houou). */
const ROOM_LABELS: ReadonlyArray<[TenhouRoom, string]> = [
  ["general", "般"],
  ["upper", "上"],
  ["special", "特"],
  ["phoenix", "鳳"],
];

/** Everything Tenhou's rule text says about a game. */
export interface TenhouRules {
  /** 3 when the text starts with 三 (three-player). Not a GameRules field: GameLog.playerCount. */
  players: PlayerCount;
  room: TenhouRoom;
  length: "east" | "south";
  openTanyao: boolean;
  redFives: boolean;
  fast: boolean;
}

/**
 * Tenhou's rule text for these rules, e.g. "鳳南喰赤", "上東喰赤速" or "三鳳南喰赤". Four-player text
 * has no "四", as in Tenhou's own logs.
 */
export function tenhouRuleText(rules: TenhouRules): string {
  const room = ROOM_LABELS.find(([key]) => key === rules.room)?.[1] ?? "";
  return [
    rules.players === 3 ? "三" : "",
    room,
    rules.length === "south" ? "南" : "東",
    rules.openTanyao ? "喰" : "",
    rules.redFives ? "赤" : "",
    rules.fast ? "速" : "",
  ].join("");
}

/**
 * Tenhou's rule text: 三 (three-player) or an optional 四, the room, 東 or 南, then 喰 (open
 * tanyao), 赤 (red fives) and 速 (fast) when they apply. Anything else is not guessed at.
 */
const RULE_TEXT = /^([三四]?)([般上特鳳])([東南])(喰?)(赤?)(速?)$/;

/**
 * Reads a Tenhou rule text such as "鳳南喰赤". Returns undefined for any other text, e.g. the
 * Mahjong Soul room names tensoul writes ("玉の間南喰赤", "Gold Room South").
 */
export function parseTenhouRuleText(text: string): TenhouRules | undefined {
  const match = RULE_TEXT.exec(text.trim());
  if (!match) {
    return undefined;
  }
  const [, players, roomLabel, length, kuitan, aka, fast] = match;
  const room = ROOM_LABELS.find(([, label]) => label === roomLabel)?.[0];
  if (!room) {
    return undefined;
  }
  return {
    players: players === "三" ? 3 : 4,
    room,
    length: length === "南" ? "south" : "east",
    openTanyao: kuitan !== "",
    redFives: aka !== "",
    fast: fast !== "",
  };
}
