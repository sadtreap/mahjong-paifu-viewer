export type NavAction =
  | "prevStep"
  | "nextStep"
  | "prevRound"
  | "nextRound"
  | "firstStep"
  | "lastStep";

/** Page Up and Page Down are left alone, so they still scroll the page to the results. */
const KEY_ACTIONS: Record<string, NavAction> = {
  ArrowLeft: "prevStep",
  ArrowRight: "nextStep",
  ArrowUp: "prevRound",
  ArrowDown: "nextRound",
  Home: "firstStep",
  End: "lastStep",
};

/** Replay shortcut for a key press, ignoring presses with Ctrl, Cmd or Alt held. */
export function keyAction(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
): NavAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  return KEY_ACTIONS[event.key] ?? null;
}
