import { LogParseError } from "../formats/index";
import type { UiErrorCode } from "../i18n/messages/en";
import { findTenhouLogId } from "./tenhouLink";

export interface LoadError {
  code: UiErrorCode;
  /** Tenhou log id of the link that was loaded, used to point at the log data page. */
  logId: string | null;
}

/** Longest text still looked at as a link; log data is far longer. */
const MAX_LINK_LENGTH = 2048;

/**
 * The hosts Mahjong Soul is played on (Japanese, English and Korean, and Chinese servers), with or
 * without a subdomain, as they appear anywhere in a short text.
 */
const MAHJONG_SOUL_HOST =
  /(?:^|[^a-z0-9-])(?:mahjongsoul\.com|mahjongsoul\.game\.yo-star\.com|maj-soul\.(?:com|net)|majsoul\.com)(?![a-z0-9-]|\.[a-z0-9])/i;

/**
 * True for a Mahjong Soul replay link, with or without https:// and whatever the game put around
 * it when it copied the link. Its log sits behind a signed-in session, so it cannot be downloaded.
 */
export function isMahjongSoulLink(text: string): boolean {
  return text.length <= MAX_LINK_LENGTH && MAHJONG_SOUL_HOST.test(text);
}

/** Maps anything thrown while loading to a UI error. `input` is the text that was loaded, if any. */
export function toLoadError(error: unknown, input: string | null): LoadError {
  if (!(error instanceof LogParseError)) {
    return { code: "unexpected", logId: null };
  }
  const notALog = error.code === "urlOnly" || error.code === "unrecognized";
  if (notALog && input !== null && isMahjongSoulLink(input)) {
    return { code: "mahjongSoul", logId: null };
  }
  const logId = error.code === "urlOnly" && input !== null ? findTenhouLogId(input) : null;
  return { code: error.code, logId };
}

/**
 * The error for a Tenhou link whose download arrived but did not load. Something that is not a log
 * at all (an empty or error page) means the log was not downloaded; errors about the log itself
 * (e.g. a damaged log) are kept.
 */
export function tenhouLoadError(error: LoadError, logId: string): LoadError {
  const notALog =
    error.code === "empty" || error.code === "unrecognized" || error.code === "urlOnly";
  return notALog ? { code: "tenhouFetchFailed", logId } : error;
}
