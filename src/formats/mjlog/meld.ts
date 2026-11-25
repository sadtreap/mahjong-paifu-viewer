/**
 * Tenhou tile ids and the meld bitfield of mjlog `<N m="...">` tags.
 *
 * Tile ids are 0-135: id >> 2 is the tile kind (0-8 man, 9-17 pin, 18-26 sou, 27-33 honors) and
 * id & 3 tells the four copies apart. With red fives on, ids 16, 52 and 88 (the first copy of 5m,
 * 5p and 5s) are the red ones.
 */

import { type KnownTile, tileFromKind } from "../../core/tile";

const RED_FIVE_IDS: ReadonlySet<number> = new Set([16, 52, 88]);

export function isTileId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id <= 135;
}

/** Converts a tile id to mpsz notation. The id must be valid (see isTileId). */
export function tileFromId(id: number, redFives: boolean): KnownTile {
  return tileFromKind(id >> 2, redFives && RED_FIVE_IDS.has(id));
}

/**
 * A decoded meld with tile ids. `from` is the discarder's seat relative to the caller
 * (1 = next player, 2 = across, 3 = previous player).
 */
export type DecodedMeld =
  | {
      type: "chi" | "pon" | "daiminkan";
      from: 1 | 2 | 3;
      /** Id of the tile taken from the discard. */
      called: number;
      /** Ids of the tiles from the caller's hand, ascending. */
      consumed: number[];
    }
  | {
      type: "kakan";
      from: 1 | 2 | 3;
      /** Id of the tile the pon took from the discard. */
      called: number;
      /** Ids of the pon's two tiles from the hand, ascending. */
      consumed: number[];
      /** Id of the tile added to the pon. */
      added: number;
    }
  | {
      type: "ankan";
      /** The four ids, ascending. */
      tiles: number[];
    }
  | {
      /** Three-player north extraction; never valid in a four-player game. */
      type: "nukidora";
    };

/**
 * Decodes the meld bitfield. Layout (low bits first):
 * - bits 0-1: discarder relative to the caller (0 = none, i.e. ankan)
 * - bit 2 set: chi. Bits 3-4, 5-6, 7-8 are the copy (id & 3) of the run's 1st, 2nd and 3rd tile;
 *   bits 10-15 = base * 3 + index of the called tile in the run, where base numbers the 21
 *   possible runs (7 per suit).
 * - bit 3 set: pon, bit 4 set: kakan. Bits 5-6 are the copy left out of the pon (for kakan, the
 *   added copy); bits 9-15 = kind * 3 + index of the called tile among the pon's three.
 * - bit 5 set: nukidora (three-player only).
 * - otherwise a kan: bits 8-15 are a tile id (the called tile for daiminkan).
 * Returns null when the value is not a valid meld.
 */
export function decodeMeld(m: number): DecodedMeld | null {
  if (!Number.isInteger(m) || m < 0 || m > 0xffff) {
    return null;
  }
  const relative = m & 3;
  if (m & 0x4) {
    const packed = m >> 10;
    const index = packed % 3;
    const run = Math.floor(packed / 3);
    if (run >= 21 || relative === 0) {
      return null;
    }
    const firstKind = Math.floor(run / 7) * 9 + (run % 7);
    const ids = [0, 1, 2].map((offset) => (firstKind + offset) * 4 + ((m >> (3 + offset * 2)) & 3));
    return {
      type: "chi",
      from: relative as 1 | 2 | 3,
      called: ids[index] as number,
      consumed: ids.filter((_, i) => i !== index),
    };
  }
  if (m & 0x18) {
    const packed = m >> 9;
    const index = packed % 3;
    const kind = Math.floor(packed / 3);
    if (kind >= 34 || relative === 0) {
      return null;
    }
    const unused = (m >> 5) & 3;
    const ids = [0, 1, 2, 3].filter((copy) => copy !== unused).map((copy) => kind * 4 + copy);
    const called = ids[index] as number;
    const consumed = ids.filter((_, i) => i !== index);
    if (m & 0x10) {
      return {
        type: "kakan",
        from: relative as 1 | 2 | 3,
        called,
        consumed,
        added: kind * 4 + unused,
      };
    }
    return { type: "pon", from: relative as 1 | 2 | 3, called, consumed };
  }
  if (m & 0x20) {
    return { type: "nukidora" };
  }
  const id = m >> 8;
  if (!isTileId(id)) {
    return null;
  }
  const kind = id >> 2;
  const ids = [0, 1, 2, 3].map((copy) => kind * 4 + copy);
  if (relative === 0) {
    return { type: "ankan", tiles: ids };
  }
  return {
    type: "daiminkan",
    from: relative as 1 | 2 | 3,
    called: id,
    consumed: ids.filter((other) => other !== id),
  };
}
