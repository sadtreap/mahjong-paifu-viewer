import { type CSSProperties, useEffect, useRef } from "react";
import type { Tile } from "../../core/tile";
import { cx } from "../cx";
import { TileImage } from "../TileImage";
import type { Side } from "../viewer/types";
import styles from "./FlightLayer.module.css";
import layers from "./layers.module.css";
import type { FlightOffset } from "./motion";

/** A flight ends by this time even if no animationend arrives (reduced motion, hidden tab). */
export const FLIGHT_FALLBACK_MS = 700;

export interface FlightLayerProps {
  side: Side;
  tile: Tile;
  riichi: boolean;
  /** The pond slot the tile lands on (geometry.ts pondSlot): its centre and the tile width. */
  slot: { x: number; y: number; tile: number };
  /** Where the flight starts (motion.ts flightOffset). */
  from: FlightOffset;
  /** The proxy landed: show the real pond tile and unmount this layer. */
  onDone(): void;
}

/**
 * A discard in flight: a proxy tile in a trailing layer painted last in the plane (animating the
 * real tile in place made everything painted after it one big overlap layer). It never takes hits
 * and is hidden from screen readers; the real pond tile underneath is the target.
 */
export function FlightLayer({ side, tile, riichi, slot, from, onDone }: FlightLayerProps) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const ends = useRef(0);
  useEffect(() => {
    const timer = window.setTimeout(() => doneRef.current(), FLIGHT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const style = {
    "--x": slot.x.toFixed(3),
    "--y": slot.y.toFixed(3),
    "--slot": slot.tile.toFixed(4),
    "--fx": from.fx.toFixed(3),
    "--fy": from.fy.toFixed(3),
    "--fs": from.fs.toFixed(3),
    "--fd": from.drop.toFixed(3),
  } as CSSProperties;
  return (
    <div
      className={cx(layers.layer, layers[side], layers.fx, styles.flight)}
      aria-hidden="true"
      onAnimationEnd={() => {
        ends.current += 1;
        if (ends.current >= (riichi ? 2 : 1)) {
          doneRef.current();
        }
      }}
    >
      <div className={styles.fly} style={style}>
        <TileImage
          tile={tile}
          sideways={riichi}
          highlighted
          className={riichi ? styles.turning : undefined}
        />
      </div>
    </div>
  );
}
