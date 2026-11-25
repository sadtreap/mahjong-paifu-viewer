import type { GameLog, LogFormat } from "../core/model";
import { LogParseError } from "./errors";
import { checkGameSize, MAX_LOG_SIZE } from "./limits";
import { parseMjai } from "./mjai/parse";
import { parseMjlog } from "./mjlog/parse";
import { parseTenhouJson } from "./tenhou-json/parse";

export type { LogErrorCode } from "./errors";
export { LogParseError } from "./errors";
export { MAX_LOG_SIZE, MAX_ROUND_DRAWS, MAX_ROUND_EVENTS } from "./limits";

const PARSERS: Record<LogFormat, (text: string) => GameLog> = {
  "tenhou-json": parseTenhouJson,
  mjlog: parseMjlog,
  mjai: parseMjai,
};

/**
 * Loads a log from file bytes or pasted text: decompresses gzip (Tenhou client .mjlog files),
 * detects the format and parses it. Throws LogParseError, with code "tooLarge" for input or
 * decompressed data over MAX_LOG_SIZE.
 */
export async function loadLog(input: string | ArrayBuffer | Uint8Array): Promise<GameLog> {
  if (typeof input === "string") {
    return parseLogText(input);
  }
  let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_LOG_SIZE) {
    throw tooLarge(`${bytes.byteLength} bytes`);
  }
  if (isGzip(bytes)) {
    bytes = await gunzip(bytes);
  }
  return parseLogText(new TextDecoder("utf-8").decode(bytes));
}

/**
 * Detects the format of log text and parses it. Throws LogParseError: "tooLarge" for text over
 * MAX_LOG_SIZE characters, "invalid" for a round larger than any real game.
 */
export function parseLogText(input: string): GameLog {
  if (input.length > MAX_LOG_SIZE) {
    throw tooLarge(`${input.length} characters`);
  }
  const text = unwrapTenhouUrl(input.replace(/^﻿/, "").trim());
  if (text === "") {
    throw new LogParseError("empty");
  }
  const format = detectFormat(text);
  if (!format) {
    if (/^https?:\/\//i.test(text)) {
      throw new LogParseError("urlOnly", "Only the log data can be loaded, not a link to it");
    }
    throw new LogParseError("unrecognized");
  }
  const game = PARSERS[format](text);
  checkGameSize(game);
  return game;
}

function tooLarge(size: string): LogParseError {
  return new LogParseError("tooLarge", `${size}, more than the ${MAX_LOG_SIZE} accepted`);
}

export function detectFormat(text: string): LogFormat | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    return /<mjloggm[\s>]/.test(trimmed) ? "mjlog" : null;
  }
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }
  const whole = tryParseJson(trimmed);
  if (whole !== undefined) {
    if (isObject(whole) && Array.isArray(whole.log)) {
      return "tenhou-json";
    }
    if (isMjaiEvent(whole) || (Array.isArray(whole) && isMjaiEvent(whole[0]))) {
      return "mjai";
    }
    return null;
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  return isMjaiEvent(tryParseJson(firstLine)) ? "mjai" : null;
}

/** Accepts a tenhou.net/6 viewer URL that carries the log in its hash (`#json=...`). */
function unwrapTenhouUrl(text: string): string {
  const match = /^https?:\/\/\S*#json=(.+)$/is.exec(text);
  if (!match?.[1]) {
    return text;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return text;
  }
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Decompresses gzip data chunk by chunk and stops once the output passes MAX_LOG_SIZE, so a small
 * file that expands to gigabytes (a gzip bomb) cannot exhaust the tab's memory.
 */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const reader = new Blob([new Uint8Array(bytes)])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"))
      .getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MAX_LOG_SIZE) {
        reader.cancel().catch(() => {
          // Nothing left to clean up: the data is dropped either way.
        });
        throw tooLarge(`${total} bytes so far after decompression`);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof LogParseError) {
      throw error;
    }
    throw new LogParseError("decompress", String(error));
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMjaiEvent(value: unknown): boolean {
  return isObject(value) && typeof value.type === "string";
}
