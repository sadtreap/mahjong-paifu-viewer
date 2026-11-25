/**
 * Something to load: a file the user picked, dropped or pasted, text, or a URL (the bundled samples
 * on this site, or a Tenhou log's data page on tenhou.net, which allows cross-origin downloads).
 */
export type LogSource =
  | { kind: "file"; file: File }
  | { kind: "text"; text: string }
  | { kind: "url"; url: string };

/** Picks the log from dropped or pasted data: the first file, otherwise the plain text. */
export function sourceFromDataTransfer(data: DataTransfer | null): LogSource | null {
  if (!data) {
    return null;
  }
  const file = data.files[0];
  if (file) {
    return { kind: "file", file };
  }
  const text = data.getData("text/plain") || data.getData("text/uri-list");
  return text.trim() === "" ? null : { kind: "text", text };
}

/** True when a drag carries something we can load (files or text). */
export function dragHasLog(data: DataTransfer | null): boolean {
  if (!data) {
    return false;
  }
  const types = Array.from(data.types);
  return types.includes("Files") || types.includes("text/plain") || types.includes("text/uri-list");
}
