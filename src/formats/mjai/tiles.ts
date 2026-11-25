import type { HonorTile, Tile } from "../../core/tile";

/** mjai honor letters in mpsz order: East, South, West, North, haku (P), hatsu (F), chun (C). */
const HONOR_LETTERS = ["E", "S", "W", "N", "P", "F", "C"] as const;

const NUMBER_TILE = /^[1-9][mps]$/;
const RED_FIVE = /^5([mps])r$/;

/**
 * Converts an mjai tile ("1m".."9s", red "5mr"/"5pr"/"5sr", honors "E".."C", "?") to mpsz notation.
 * Returns undefined for anything else.
 */
export function tileFromMjai(value: string): Tile | undefined {
  if (value === "?") {
    return "?";
  }
  if (NUMBER_TILE.test(value)) {
    return value as Tile;
  }
  const red = RED_FIVE.exec(value);
  if (red) {
    return `0${red[1]}` as Tile;
  }
  const honor = (HONOR_LETTERS as readonly string[]).indexOf(value);
  return honor >= 0 ? (`${honor + 1}z` as HonorTile) : undefined;
}

/** Converts an mpsz tile to mjai notation (red fives become "5mr", honors become letters). */
export function tileToMjai(tile: Tile): string {
  if (tile === "?") {
    return "?";
  }
  const suit = tile[1];
  if (suit === "z") {
    return HONOR_LETTERS[Number(tile[0]) - 1] as string;
  }
  return tile[0] === "0" ? `5${suit}r` : tile;
}
