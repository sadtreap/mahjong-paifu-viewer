/**
 * Size limits that keep huge or crafted input from freezing or crashing the tab. Real logs stay
 * far below them: in 75 real four-player logs (399 rounds of Tenhou houou and ranked games,
 * convlog's test games and the samples) the largest file is 21 KB, the longest round has 156 events
 * and no round has more than 70 draws. Three-player rounds are smaller: at most 55 draws.
 */
import type { GameLog } from "../core/model";
import { LogParseError } from "./errors";

/**
 * Largest log accepted: bytes of a file or of decompressed gzip data, characters of text. Real logs
 * are tens of kilobytes; mjai logs with per-event metadata reach a few hundred. The UI can check a
 * file's size against it before reading the file.
 */
export const MAX_LOG_SIZE = 16 * 1024 * 1024;

/**
 * Most events in one round. A four-player round has at most 70 draws and 70 discards, plus calls
 * (each followed by a discard), kans, riichi acceptances, dora and up to three wins: about 200. A
 * three-player round has at most 55 draws, kita included (each kita is followed by a draw).
 */
export const MAX_ROUND_EVENTS = 400;

/**
 * Most draws in one round. The wall leaves 70 tiles to draw (55 with three players), rinshan draws
 * included (each kan or kita moves one tile from the live wall to the dead wall); 4 more allow for
 * rules that do not.
 */
export const MAX_ROUND_DRAWS = 74;

/** Rejects a parsed game with a round larger than any real game (replaying it would be slow). */
export function checkGameSize(game: GameLog): void {
  for (const [index, round] of game.rounds.entries()) {
    if (round.events.length > MAX_ROUND_EVENTS) {
      throw new LogParseError(
        "invalid",
        `Round ${index + 1} has ${round.events.length} events, more than any real game`,
      );
    }
    const draws = round.events.filter((event) => event.type === "draw").length;
    if (draws > MAX_ROUND_DRAWS) {
      throw new LogParseError(
        "invalid",
        `Round ${index + 1} has ${draws} draws, more than a wall holds`,
      );
    }
  }
}
