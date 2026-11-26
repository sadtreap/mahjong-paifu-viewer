import { useCallback, useRef, useState } from "react";
import type { GameLog } from "../core/model";
import { LogParseError, loadLog, MAX_LOG_SIZE } from "../formats/index";
import { type LoadError, tenhouLoadError, toLoadError } from "./loadErrors";
import type { LogSource } from "./logSource";
import type { Position } from "./navigation";
import { tenhouLinkLogId, tenhouLinkStart, tenhouLogDataUrl } from "./tenhouLink";
import type { LinkSource, ViewerStart } from "./viewer/types";

export interface LoaderState {
  loading: boolean;
  game: GameLog | null;
  /** Increments with every loaded game, so views can reset their state. */
  gameKey: number;
  /**
   * Where to open the loaded game (0-based, not yet clamped; `pov` not yet checked against the
   * player count), or null for the start.
   */
  start: ViewerStart | null;
  /**
   * Where the loaded game came from when a link can reopen it (a bundled sample or a Tenhou log),
   * else null (a local file or pasted log data).
   */
  origin: LinkSource | null;
  error: LoadError | null;
}

const INITIAL: LoaderState = {
  loading: false,
  game: null,
  gameKey: 0,
  start: null,
  origin: null,
  error: null,
};

/** A start position as `load` takes it: without `pov`, the game opens from the default seat. */
export type LoadStart = Position & { pov?: ViewerStart["pov"] };

function toViewerStart(start: LoadStart | null): ViewerStart | null {
  return start === null ? null : { round: start.round, step: start.step, pov: start.pov ?? null };
}

/**
 * Where a pasted Tenhou link opens: its `ts` round and `tw` seat, or null when it names neither.
 */
function tenhouStart(text: string): ViewerStart | null {
  const { pov, round } = tenhouLinkStart(text);
  return pov === null && round === null ? null : { round: round ?? 0, step: 0, pov };
}

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
 * log from tenhou.net; its `tw` and `ts` say where to open it unless `start` does, and the log id
 * becomes the origin unless `origin` says otherwise. Only the latest request counts: a slow load
 * that finishes after a newer one is dropped. A failed load keeps the current game and reports the
 * error. `load` resolves to true when this request's game was loaded.
 */
export function useLogLoader() {
  const [state, setState] = useState<LoaderState>(INITIAL);
  const latest = useRef(0);

  const load = useCallback(
    async (
      source: LogSource,
      start: LoadStart | null = null,
      origin: LinkSource | null = null,
    ): Promise<boolean> => {
      const request = ++latest.current;
      const isCurrent = () => request === latest.current;
      setState((previous) => ({ ...previous, loading: true, error: null }));
      const tenhouId = source.kind === "text" ? tenhouLinkLogId(source.text) : null;
      const target: LogSource = tenhouId
        ? { kind: "url", url: tenhouLogDataUrl(tenhouId) }
        : source;
      const gameStart =
        toViewerStart(start) ??
        (source.kind === "text" && tenhouId ? tenhouStart(source.text) : null);
      const gameOrigin: LinkSource | null =
        origin ?? (tenhouId ? { kind: "tenhou", logId: tenhouId } : null);

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
        return false;
      }

      try {
        const game = await loadLog(input);
        if (!isCurrent()) {
          return false;
        }
        setState((previous) => ({
          loading: false,
          game,
          gameKey: previous.gameKey + 1,
          start: gameStart,
          origin: gameOrigin,
          error: null,
        }));
        return true;
      } catch (error) {
        if (!isCurrent()) {
          return false;
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
        return false;
      }
    },
    [],
  );

  const dismissError = useCallback(() => {
    setState((previous) => ({ ...previous, error: null }));
  }, []);

  return { ...state, load, dismissError };
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
