import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import type { DiscardInfo, DiscardRef } from "../viewer/types";
import styles from "./PondTooltip.module.css";

/** The client rectangles read once when the dwell starts (never per step). */
export interface TipRects {
  stage: DOMRectReadOnly;
  /** The console in the middle of the table: the one place on the felt without tiles. */
  console: DOMRectReadOnly;
}

export interface PondTip {
  ref: DiscardRef;
  info: DiscardInfo;
  name: string;
  rects: TipRects;
}

/** Share of the console's box the tooltip may take (the console is a trapezoid on screen). */
const FILL = 0.9;
/** Below this console width the tooltip drops its last line (the "go there" hint). */
const COMPACT_BELOW = 200;
/**
 * What a tooltip too big for the console drops, one step at a time, until it fits: the hint line,
 * then the turn, then the head. The facts line (tsumogiri, riichi tile, called) always stays.
 */
const TIP_FIT_STEPS = 3;

export interface TipPlace {
  /** The tooltip's centre, in stage pixels. */
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
  /** A small console (phones with a mouse): smaller text, no hint line. */
  compact: boolean;
}

/**
 * Places the tooltip over the console, which every pond touches and which holds no tile: so it
 * never covers the hovered tile, its neighbours or any other seat's tiles (placed next to the
 * pond, toward the stage's edge, it landed on the hand rows there). Without a console box (no
 * layout), it takes the stage's centre.
 */
export function placePondTip(rects: TipRects): TipPlace {
  const { stage } = rects;
  const box = rects.console.width > 0 ? rects.console : stage;
  const compact = box.width < COMPACT_BELOW;
  return {
    x: box.left + box.width / 2 - stage.left,
    y: box.top + box.height / 2 - stage.top,
    maxWidth: Math.round(box.width * FILL),
    // A small console gets all of its height: the facts need the room more than the margin.
    maxHeight: Math.round(box.height * (compact ? 1 : FILL)),
    compact,
  };
}

/**
 * Facts about the dwelt-on discard: who, which discard and turn; tsumogiri or from hand, riichi
 * tile, after riichi, called; and how to go there (Alt+click or the pin on the timeline).
 * Information only: hidden from screen readers (the Moves list has the same facts) and never in
 * the pointer's way. When it does not fit the console (a small console, a long name), it drops the
 * hint, the turn and then the head after measuring itself, so the facts line is never cut off.
 */
export function PondTooltip({ tip }: { tip: PondTip | null }) {
  const { m } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  // How many fit steps this tip has taken (a new tip starts over).
  const [fit, setFit] = useState<{ tip: PondTip | null; dropped: number }>({
    tip: null,
    dropped: 0,
  });
  const dropped = fit.tip === tip ? fit.dropped : 0;
  useLayoutEffect(() => {
    const el = box.current;
    if (tip === null || el === null || dropped >= TIP_FIT_STEPS) {
      return;
    }
    if (el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5) {
      setFit({ tip, dropped: dropped + 1 });
    }
  });
  if (tip === null) {
    return null;
  }
  const { info } = tip;
  const facts = [
    info.tsumogiri ? m.ptip.tsumogiri : m.ptip.fromHand,
    ...(info.riichi ? [m.ptip.riichiTile] : []),
    ...(info.afterRiichi ? [m.ptip.afterRiichi] : []),
    ...(info.called ? [m.ptip.called] : []),
  ];
  const place = placePondTip(tip.rects);
  const n = tip.ref.index + 1;
  return (
    <div
      ref={box}
      className={cx(styles.ptip, place.compact && styles.compact)}
      aria-hidden="true"
      style={
        {
          left: `${place.x}px`,
          top: `${place.y}px`,
          maxWidth: `${place.maxWidth}px`,
          maxHeight: `${place.maxHeight}px`,
        } as CSSProperties
      }
    >
      {dropped < TIP_FIT_STEPS && (
        <span className={styles.head}>
          {dropped < 2 ? m.ptip.head(tip.name, n, info.turn) : m.ptip.headShort(tip.name, n)}
        </span>
      )}
      <span className={styles.facts}>{m.ptip.facts(facts)}</span>
      {dropped < 1 && <span className={styles.go}>{m.ptip.go}</span>}
    </div>
  );
}
