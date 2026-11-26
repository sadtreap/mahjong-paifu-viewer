import type {
  GameLog,
  GameRules,
  PlayerCount,
  PlayerInfo,
  Quad,
  Round,
  RyukyokuEvent,
  Seat,
  WinEvent,
  YakuEntry,
} from "../core/model";
import { SEATS } from "../core/model";
import { activeSeats } from "../core/players";
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

/** Short round name for tight places (timeline, round matrix): "E3-1", "동3-1", "東3-1". */
export function roundShortLabel(
  m: Messages,
  round: Pick<Round, "wind" | "number" | "honba">,
): string {
  return m.round.short(round.wind, round.number, round.honba);
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
 * such as a Mahjong Soul room name, that text is shown as it is instead. With `playerCount` 3 the
 * label starts with "Three-player" (four-player games, the usual case, are not marked).
 */
export function rulesLabel(m: Messages, rules: GameRules, playerCount: PlayerCount = 4): string {
  const structured =
    rules.room !== undefined || rules.openTanyao !== undefined || rules.fast !== undefined;
  const description = rules.description?.trim();
  const parts: string[] = playerCount === 3 ? [m.viewer.players[3]] : [];
  if (!structured && description) {
    return [...parts, description].join(" · ");
  }
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

const TENHOU_ID_DATE = /^(\d{4})(\d{2})(\d{2})\d{2}gm-/;

/** The day a Tenhou log id starts with ("2019050417gm-…" is 4 May 2019), or null. */
export function logDate(locale: Locale, id: string | undefined): string | null {
  const match = id === undefined ? null : TENHOU_ID_DATE.exec(id);
  if (!match) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const time = Date.UTC(year, month - 1, day);
  if (Number.isNaN(time) || new Date(time).getUTCDate() !== day) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(time);
}

/** Where the log comes from: "tenhou.net/6 JSON · 4 May 2019" (the date when the id has one). */
export function sourceLabel(
  m: Messages,
  locale: Locale,
  game: Pick<GameLog, "format" | "id">,
): string {
  return m.panel.source(m.viewer.formats[game.format], logDate(locale, game.id));
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

/**
 * Ranking of the playing seats (the empty chair of a three-player game is never ranked): higher
 * score first; ties go to the seat that started closer to East.
 */
export function standings(scores: Quad<number>, playerCount: PlayerCount = 4): Standing[] {
  return [...activeSeats(playerCount)]
    .sort((a, b) => scores[b] - scores[a] || a - b)
    .map((seat, index) => ({ seat, score: scores[seat], place: index + 1 }));
}

/** A win's value: "5 han · 40 fu · 7,700 points", "Haneman · 18,000 points", "2× Yakuman". */
export function winValueLabel(m: Messages, locale: Locale, win: WinEvent): string {
  const yakumanCount = (win.yaku ?? [])
    .filter((entry) => entry.yakuman)
    .reduce((sum, entry) => sum + Math.max(1, Math.round(entry.han / 13)), 0);
  const parts: string[] = [];
  if (yakumanCount > 0) {
    parts.push(m.result.yakuman(yakumanCount));
  } else {
    if (win.han !== undefined) {
      parts.push(m.result.han(win.han));
    }
    // Limit hands are named instead; tenhou.net/6 JSON has no fu for them, so hide it for every format.
    if (win.fu !== undefined && win.fu > 0 && win.limit === undefined) {
      parts.push(m.result.fu(win.fu));
    }
    if (win.limit !== undefined) {
      parts.push(m.result.limits[win.limit]);
    }
  }
  if (win.points !== undefined) {
    parts.push(m.result.points(formatPoints(locale, win.points)));
  }
  return parts.join(" · ");
}

/**
 * One line for a round's results, for the status line and the timeline: who won and how, with
 * the value ("A wins by tsumo · 6 han · Haneman · 12,000 points"), or the kind of draw with the
 * tenpai seats. A multiple ron joins its wins with " / ".
 */
export function resultSummary(
  m: Messages,
  results: ReadonlyArray<WinEvent | RyukyokuEvent>,
  names: Quad<string>,
  locale: Locale,
): string {
  return results
    .map((result) => {
      if (result.type === "ryukyoku") {
        const parts = [m.ryukyoku[result.reason]];
        if (result.reason === "exhaustive" && result.tenpai !== undefined) {
          parts.push(m.result.tenpaiSeats(result.tenpai.map((seat) => names[seat])));
        }
        return parts.join(" · ");
      }
      const who =
        result.from === result.seat
          ? m.event.tsumo(names[result.seat])
          : m.event.ron(names[result.seat], names[result.from]);
      const value = winValueLabel(m, locale, result);
      return value === "" ? who : `${who} · ${value}`;
    })
    .join(" / ");
}
