import type { ReactNode } from "react";
import { type Tile, tileKind } from "../core/tile";
import { useI18n } from "../i18n/context";
import { cx } from "./cx";
import { tileLabel } from "./labels";
import styles from "./TileImage.module.css";
import { tileFaceName, tileImageUrl } from "./tileAssets";

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
  /** Alt text; defaults to the localized tile name. "" hides the tile from assistive technology. */
  label?: string;
  /** Extra class on the tile (not on the sideways wrapper). */
  className?: string;
  /** A pond tile's `seat:index`, written as `data-d` (Alt+click on a discard reads it). */
  discardRef?: string;
}

/**
 * One tile, sized by the inherited `--tile-w` custom property (height is 4/3 of the width): a flat
 * white body with a hairline, drawn in CSS, and the face artwork over it. A face-down tile is the
 * body alone, in the back's tone. Sideways tiles take a box with the width and height swapped.
 *
 * Face-up tiles carry `data-k` (the tile kind, 0-33, a red five counts as a five) for the same-tile
 * spotlight.
 */
export function TileImage({
  tile,
  faceDown = false,
  sideways = false,
  dimmed = false,
  called = false,
  highlighted = false,
  label,
  className,
  discardRef,
}: TileImageProps) {
  const { m } = useI18n();
  const face = faceDown ? null : tileFaceName(tile);
  const alt = label ?? (faceDown ? m.tiles.back : tileLabel(m, tile));
  const tileClass = cx(
    styles.tile,
    face === null && styles.back,
    dimmed && styles.dimmed,
    called && styles.called,
    highlighted && styles.highlighted,
    className,
  );
  let image: ReactNode;
  if (face !== null) {
    image = (
      <img
        className={tileClass}
        src={tileImageUrl(face)}
        alt={alt}
        draggable={false}
        decoding="async"
        data-k={tileKind(tile)}
        data-d={discardRef}
      />
    );
  } else if (alt === "") {
    // A back among others that their group already counts ("13 tiles face down").
    image = <span className={tileClass} aria-hidden="true" data-d={discardRef} />;
  } else {
    image = <span className={tileClass} role="img" aria-label={alt} data-d={discardRef} />;
  }
  return sideways ? <span className={styles.sideways}>{image}</span> : image;
}
