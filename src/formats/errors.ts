export type LogErrorCode =
  /** Nothing to load. */
  | "empty"
  /** Not a format we recognize. */
  | "unrecognized"
  /**
   * A link instead of log data. The UI fetches Tenhou log links itself (tenhou.net allows it), so
   * this reaches the user for other links, e.g. Mahjong Soul, which need a signed-in session.
   */
  | "urlOnly"
  /** Gzip data that could not be decompressed. */
  | "decompress"
  /** The format was recognized but the content is malformed. */
  | "invalid"
  /**
   * Not a three- or four-player game (e.g. an mjai name list of another length), or the log
   * contradicts itself about its number of players: what it declares (mjlog GO type, tenhou.net/6
   * ratingc or rule text, mjai num_players) disagrees with who it seats and deals in, or with
   * itself. Anything a seat does, scores or pays in a log whose player count is settled is
   * "invalid" instead.
   */
  | "unsupportedPlayers"
  /** Larger than any real log (protects the tab from huge or crafted input). */
  | "tooLarge";

/** Thrown by the loader and the parsers. `detail` is an English diagnostic, not shown as UI text. */
export class LogParseError extends Error {
  readonly code: LogErrorCode;
  readonly detail: string | undefined;

  constructor(code: LogErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "LogParseError";
    this.code = code;
    this.detail = detail;
  }
}
