/** How Copy link went, for the status line: `app.linkCopied`, `app.linkUnavailable` or `app.linkCopyFailed`. */
export type CopyResult = "copied" | "unavailable" | "failed";

/**
 * Copies a deep link (useHistorySync's `link()`) to the clipboard. A null link (a local file or
 * pasted log) gives "unavailable"; a missing or refused clipboard (no secure context, permission
 * denied) gives "failed".
 */
export async function copyLink(
  link: string | null,
  clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator?.clipboard,
): Promise<CopyResult> {
  if (link === null) {
    return "unavailable";
  }
  if (!clipboard) {
    return "failed";
  }
  try {
    await clipboard.writeText(link);
    return "copied";
  } catch {
    return "failed";
  }
}
