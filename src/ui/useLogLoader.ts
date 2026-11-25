import { useCallback, useRef, useState } from "react";
import type { GameLog } from "../core/model";
import { LogParseError, loadLog, MAX_LOG_SIZE } from "../formats/index";
import { type LoadError, tenhouLoadError, toLoadError } from "./loadErrors";
import type { LogSource } from "./logSource";
import type { Position } from "./navigation";
import { tenhouLinkLogId, tenhouLogDataUrl } from "./tenhouLink";

export interface LoaderState {
  loading: boolean;
  game: GameLog | null;
  /** Increments with every loaded game, so views can reset their state. */
  gameKey: number;
  /** Where to open the loaded game (0-based, not yet clamped), or null for the start. */
  start: Position | null;
  error: LoadError | null;
}

const INITIAL: LoaderState = { loading: false, game: null, gameKey: 0, start: null, error: null };

class FetchError extends Error {}

/**
 * Reads a source into what loadLog takes. Files and URLs are read as bytes (they may be gzip). A
 * file larger than any log is refused before it is read (LogParseError "tooLarge").
 */
async function readSource(source: LogSource): Promise<string | ArrayBuffer> {
  switch (source.kind) {
    case "file":
      if (source.file.size > MAX_LOG_SIZE) {
        throw new LogParseError("tooLarge", `${source.file.size} bytes`);
      }
      return source.file.arrayBuffer();
    case "text":
      return source.text;
    case "url":
      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${source.url}`);
        }
        return await response.arrayBuffer();
      } catch (error) {
        throw new FetchError("Could not download the log", { cause: error });
      }
  }
}

/**
 * Loads logs from files, text or URLs. Text that is only a Tenhou replay link or log id loads that
 * log from tenhou.net. Only the latest request counts: a slow load that finishes after a newer one
 * is dropped. A failed load keeps the current game and reports the error.
 */
export function useLogLoader() {
  const [state, setState] = useState<LoaderState>(INITIAL);
  const latest = useRef(0);

  const load = useCallback(async (source: LogSource, start: Position | null = null) => {
    const request = ++latest.current;
    const isCurrent = () => request === latest.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const tenhouId = source.kind === "text" ? tenhouLinkLogId(source.text) : null;
    const target: LogSource = tenhouId ? { kind: "url", url: tenhouLogDataUrl(tenhouId) } : source;

    let input: string | ArrayBuffer;
    try {
      input = await readSource(target);
    } catch (error) {
      if (isCurrent()) {
        setState((previous) => ({
          ...previous,
          loading: false,
          error: readError(error, tenhouId),
        }));
      }
      return;
    }

    try {
      const game = await loadLog(input);
      if (isCurrent()) {
        setState((previous) => ({
          loading: false,
          game,
          gameKey: previous.gameKey + 1,
          start,
          error: null,
        }));
      }
    } catch (error) {
      if (!isCurrent()) {
        return;
      }
      const text = typeof input === "string" ? input : decodeSmallText(input);
      let loadError = toLoadError(error, text);
      if (tenhouId) {
        loadError = tenhouLoadError(loadError, tenhouId);
      }
      if (loadError.code === "unexpected") {
        console.error(error);
      }
      setState((previous) => ({ ...previous, loading: false, error: loadError }));
    }
  }, []);

  const dismissError = useCallback(() => {
    setState((previous) => ({ ...previous, error: null }));
  }, []);

  const closeGame = useCallback(() => {
    latest.current++;
    setState((previous) => ({ ...INITIAL, gameKey: previous.gameKey }));
  }, []);

  return { ...state, load, dismissError, closeGame };
}

/** The error for a source that could not be read or downloaded. */
function readError(error: unknown, tenhouId: string | null): LoadError {
  if (error instanceof LogParseError) {
    return toLoadError(error, null);
  }
  if (error instanceof FetchError) {
    return tenhouId
      ? { code: "tenhouFetchFailed", logId: tenhouId }
      : { code: "fetchFailed", logId: null };
  }
  return { code: "readFailed", logId: null };
}

/** Decodes file bytes for error hints (e.g. a saved link), skipping anything large. */
function decodeSmallText(buffer: ArrayBuffer): string | null {
  return buffer.byteLength > 64 * 1024 ? null : new TextDecoder("utf-8").decode(buffer);
}
