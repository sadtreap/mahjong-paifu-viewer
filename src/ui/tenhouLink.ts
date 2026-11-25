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

/**
 * Tenhou's page with a log's mjlog XML. tenhou.net serves it to any site (CORS allows every
 * origin), so the viewer can download it; it is also the page users can save by hand.
 */
export function tenhouLogDataUrl(logId: string): string {
  return `https://tenhou.net/0/log/?${logId}`;
}
