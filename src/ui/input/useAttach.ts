import { type RefObject, useEffect, useRef } from "react";

/**
 * Attaches native listeners to the elements behind some refs and keeps them attached as the
 * elements come and go: after each render it compares the elements (a cheap check) and reattaches
 * only when one changed. `attach` returns its cleanup; it should read changing values through
 * refs, as it is not called again for new props.
 */
export function useAttach(
  refs: readonly RefObject<HTMLElement | null>[],
  attach: (elements: readonly HTMLElement[]) => () => void,
): void {
  const attachRef = useRef(attach);
  const bound = useRef<readonly (HTMLElement | null)[] | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    attachRef.current = attach;
    const elements = refs.map((ref) => ref.current);
    const previous = bound.current;
    if (
      previous !== null &&
      previous.length === elements.length &&
      elements.every((element, index) => element === previous[index])
    ) {
      return;
    }
    cleanup.current?.();
    bound.current = elements;
    const live = elements.filter((element): element is HTMLElement => element !== null);
    cleanup.current = live.length > 0 ? attachRef.current(live) : null;
  });

  useEffect(
    () => () => {
      cleanup.current?.();
      cleanup.current = null;
      bound.current = null;
    },
    [],
  );
}
