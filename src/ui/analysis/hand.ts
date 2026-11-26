/**
 * Hand analysis for the review aids: waits, shanten and the tiles a seat cannot see. Pure and
 * React-free; kinds use tileKind numbering (0-8 man, 9-17 pin, 18-26 sou, 27-33 honours, red fives
 * count as fives). Works for four- and three-player games: kita (set-aside Norths) are never hand
 * tiles, and in three-player games 2m-8m do not exist.
 */
import type { PlayerCount, Seat } from "../../core/model";
import { SANMA_UNUSED_KINDS } from "../../core/players";
import { doraFromIndicator, type KnownTile, type Tile, tileKind } from "../../core/tile";
import type { BoardState, DiscardView, SeatView } from "../../replay/types";

export const KIND_COUNT = 34;

/** The 13 terminal and honour kinds of kokushi musou (thirteen orphans). */
const YAOCHU_KINDS: readonly number[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** Tiles per kind, or null when a tile's face is unknown ("?"). */
export function kindCounts(tiles: readonly Tile[]): number[] | null {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  for (const tile of tiles) {
    const kind = tileKind(tile);
    if (kind < 0) {
      return null;
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

/** The dora kinds the indicators point to (in three-player games 1m points to 9m). */
export function doraKinds(
  indicators: readonly KnownTile[],
  playerCount: PlayerCount,
): ReadonlySet<number> {
  return new Set(
    indicators.map((indicator) => tileKind(doraFromIndicator(indicator, playerCount))),
  );
}

/** A seat's concealed tiles: the hand plus the drawn tile (never its kita or melds). */
export function concealedTiles(view: Pick<SeatView, "hand" | "drawn">): Tile[] {
  return view.drawn === null ? view.hand : [...view.hand, view.drawn];
}

// ---- complete hands ----

/** Whether the counts split into sets only (triplets, and sequences in the suits). */
function isAllSets(counts: number[]): boolean {
  const c = counts.slice();
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    for (let i = 0; i < 9; i++) {
      // Triplets of the lowest kind left are sets; the rest of it can only start sequences.
      const n = (c[base + i] ?? 0) % 3;
      if (n === 0) {
        continue;
      }
      if (i > 6) {
        return false;
      }
      const a = c[base + i + 1] ?? 0;
      const b = c[base + i + 2] ?? 0;
      if (a < n || b < n) {
        return false;
      }
      c[base + i + 1] = a - n;
      c[base + i + 2] = b - n;
    }
  }
  for (let kind = 27; kind < KIND_COUNT; kind++) {
    if ((c[kind] ?? 0) % 3 !== 0) {
      return false;
    }
  }
  return true;
}

/** Four sets (minus the called ones) and a pair. */
function isStandardComplete(counts: number[]): boolean {
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    if ((counts[kind] ?? 0) >= 2) {
      counts[kind] = (counts[kind] ?? 0) - 2;
      const ok = isAllSets(counts);
      counts[kind] = (counts[kind] ?? 0) + 2;
      if (ok) {
        return true;
      }
    }
  }
  return false;
}

/** Seven different pairs (four of a kind is not two pairs, as on Tenhou). */
function isChiitoitsu(counts: number[]): boolean {
  let pairs = 0;
  for (const n of counts) {
    if (n === 2) {
      pairs++;
    } else if (n !== 0) {
      return false;
    }
  }
  return pairs === 7;
}

function isKokushi(counts: number[]): boolean {
  let pair = false;
  for (const kind of YAOCHU_KINDS) {
    const n = counts[kind] ?? 0;
    if (n === 0 || n > 2) {
      return false;
    }
    pair ||= n === 2;
  }
  const total = counts.reduce((sum, n) => sum + n, 0);
  return pair && total === 14;
}

/** Whether 3n+2 concealed tiles (with `closed` = no calls at all) form a winning shape. */
function isComplete(counts: number[], closed: boolean): boolean {
  return isStandardComplete(counts) || (closed && (isChiitoitsu(counts) || isKokushi(counts)));
}

// ---- waits ----

/**
 * The kinds that complete a hand of 3n+1 concealed tiles (`meldCount` calls, closed kans
 * included): standard hands, plus chiitoitsu and kokushi when the hand has no call. A kind the
 * hand already holds four of is skipped (it cannot be drawn), and so are the kinds three-player
 * games leave out. Empty for a hand of another size or with an unknown tile.
 */
export function waits(
  hand: readonly Tile[],
  meldCount: number,
  playerCount: PlayerCount,
): number[] {
  const counts = kindCounts(hand);
  if (counts === null || hand.length % 3 !== 1) {
    return [];
  }
  const closed = meldCount === 0;
  const result: number[] = [];
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    const held = counts[kind] ?? 0;
    if (held >= 4 || (playerCount === 3 && SANMA_UNUSED_KINDS.has(kind))) {
      continue;
    }
    if (!closed || !YAOCHU_KINDS.includes(kind)) {
      // A standard or chiitoitsu wait touches a held tile: the same kind or a suit neighbour.
      if (held === 0 && !hasNeighbour(counts, kind)) {
        continue;
      }
    }
    counts[kind] = held + 1;
    if (isComplete(counts, closed)) {
      result.push(kind);
    }
    counts[kind] = held;
  }
  return result;
}

function hasNeighbour(counts: number[], kind: number): boolean {
  if (kind >= 27) {
    return false;
  }
  const value = kind % 9;
  for (let d = -2; d <= 2; d++) {
    const v = value + d;
    if (d !== 0 && v >= 0 && v < 9 && (counts[kind + d] ?? 0) > 0) {
      return true;
    }
  }
  return false;
}

// ---- shanten ----

/** Sets, partial sets (taatsu) and whether a pair is kept as the head, for one suit or the honours. */
interface Blocks {
  sets: number;
  partials: number;
  pair: number;
}

/** Splits per group shape, by base-5 key: suits (9 kinds, sequences allowed) and honours (7). */
const suitCache = new Map<number, readonly Blocks[]>();
const honorCache = new Map<number, readonly Blocks[]>();

/** Base-5 key of a group's counts (at most 4 per kind). */
function groupKey(counts: readonly number[], start: number, size: number): number {
  let key = 0;
  for (let i = 0; i < size; i++) {
    key = key * 5 + Math.min(counts[start + i] ?? 0, 4);
  }
  return key;
}

/** Every useful way to split one group into blocks, without dominated ones. */
function groupBlocks(counts: readonly number[], start: number, size: number): readonly Blocks[] {
  const honors = size === 7;
  const cache = honors ? honorCache : suitCache;
  const key = groupKey(counts, start, size);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const c = Array.from({ length: size }, (_, i) => Math.min(counts[start + i] ?? 0, 4));
  const found: Blocks[] = [];
  const record = (sets: number, partials: number, pair: number) => {
    for (const other of found) {
      if (
        other.pair >= pair &&
        other.sets >= sets &&
        other.sets + other.partials >= sets + partials
      ) {
        return;
      }
    }
    for (let i = found.length - 1; i >= 0; i--) {
      const other = found[i] as Blocks;
      if (
        pair >= other.pair &&
        sets >= other.sets &&
        sets + partials >= other.sets + other.partials
      ) {
        found.splice(i, 1);
      }
    }
    found.push({ sets, partials, pair });
  };
  const walk = (from: number, sets: number, partials: number, pair: number): void => {
    let i = from;
    while (i < size && c[i] === 0) {
      i++;
    }
    if (i === size) {
      record(sets, partials, pair);
      return;
    }
    const n = c[i] as number;
    const next1 = !honors && i + 1 < size ? (c[i + 1] as number) : 0;
    const next2 = !honors && i + 2 < size ? (c[i + 2] as number) : 0;
    if (n >= 3) {
      c[i] = n - 3;
      walk(i, sets + 1, partials, pair);
      c[i] = n;
    }
    if (next1 > 0 && next2 > 0) {
      c[i] = n - 1;
      c[i + 1] = next1 - 1;
      c[i + 2] = next2 - 1;
      walk(i, sets + 1, partials, pair);
      c[i] = n;
      c[i + 1] = next1;
      c[i + 2] = next2;
    }
    if (n >= 2) {
      c[i] = n - 2;
      if (pair === 0) {
        walk(i, sets, partials, 1);
      }
      walk(i, sets, partials + 1, pair);
      c[i] = n;
    }
    if (next1 > 0) {
      c[i] = n - 1;
      c[i + 1] = next1 - 1;
      walk(i, sets, partials + 1, pair);
      c[i] = n;
      c[i + 1] = next1;
    }
    if (next2 > 0) {
      c[i] = n - 1;
      c[i + 2] = next2 - 1;
      walk(i, sets, partials + 1, pair);
      c[i] = n;
      c[i + 2] = next2;
    }
    // Leave one tile of this kind unused.
    c[i] = n - 1;
    walk(i, sets, partials, pair);
    c[i] = n;
  };
  walk(0, 0, 0, 0);
  cache.set(key, found);
  return found;
}

function standardShanten(counts: readonly number[], meldCount: number): number {
  const groups = [
    groupBlocks(counts, 0, 9),
    groupBlocks(counts, 9, 9),
    groupBlocks(counts, 18, 9),
    groupBlocks(counts, 27, 7),
  ];
  let best = 8;
  const combine = (index: number, sets: number, partials: number, pair: number): void => {
    if (index === groups.length) {
      const allSets = sets + meldCount;
      const usable = Math.max(0, Math.min(partials, 4 - allSets));
      best = Math.min(best, 8 - 2 * allSets - usable - pair);
      return;
    }
    for (const option of groups[index] as readonly Blocks[]) {
      if (pair + option.pair <= 1) {
        combine(index + 1, sets + option.sets, partials + option.partials, pair + option.pair);
      }
    }
  };
  combine(0, 0, 0, 0);
  return best;
}

function chiitoitsuShanten(counts: readonly number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (const n of counts) {
    if (n > 0) {
      kinds++;
    }
    if (n >= 2) {
      pairs++;
    }
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

function kokushiShanten(counts: readonly number[]): number {
  let kinds = 0;
  let pair = 0;
  for (const kind of YAOCHU_KINDS) {
    const n = counts[kind] ?? 0;
    if (n > 0) {
      kinds++;
    }
    if (n >= 2) {
      pair = 1;
    }
  }
  return 13 - kinds - pair;
}

/**
 * Shanten of the concealed tiles with `meldCount` calls (closed kans included): -1 for a complete
 * hand, 0 for tenpai, n for n tiles away from tenpai. Standard hands, plus chiitoitsu and kokushi
 * when the hand has no call. Unknown tiles ("?") are left out.
 */
export function shanten(hand: readonly Tile[], meldCount: number): number {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  for (const tile of hand) {
    const kind = tileKind(tile);
    if (kind >= 0) {
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
  }
  let result = standardShanten(counts, meldCount);
  if (meldCount === 0) {
    result = Math.min(result, chiitoitsuShanten(counts), kokushiShanten(counts));
  }
  return result;
}

/**
 * Shanten counting only waits that can still come: a tenpai shape whose waits are all gone (a
 * kind held four times, or 2m-8m with three players) counts as 1-shanten, as Tenhou counts such a
 * hand noten. For 3n+2 tiles, 0 means some discard leaves a hand with a live wait.
 */
export function liveShanten(
  hand: readonly Tile[],
  meldCount: number,
  playerCount: PlayerCount,
): number {
  const value = shanten(hand, meldCount);
  if (value !== 0) {
    return value;
  }
  if (hand.length % 3 === 1) {
    return waits(hand, meldCount, playerCount).length > 0 ? 0 : 1;
  }
  const tried = new Set<number>();
  for (let index = 0; index < hand.length; index++) {
    const kind = tileKind(hand[index] as Tile);
    if (tried.has(kind)) {
      continue;
    }
    tried.add(kind);
    const rest = [...hand.slice(0, index), ...hand.slice(index + 1)];
    if (waits(rest, meldCount, playerCount).length > 0) {
      return 0;
    }
  }
  return 1;
}

// ---- tiles a seat can see ----

function addTile(counts: Uint8Array, tile: Tile | null | undefined): void {
  if (tile === null || tile === undefined) {
    return;
  }
  const kind = tileKind(tile);
  if (kind >= 0) {
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
}

/**
 * The tiles of each kind that `seat` can see: its own hand and drawn tile, every pond tile that
 * was not called (a called tile is counted once, in the meld that took it), every meld tile, every
 * kita and the dora indicators. Other players' concealed tiles never count, even when shown.
 */
export function visibleCounts(board: BoardState, seat: Seat): Uint8Array {
  const counts = new Uint8Array(KIND_COUNT);
  const own = board.seats[seat];
  for (const tile of own.hand) {
    addTile(counts, tile);
  }
  addTile(counts, own.drawn);
  for (const view of board.seats) {
    for (const discard of view.discards) {
      if (!discard.called) {
        addTile(counts, discard.tile);
      }
    }
    for (const meld of view.melds) {
      for (const tile of meld.tiles) {
        addTile(counts, tile);
      }
      addTile(counts, meld.calledTile);
      addTile(counts, meld.addedTile);
    }
    for (const tile of view.kita) {
      addTile(counts, tile);
    }
  }
  for (const indicator of board.doraIndicators) {
    addTile(counts, indicator);
  }
  return counts;
}

/**
 * The tiles of each kind `seat` cannot see (4 minus what it sees), 0 for the kinds three-player
 * games leave out. Sums to 136 (108 with three players) minus the visible tiles.
 */
export function unseenCounts(board: BoardState, seat: Seat, playerCount: PlayerCount): Uint8Array {
  const visible = visibleCounts(board, seat);
  const unseen = new Uint8Array(KIND_COUNT);
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    if (playerCount === 3 && SANMA_UNUSED_KINDS.has(kind)) {
      continue;
    }
    unseen[kind] = Math.max(0, 4 - (visible[kind] ?? 0));
  }
  return unseen;
}

/** Whether the seat discarded one of its own waits (furiten; called discards count too). */
export function isDiscardFuriten(
  waitKinds: readonly number[],
  discards: readonly DiscardView[],
): boolean {
  return discards.some((discard) => waitKinds.includes(tileKind(discard.tile)));
}
