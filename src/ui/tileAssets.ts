import { isKnownTile, isRedFive, type Tile } from "../core/tile";

/**
 * Tile images come from FluffyStuff/riichi-mahjong-tiles (public domain), copied into public/tiles.
 * Every image shares the same 300x400 viewBox: Front.svg is the blank tile body, and each face
 * (Man1.svg, Ton.svg, ...) is a transparent symbol drawn over it. Back.svg is a complete tile.
 */
const SUIT_FILES = { m: "Man", p: "Pin", s: "Sou" } as const;
const HONOR_FILES = ["Ton", "Nan", "Shaa", "Pei", "Haku", "Hatsu", "Chun"] as const;

/** File name (without extension) of the face for a tile, or null for "?" (drawn as the back). */
export function tileFaceName(tile: Tile): string | null {
  if (!isKnownTile(tile)) {
    return null;
  }
  const suit = tile[1];
  if (suit === "z") {
    return HONOR_FILES[Number(tile[0]) - 1] ?? null;
  }
  const file = SUIT_FILES[suit as keyof typeof SUIT_FILES];
  return isRedFive(tile) ? `${file}5-Dora` : `${file}${tile[0]}`;
}

/** URL of a tile image, relative to the deployed base path. */
export function tileImageUrl(name: string): string {
  return `${import.meta.env.BASE_URL}tiles/${name}.svg`;
}

export const TILE_FRONT_URL = tileImageUrl("Front");
export const TILE_BACK_URL = tileImageUrl("Back");
