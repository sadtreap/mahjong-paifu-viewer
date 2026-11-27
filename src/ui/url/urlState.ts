import type { Seat } from "../../core/model";
import type { LogSource } from "../logSource";
import type { Position } from "../navigation";
import { isSampleId, sampleSource } from "../samples";
import { findTenhouLogId } from "../tenhouLink";
import type { LinkSource, ViewerStart } from "../viewer/types";

/** The query parameters the viewer reads and writes; every other parameter is left alone. */
const SAMPLE = "sample";
const TENHOU = "tenhou";
const ROUND = "round";
const STEP = "step";
const POV = "pov";
const OWN_PARAMS = [SAMPLE, TENHOU, ROUND, STEP, POV] as const;

/** A deep link: what to load and where to open it. */
export interface ViewerLink {
  source: LinkSource;
  /** 0-based and not yet clamped to the game; `pov` is not yet checked against the player count. */
  start: ViewerStart;
}

/** A whole number written in decimal digits, with an optional sign; anything else is null. */
function parseInteger(value: string | null): number | null {
  if (value === null || !/^[+-]?\d{1,9}$/.test(value.trim())) {
    return null;
  }
  return Number(value.trim());
}

/** The source a query names: a known sample, else a valid Tenhou log id, else null. */
function linkSource(params: URLSearchParams): LinkSource | null {
  const sample = params.get(SAMPLE);
  if (sample !== null && isSampleId(sample)) {
    return { kind: "sample", id: sample };
  }
  const tenhou = params.get(TENHOU)?.trim() ?? null;
  // The whole value must be one log id (findTenhouLogId alone would accept "x<id>y").
  if (tenhou !== null && findTenhouLogId(tenhou) === tenhou) {
    return { kind: "tenhou", logId: tenhou };
  }
  return null;
}

/**
 * Reads `?sample=<id>` or `?tenhou=<log id>` with `round`, `step` and `pov`, all 1-based like the
 * round names, the step slider and the seat keys. A missing or invalid round or step means the
 * first one, and a missing or invalid pov (outside 1-4) means none. Returns null without a known
 * sample or a valid Tenhou log id.
 */
export function parseViewerUrl(search: string): ViewerLink | null {
  const params = new URLSearchParams(search);
  const source = linkSource(params);
  if (source === null) {
    return null;
  }
  const pov = parseInteger(params.get(POV));
  return {
    source,
    start: {
      round: (parseInteger(params.get(ROUND)) ?? 1) - 1,
      step: (parseInteger(params.get(STEP)) ?? 1) - 1,
      pov: pov !== null && pov >= 1 && pov <= 4 ? ((pov - 1) as Seat) : null,
    },
  };
}

/**
 * The query string for a position: `?sample=…` or `?tenhou=…` plus 1-based `round`, `step` and
 * `pov`, followed by the parameters of `search` the viewer does not own. A null source (a local
 * file or pasted log, which no link can reopen) removes the viewer's parameters. Returns "" when
 * nothing is left, so the caller can write the bare path.
 */
export function formatViewerUrl(
  search: string,
  source: LinkSource | null,
  p: Position,
  pov: Seat,
): string {
  const others = new URLSearchParams(search);
  for (const name of OWN_PARAMS) {
    others.delete(name);
  }
  const params = new URLSearchParams();
  if (source !== null) {
    if (source.kind === "sample") {
      params.set(SAMPLE, source.id);
    } else {
      params.set(TENHOU, source.logId);
    }
    params.set(ROUND, String(p.round + 1));
    params.set(STEP, String(p.step + 1));
    params.set(POV, String(pov + 1));
  }
  for (const [name, value] of others) {
    params.append(name, value);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/** True when two link sources name the same log. */
export function sameLinkSource(a: LinkSource | null, b: LinkSource | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.kind === "sample") {
    return b.kind === "sample" && a.id === b.id;
  }
  return b.kind === "tenhou" && a.logId === b.logId;
}

/**
 * What to load for a link. A Tenhou log id goes in as text, so the loader downloads it from
 * tenhou.net with the Tenhou-specific error messages, exactly as a pasted link would.
 */
export function linkLogSource(source: LinkSource): LogSource {
  return source.kind === "sample" ? sampleSource(source.id) : { kind: "text", text: source.logId };
}

/**
 * The absolute link to a position for Copy link, or null for a game no link can reopen. `location`
 * is the page's (window.location in the app).
 */
export function viewerLink(
  location: Pick<Location, "origin" | "pathname" | "search" | "hash">,
  source: LinkSource | null,
  p: Position,
  pov: Seat,
): string | null {
  if (source === null) {
    return null;
  }
  return `${location.origin}${location.pathname}${formatViewerUrl(location.search, source, p, pov)}${location.hash}`;
}
