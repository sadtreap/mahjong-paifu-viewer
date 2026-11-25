import type { CSSProperties } from "react";
import type { Tile } from "../core/tile";
import { useI18n } from "../i18n/context";
import { cx } from "./cx";
import { tileLabel } from "./labels";
import styles from "./TileImage.module.css";
import { TILE_BACK_URL, TILE_FRONT_URL, tileFaceName, tileImageUrl } from "./tileAssets";

/** Faces are transparent symbols, so the tile body is painted as the image background. */
const FRONT_STYLE: CSSProperties = { backgroundImage: `url("${TILE_FRONT_URL}")` };

export interface TileImageProps {
  tile: Tile;
  /** Draw the back instead of the face ("?" tiles always show the back). */
  faceDown?: boolean;
  /** Lie the tile on its side (riichi declarations, called tiles). */
  sideways?: boolean;
  /** Tsumogiri discard. */
  dimmed?: boolean;
  /** Discard taken by another player's call. */
  called?: boolean;
  highlighted?: boolean;
  /** Alt text; defaults to the localized tile name. */
  label?: string;
}

/**
 * One tile, sized by the inherited `--tile-w` custom property (height is 4/3 of the width).
 * Sideways tiles take a box with the width and height swapped.
 */
export function TileImage({
  tile,
  faceDown = false,
  sideways = false,
  dimmed = false,
  called = false,
  highlighted = false,
  label,
}: TileImageProps) {
  const { m } = useI18n();
  const face = faceDown ? null : tileFaceName(tile);
  const alt = label ?? (faceDown ? m.tiles.back : tileLabel(m, tile));
  const image = (
    <img
      className={cx(
        styles.tile,
        dimmed && styles.dimmed,
        called && styles.called,
        highlighted && styles.highlighted,
      )}
      src={face === null ? TILE_BACK_URL : tileImageUrl(face)}
      style={face === null ? undefined : FRONT_STYLE}
      alt={alt}
      draggable={false}
    />
  );
  return sideways ? <span className={styles.sideways}>{image}</span> : image;
}
