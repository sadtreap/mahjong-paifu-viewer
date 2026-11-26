/**
 * Real game records kept outside the repository for the corpus tests (see CONTRIBUTING.md; they
 * are never committed). Each environment variable names one or more folders, separated by the
 * platform's path delimiter (":" on Linux and macOS, ";" on Windows); the tests that read a
 * variable are skipped when it is unset or names no file.
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, delimiter, join } from "node:path";

/** Tenhou mjlog XML files of any games, four- or three-player. */
export const MJLOG_CORPUS = "MJLOG_CORPUS_DIR";
/** Tenhou mjlog XML files of three-player games. */
export const SANMA_MJLOG_CORPUS = "SANMA_MJLOG_CORPUS_DIR";
/** Tenhou's own tenhou.net/6 JSON exports (tenhou.net/5/mjlog2json.cgi) of three-player games. */
export const SANMA_TENHOU_JSON_CORPUS = "TENHOU_JSON_SANMA_CORPUS_DIR";

/**
 * The files with this extension in the folders `variable` names, as [label, path] pairs sorted by
 * name within each folder. The label is the file name, after the folder name when the variable
 * names more than one folder.
 */
export function corpusFiles(
  variable: string,
  extension: string,
): Array<[label: string, path: string]> {
  const folders = (process.env[variable] ?? "")
    .split(delimiter)
    .filter((folder) => folder !== "" && existsSync(folder));
  return folders.flatMap((folder) =>
    readdirSync(folder)
      .filter((name) => name.endsWith(extension))
      .sort()
      .map((name): [string, string] => [
        folders.length > 1 ? `${basename(folder)}/${name}` : name,
        join(folder, name),
      ]),
  );
}
