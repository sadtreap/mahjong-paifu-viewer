import type { GameRules, PlayerInfo, Quad, Round, Seat, YakuEntry } from "../core/model";
import { SEATS } from "../core/model";
import { isKnownTile, isRedFive, type Suit, type Tile } from "../core/tile";
import type { Locale } from "../i18n/locales";
import type { Messages } from "../i18n/messages";
import type { DiscardView, MeldView } from "../replay/types";

/** Localized tile name, e.g. "5 Man (red)", "적5만", "赤五萬". */
export function tileLabel(m: Messages, tile: Tile): string {
  if (!isKnownTile(tile)) {
    return m.tiles.unknown;
  }
  const suit = tile[1];
  if (suit === "z") {
    return m.tiles.honors[Number(tile[0]) - 1] ?? m.tiles.unknown;
  }
  const red = isRedFive(tile);
  return m.tiles.number(red ? 5 : Number(tile[0]), suit as Suit, red);
}

/** Localized round name, e.g. "East 1, 2 honba", "동 1국 2본장", "東1局 2本場". */
export function roundLabel(m: Messages, round: Pick<Round, "wind" | "number" | "honba">): string {
  return m.round.name(round.wind, round.number, round.honba);
}

export function playerName(m: Messages, players: readonly PlayerInfo[], seat: Seat): string {
  const name = players[seat]?.name.trim() ?? "";
  return name === "" ? m.viewer.unnamed(seat) : name;
}

export function playerNames(m: Messages, players: readonly PlayerInfo[]): Quad<string> {
  return SEATS.map((seat) => playerName(m, players, seat)) as Quad<string>;
}

/**
 * Localized rule summary, e.g. "Phoenix room · East-South game · Open tanyao · Red fives". When the
 * source has rule text the parsers could not read into the Tenhou fields (room, open tanyao, fast),
 * such as a Mahjong Soul room name, that text is shown as it is instead.
 */
export function rulesLabel(m: Messages, rules: GameRules): string {
  const structured =
    rules.room !== undefined || rules.openTanyao !== undefined || rules.fast !== undefined;
  const description = rules.description?.trim();
  if (!structured && description) {
    return description;
  }
  const parts: string[] = [];
  if (rules.room) {
    parts.push(m.viewer.rooms[rules.room]);
  }
  if (rules.length) {
    parts.push(m.viewer.length[rules.length]);
  }
  if (rules.openTanyao !== undefined) {
    parts.push(rules.openTanyao ? m.viewer.openTanyao : m.viewer.noOpenTanyao);
  }
  parts.push(rules.redFives ? m.viewer.redFives : m.viewer.noRedFives);
  if (rules.fast) {
    parts.push(m.viewer.fast);
  }
  return parts.join(" · ");
}

/** Highest Tenhou dan index (天鳳位); see PlayerInfo.danIndex. */
const MAX_DAN_INDEX = 20;

/** Localized Tenhou rank from the dan index, else the source's rank text, else undefined. */
export function rankLabel(m: Messages, player: PlayerInfo): string | undefined {
  const { danIndex } = player;
  if (
    danIndex !== undefined &&
    Number.isInteger(danIndex) &&
    danIndex >= 0 &&
    danIndex <= MAX_DAN_INDEX
  ) {
    return m.viewer.dan(danIndex);
  }
  return player.rank?.trim() || undefined;
}

export function yakuLabel(m: Messages, entry: YakuEntry): string {
  if (entry.key) {
    return m.yaku[entry.key];
  }
  return entry.raw?.trim() || m.result.unknownYaku;
}

/** "2 han", or the yakuman multiple for yakuman entries (13 han each). */
export function yakuValueLabel(m: Messages, entry: YakuEntry): string {
  if (entry.yakuman) {
    return m.result.yakuman(Math.max(1, Math.round(entry.han / 13)));
  }
  return m.result.han(entry.han);
}

export function formatPoints(locale: Locale, points: number): string {
  return new Intl.NumberFormat(locale).format(points);
}

/** Signed point change: "+8,000", "-2,000", "0". */
export function formatDelta(locale: Locale, delta: number): string {
  return new Intl.NumberFormat(locale, { signDisplay: "exceptZero" }).format(delta);
}

/** Alt text for a pond tile: its name plus riichi / tsumogiri / called / last-discard notes. */
export function discardLabel(m: Messages, discard: DiscardView, last: boolean): string {
  let label = tileLabel(m, discard.tile);
  if (discard.riichi) {
    label = m.board.riichiDiscard(label);
  }
  if (discard.tsumogiri) {
    label = m.board.tsumogiri(label);
  }
  if (discard.called) {
    label = m.board.calledDiscard(label);
  }
  if (last) {
    label = m.board.lastDiscard(label);
  }
  return label;
}

export function meldLabel(m: Messages, meld: MeldView): string {
  const tiles = [...meld.tiles];
  if (meld.calledTile !== undefined) {
    tiles.push(meld.calledTile);
  }
  if (meld.addedTile !== undefined) {
    tiles.push(meld.addedTile);
  }
  return m.board.meld(m.calls[meld.type], tiles.map((tile) => tileLabel(m, tile)).join(", "));
}

export interface Standing {
  seat: Seat;
  score: number;
  place: number;
}

/** Final ranking: higher score first; ties go to the seat that started closer to East. */
export function standings(scores: Quad<number>): Standing[] {
  return [...SEATS]
    .sort((a, b) => scores[b] - scores[a] || a - b)
    .map((seat, index) => ({ seat, score: scores[seat], place: index + 1 }));
}
