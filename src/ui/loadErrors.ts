import { LogParseError } from "../formats/index";
import type { UiErrorCode } from "../i18n/messages/en";
import { findTenhouLogId } from "./tenhouLink";

export interface LoadError {
  code: UiErrorCode;
  /** Tenhou log id of the link that was loaded, used to point at the log data page. */
  logId: string | null;
}

/** Maps anything thrown while loading to a UI error. `input` is the text that was loaded, if any. */
export function toLoadError(error: unknown, input: string | null): LoadError {
  if (error instanceof LogParseError) {
    const logId = error.code === "urlOnly" && input !== null ? findTenhouLogId(input) : null;
    return { code: error.code, logId };
  }
  return { code: "unexpected", logId: null };
}

/**
 * The error for a Tenhou link whose download arrived but did not load. Something that is not a log
 * at all (an empty or error page) means the log was not downloaded, so the user gets the help for
 * saving it by hand; errors about the log itself (e.g. a three-player game) are kept.
 */
export function tenhouLoadError(error: LoadError, logId: string): LoadError {
  const notALog =
    error.code === "empty" || error.code === "unrecognized" || error.code === "urlOnly";
  return notALog ? { code: "tenhouFetchFailed", logId } : error;
}
