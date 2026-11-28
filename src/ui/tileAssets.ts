import { isKnownTile, isRedFive, type Tile } from "../core/tile";

/**
 * Tile images come from FluffyStuff/riichi-mahjong-tiles (public domain), copied into public/tiles.
 * Every face (Man1.svg, Ton.svg, ...) is a transparent symbol on a 300x400 viewBox; the viewer
 * draws the tile's body under it, and a face-down tile, in CSS (TileImage.module.css).
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

/** Every face: the 34 kinds plus the three red fives. */
export function allTileImageUrls(): string[] {
  const faces: string[] = [];
  for (const file of Object.values(SUIT_FILES)) {
    for (let value = 1; value <= 9; value++) {
      faces.push(`${file}${value}`);
    }
    faces.push(`${file}5-Dora`);
  }
  faces.push(...HONOR_FILES);
  return faces.map(tileImageUrl);
}

let preloaded = false;

/**
 * Starts loading every tile image once (decoded off the main thread), so the first steps of a
 * game draw without waiting for images. Does nothing outside a browser or on a second call.
 */
export function preloadTileImages(): void {
  if (preloaded || typeof Image === "undefined") {
    return;
  }
  preloaded = true;
  for (const url of allTileImageUrls()) {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  }
}
