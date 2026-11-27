import type { Seat } from "../core/model";

const TENHOU_LOG_ID = /\b(\d{10}gm-[0-9a-f]{4}-\d{4,5}-[0-9a-f]{8})\b/;

/** Longest text still treated as a link; log data is far longer. */
const MAX_LINK_LENGTH = 2048;

/** Finds a Tenhou log id (e.g. "2000010100gm-0089-0000-0123abcd") in text such as a viewer link. */
export function findTenhouLogId(text: string): string | null {
  return TENHOU_LOG_ID.exec(text)?.[1] ?? null;
}

/**
 * The log id when the text is only a Tenhou replay link (with or without https://) or a bare log id.
 * Log data that mentions an id (tenhou.net/6 JSON keeps it in "ref") and tenhou.net/6 links that
 * carry the log after #json= are not links to download, so they give null.
 */
export function tenhouLinkLogId(text: string): string | null {
  const trimmed = text.trim();
  if (
    trimmed.length > MAX_LINK_LENGTH ||
    /\s/.test(trimmed) ||
    /^[[{<]/.test(trimmed) ||
    trimmed.includes("#json=")
  ) {
    return null;
  }
  return findTenhouLogId(trimmed);
}

/** Where a Tenhou replay link opens: `tw` is the seat it is viewed from, `ts` the round (0-based). */
export interface TenhouLinkStart {
  pov: Seat | null;
  round: number | null;
}

/** Largest `ts` taken as a round index; no game has this many rounds. */
const MAX_ROUND_INDEX = 999;

/**
 * Reads `tw` (the seat, 0-3) and `ts` (the round, 0-based) from a Tenhou replay link, e.g.
 * tenhou.net/0/?log=…&tw=2&ts=3. Missing or out-of-range values, and text that is not a Tenhou
 * link, give null. Whether `tw` is a playing seat (not seat 3 in a three-player game) is checked
 * once the game is loaded.
 */
export function tenhouLinkStart(text: string): TenhouLinkStart {
  if (tenhouLinkLogId(text) === null) {
    return { pov: null, round: null };
  }
  const tw = linkParam(text, "tw");
  const ts = linkParam(text, "ts");
  return {
    pov: tw !== null && tw <= 3 ? (tw as Seat) : null,
    round: ts !== null && ts <= MAX_ROUND_INDEX ? ts : null,
  };
}

/** A whole-number query parameter of a link (digits only), or null. */
function linkParam(text: string, name: string): number | null {
  const match = new RegExp(`[?&#]${name}=(\\d{1,4})(?![\\w.])`).exec(text.trim());
  return match?.[1] === undefined ? null : Number(match[1]);
}

/**
 * Tenhou's page with a log's mjlog XML. tenhou.net serves it to any site (CORS allows every
 * origin), so the viewer can download it; it is also the page users can save by hand.
 */
export function tenhouLogDataUrl(logId: string): string {
  return `https://tenhou.net/0/log/?${logId}`;
}

/**
 * Tenhou's replay link to a log, viewed from `start.pov` (`tw`) at the round `start.round`
 * (0-based, `ts`); the first round and an unknown seat are left out, as Tenhou writes them.
 */
export function tenhouReplayUrl(logId: string, start: TenhouLinkStart): string {
  const tw = start.pov === null ? "" : `&tw=${start.pov}`;
  const ts = start.round !== null && start.round > 0 ? `&ts=${start.round}` : "";
  return `https://tenhou.net/0/?log=${logId}${tw}${ts}`;
}
