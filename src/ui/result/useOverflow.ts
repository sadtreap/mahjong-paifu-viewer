import { type RefCallback, useEffect, useLayoutEffect, useState } from "react";

/** Whether a box scrolls, and whether some of its content still lies below what it shows. */
export interface Overflow {
  scrolls: boolean;
  more: boolean;
}

/**
 * Whether a box's content is taller than the box, so that it scrolls, and whether it is not yet
 * scrolled to its end: returns the ref to put on the box and the answer. Measured after every
 * render (the content may have changed), whenever the box changes size and when it scrolls. Both
 * false while the box is not rendered.
 */
export function useOverflow<T extends HTMLElement>(): [RefCallback<T>, Overflow] {
  const [box, setBox] = useState<T | null>(null);
  const [scrolls, setScrolls] = useState(false);
  const [more, setMore] = useState(false);
  const measure = (el: T | null) => {
    const over = el !== null && el.scrollHeight > el.clientHeight;
    setScrolls(over);
    // A pixel's slack: zoom can leave the end a fraction of a pixel short.
    setMore(over && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  };
  useLayoutEffect(() => {
    measure(box);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure only sets state
  useEffect(() => {
    if (box === null) {
      return;
    }
    const update = () => measure(box);
    box.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(box);
    return () => {
      box.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [box]);
  return [setBox, { scrolls, more }];
}
