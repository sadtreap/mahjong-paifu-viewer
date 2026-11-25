import type { ReactNode } from "react";

export interface TileGroupProps {
  /** Accessible name of the set, e.g. "B's hand". */
  label: string;
  className?: string;
  children: ReactNode;
}

/** A labelled set of tile images (a hand, a meld, a pond) that screen readers announce as one group. */
export function TileGroup({ label, className, children }: TileGroupProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: tile images are not form controls, so <fieldset> does not fit
    <div role="group" aria-label={label} className={className}>
      {children}
    </div>
  );
}
