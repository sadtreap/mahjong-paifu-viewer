import type { CSSProperties } from "react";
import { type Tile, tileKind } from "../core/tile";
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
  /** Extra class on the image (not on the sideways wrapper). */
  className?: string;
  /** Extra inline style on the image, merged after the tile body background. */
  style?: CSSProperties;
  /** A pond tile's `seat:index`, written as `data-d` for the pond tooltip and Alt+click. */
  discardRef?: string;
  /**
   * The tile's place among lying tiles that touch, as [column, row] in the seat's own layout. On
   * the 3D table it sets the paint order, so that a nearer tile is painted over a farther one and
   * no tile's drawn thickness covers a neighbour's face (see `.depth` in TileImage.module.css).
   * The group holding these tiles has to isolate.
   */
  depth?: readonly [column: number, row: number];
}

/**
 * One tile, sized by the inherited `--tile-w` custom property (height is 4/3 of the width).
 * Sideways tiles take a box with the width and height swapped.
 *
 * Face-up tiles carry `data-k` (the tile kind, 0-33, a red five counts as a five) for the same-tile
 * spotlight. Inside an element with `data-thick` (the 3D table) tiles get a drawn thickness toward
 * the camera, set per seat layer by `--dx` / `--dy`.
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
  style,
  discardRef,
  depth,
}: TileImageProps) {
  const { m } = useI18n();
  const face = faceDown ? null : tileFaceName(tile);
  const alt = label ?? (faceDown ? m.tiles.back : tileLabel(m, tile));
  const imageStyle =
    face === null ? style : style === undefined ? FRONT_STYLE : { ...FRONT_STYLE, ...style };
  // A sideways tile is ordered by its wrapper, which carries its box and its thickness.
  const depthStyle = depth === undefined ? undefined : depthProperties(depth);
  const image = (
    <img
      className={cx(
        styles.tile,
        face === null && styles.back,
        dimmed && styles.dimmed,
        called && styles.called,
        highlighted && styles.highlighted,
        !sideways && depthStyle !== undefined && styles.depth,
        className,
      )}
      src={face === null ? TILE_BACK_URL : tileImageUrl(face)}
      style={sideways || depthStyle === undefined ? imageStyle : { ...imageStyle, ...depthStyle }}
      alt={alt}
      draggable={false}
      decoding="async"
      data-k={face === null ? undefined : tileKind(tile)}
      data-d={discardRef}
    />
  );
  return sideways ? (
    <span
      className={cx(styles.sideways, depthStyle !== undefined && styles.depth)}
      style={depthStyle}
    >
      {image}
    </span>
  ) : (
    image
  );
}

/** The custom properties `.depth` reads (TileImage.module.css). */
function depthProperties([column, row]: readonly [number, number]): CSSProperties {
  return { "--zx": String(column), "--zy": String(row) } as CSSProperties;
}
