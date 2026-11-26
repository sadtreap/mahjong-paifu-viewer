import { type CSSProperties, useEffect, useRef } from "react";
import type { Tile } from "../../core/tile";
import { cx } from "../cx";
import { TileImage } from "../TileImage";
import type { Side } from "../viewer/types";
import styles from "./FlightLayer.module.css";
import layers from "./layers.module.css";

/** A flight ends by this time even if no animationend arrives (reduced motion, hidden tab). */
export const FLIGHT_FALLBACK_MS = 700;

export interface FlightLayerProps {
  side: Side;
  tile: Tile;
  riichi: boolean;
  /** Pond slot centre in the seat layer's units. */
  x: number;
  y: number;
  /** Start offset from the slot and start scale (motion.ts flightOffset). */
  fx: number;
  fy: number;
  fs: number;
  /** The proxy landed: show the real pond tile and unmount this layer. */
  onDone(): void;
}

/**
 * A discard in flight: a proxy tile in a trailing layer painted last in the plane (animating the
 * real tile in place made everything painted after it one big overlap layer). It never takes hits
 * and is hidden from screen readers; the real pond tile underneath is the target.
 */
export function FlightLayer({ side, tile, riichi, x, y, fx, fy, fs, onDone }: FlightLayerProps) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const ends = useRef(0);
  useEffect(() => {
    const timer = window.setTimeout(() => doneRef.current(), FLIGHT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const style = {
    "--x": x.toFixed(3),
    "--y": y.toFixed(3),
    "--fx": fx.toFixed(3),
    "--fy": fy.toFixed(3),
    "--fs": fs.toFixed(3),
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
