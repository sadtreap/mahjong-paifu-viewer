const PATHS = {
  first: "M5 4h2v16H5zM19 4v16L8 12z",
  prev: "M17 4v16L6 12z",
  next: "M7 4v16l11-8z",
  last: "M17 4h2v16h-2zM5 4v16l11-8z",
  prevRound: "M12 4v16L2 12zM22 4v16l-10-8z",
  nextRound: "M2 4v16l10-8zM12 4v16l10-8z",
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative icon; the button that holds it carries the accessible label. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}
