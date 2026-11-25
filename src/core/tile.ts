/**
 * Tiles use mpsz notation:
 * - "1m".."9m" characters (man), "1p".."9p" circles (pin), "1s".."9s" bamboo (sou)
 * - "0m" / "0p" / "0s" red fives
 * - "1z".."7z" honors: East, South, West, North, White (haku), Green (hatsu), Red (chun)
 * - "?" a tile whose face is not recorded (e.g. opponents' draws in a log recorded from one seat)
 */
export type Suit = "m" | "p" | "s";
export type NumberTile = `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${Suit}`;
export type RedFive = `0${Suit}`;
export type HonorTile = `${1 | 2 | 3 | 4 | 5 | 6 | 7}z`;
export type KnownTile = NumberTile | RedFive | HonorTile;
export type Tile = KnownTile | "?";

export const UNKNOWN_TILE = "?" satisfies Tile;

const TILE_PATTERN = /^(?:[0-9][mps]|[1-7]z|\?)$/;

export function isTile(value: string): value is Tile {
  return TILE_PATTERN.test(value);
}

export function isKnownTile(tile: Tile): tile is KnownTile {
  return tile !== UNKNOWN_TILE;
}

export function isRedFive(tile: Tile): tile is RedFive {
  return tile[0] === "0";
}

/** Maps a red five to the plain five; every other tile is returned as is. */
export function normalizeTile<T extends Tile>(tile: T): T extends RedFive ? NumberTile : T {
  return (isRedFive(tile) ? `5${tile[1]}` : tile) as T extends RedFive ? NumberTile : T;
}

const SUIT_OFFSET: Record<string, number> = { m: 0, p: 9, s: 18, z: 27 };

/** 0-8 man, 9-17 pin, 18-26 sou, 27-33 honors (red fives share the plain five's kind); -1 for "?". */
export function tileKind(tile: Tile): number {
  if (!isKnownTile(tile)) {
    return -1;
  }
  const value = tile[0] === "0" ? 5 : Number(tile[0]);
  return (SUIT_OFFSET[tile[1] as string] as number) + value - 1;
}

export function tileFromKind(kind: number, red = false): KnownTile {
  if (!Number.isInteger(kind) || kind < 0 || kind > 33) {
    throw new RangeError(`Invalid tile kind: ${kind}`);
  }
  if (kind >= 27) {
    return `${kind - 26}z` as HonorTile;
  }
  const suit = (["m", "p", "s"] as const)[Math.floor(kind / 9)] as Suit;
  const value = (kind % 9) + 1;
  if (red) {
    if (value !== 5) {
      throw new RangeError(`Only fives can be red, got kind ${kind}`);
    }
    return `0${suit}`;
  }
  return `${value}${suit}` as NumberTile;
}

/** True when both tiles are the same kind, treating red fives as fives. "?" matches nothing. */
export function isSameKind(a: Tile, b: Tile): boolean {
  const kind = tileKind(a);
  return kind >= 0 && kind === tileKind(b);
}

/**
 * Hand order: man, pin, sou, honors, then "?". Within a kind the red five comes first, matching
 * Tenhou, where the red five has the lowest id of its kind.
 */
export function compareTiles(a: Tile, b: Tile): number {
  const kindA = tileKind(a);
  const kindB = tileKind(b);
  if (kindA !== kindB) {
    if (kindA < 0) return 1;
    if (kindB < 0) return -1;
    return kindA - kindB;
  }
  return Number(!isRedFive(a)) - Number(!isRedFive(b));
}

export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort(compareTiles);
}

/** The dora a revealed indicator points to (9 wraps to 1, North to East, Red dragon to White). */
export function doraFromIndicator(indicator: KnownTile): NumberTile | HonorTile {
  const kind = tileKind(indicator);
  if (kind >= 27) {
    const base = kind < 31 ? 27 : 31;
    const size = kind < 31 ? 4 : 3;
    return tileFromKind(base + ((kind - base + 1) % size)) as HonorTile;
  }
  const suitBase = Math.floor(kind / 9) * 9;
  return tileFromKind(suitBase + ((kind - suitBase + 1) % 9)) as NumberTile;
}
