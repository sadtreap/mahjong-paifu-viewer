/**
 * Copies a deep link (useHistorySync's `link()`) to the clipboard. False when there is no
 * clipboard or it refuses (no secure context, permission denied).
 */
export async function copyLink(
  link: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!clipboard) {
    return false;
  }
  try {
    await clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}
