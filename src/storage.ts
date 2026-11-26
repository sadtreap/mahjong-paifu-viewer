/**
 * localStorage helpers. Every GitHub Pages project site under the same user shares one origin,
 * and so one localStorage, so all keys are namespaced with the app name.
 */
const PREFIX = "mahjong-paifu-viewer:";

export function storageKey(name: string): string {
  return `${PREFIX}${name}`;
}

/** Returns null when the key is missing or storage is unavailable (private mode, disabled cookies). */
export function readStorage(name: string): string | null {
  try {
    return localStorage.getItem(storageKey(name));
  } catch {
    return null;
  }
}

/** Best effort: when storage is unavailable the value just isn't persisted. */
export function writeStorage(name: string, value: string): void {
  try {
    localStorage.setItem(storageKey(name), value);
  } catch {
    // Ignore: persistence is optional.
  }
}

/** Best effort: deletes a key (e.g. one a newer format replaced); unavailable storage is ignored. */
export function removeStorage(name: string): void {
  try {
    localStorage.removeItem(storageKey(name));
  } catch {
    // Ignore: there is nothing to delete.
  }
}
