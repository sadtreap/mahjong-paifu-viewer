import { useMediaQuery } from "../useMediaQuery";

/** A device whose main pointer is a finger, such as a phone or a tablet. */
const TOUCH_FIRST = "(hover: none) and (pointer: coarse)";

/** True on a device whose main pointer is a finger (no hover, a coarse pointer), kept up to date. */
export function useTouchFirst(): boolean {
  return useMediaQuery(TOUCH_FIRST);
}
