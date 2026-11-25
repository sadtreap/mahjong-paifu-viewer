/**
 * Helpers for fuzz-style parser tests: deterministic truncations and character substitutions of a
 * real fixture. A parser must answer every such input with a GameLog or a LogParseError, never
 * with a raw TypeError or RangeError.
 */
import type { GameLog } from "../core/model";
import { LogParseError } from "../formats/errors";

/** `count` cut positions spread evenly over a text of `length` characters, both ends included. */
export function cutPoints(length: number, count: number): number[] {
  const points = new Set<number>([0, length]);
  for (let index = 1; index < count - 1; index++) {
    points.add(Math.round((index * length) / (count - 1)));
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * Closes what truncated JSON text left open (a string, then the open arrays and objects), so the
 * input gets past JSON.parse and into the parser. The result is not always valid JSON (e.g. a cut
 * inside a literal or right after an object key), which is fine for a fuzz input.
 */
export function closeJson(text: string): string {
  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === "[") {
      closers.push("]");
    } else if (char === "{") {
      closers.push("}");
    } else if (char === "]" || char === "}") {
      closers.pop();
    }
  }
  let closed = text;
  if (inString) {
    closed = `${escaped ? closed.slice(0, -1) : closed}"`;
  }
  return closed.replace(/[\s,:]+$/, "") + closers.reverse().join("");
}

/** A small deterministic pseudo-random generator (LCG), so failures are reproducible. */
export function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** `count` copies of `text`, each with one character replaced by one from `alphabet`. */
export function garbled(text: string, alphabet: string, count: number, seed = 1): string[] {
  const next = random(seed);
  const results: string[] = [];
  for (let index = 0; index < count; index++) {
    const at = Math.floor(next() * text.length);
    const char = alphabet[Math.floor(next() * alphabet.length)] ?? "";
    results.push(text.slice(0, at) + char + text.slice(at + 1));
  }
  return results;
}

/**
 * Parses `text` and describes the outcome: "game" or the LogParseError code. Any other exception is
 * rethrown with the start of the input that caused it, so the test fails with something to go on.
 */
export function parseOutcome(parse: (text: string) => GameLog, text: string): string {
  try {
    parse(text);
    return "game";
  } catch (error) {
    if (error instanceof LogParseError) {
      return error.code;
    }
    const where = text.length > 120 ? `${text.length} chars ending in ${text.slice(-120)}` : text;
    throw new Error(`${String(error)} for input: ${where}`, { cause: error });
  }
}
