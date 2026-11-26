import { type CSSProperties, memo } from "react";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { TILE_BACK_URL } from "../tileAssets";
import type { Side } from "../viewer/types";
import { wallFaceX } from "./geometry";
import styles from "./WallLayer.module.css";

export interface WallPartsProps {
  /** Side of the seat; the far ("top") wall must be rendered in the unrotated `.wtop` layer. */
  side: Exclude<Side, "bottom">;
  /** Concealed tiles, not counting the drawn one. */
  count: number;
  drawn: boolean;
  /** The seat's tile scale (fitScale of its hand row). */
  hs: number;
  /** The owner's name, for the group's label. */
  name: string;
  /** The round-end reveal: the wall fades out over the face-up hand, then unmounts. */
  leaving?: boolean;
}

function faceStyle(
  i: number,
  count: number,
  drawn: boolean,
  side: WallPartsProps["side"],
  hs: number,
) {
  return { "--xc": wallFaceX(i, count, drawn, side, hs).toFixed(4) } as CSSProperties;
}

/**
 * A hidden opponent hand as a standing wall (W3): 2D affine sprites in the seat layer, with a
 * contact shadow, the faces (one image per tile, each sheared toward the camera), the lids (the
 * footprint scaled about the eye) and, for side seats, the near tile's end cap.
 *
 * The faces take hits like any tile (a click steps); everything else ignores the pointer.
 */
export const WallParts = memo(function WallParts({
  side,
  count,
  drawn,
  hs,
  name,
  leaving = false,
}: WallPartsProps) {
  const { m } = useI18n();
  const faces = Array.from({ length: count }, (_, i) => i);
  const sideClass = side === "top" ? styles.top : side === "left" ? styles.left : styles.right;
  const leave = leaving && styles.leaving;
  const face = (i: number) => (
    <img
      key={i}
      className={styles.face}
      src={TILE_BACK_URL}
      alt={m.tiles.back}
      draggable={false}
      decoding="async"
      style={faceStyle(i, count, drawn, side, hs)}
    />
  );
  return (
    <>
      <div className={cx(styles.shadow, sideClass, leave)} aria-hidden="true" />
      {leaving ? (
        <div className={cx(styles.sprites, sideClass, leave)} aria-hidden="true">
          {faces.map(face)}
          {drawn && <span className={styles.drawn}>{face(count)}</span>}
        </div>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: tile images are not form controls, so <fieldset> does not fit
        <div
          className={cx(styles.sprites, sideClass)}
          role="group"
          aria-label={m.table.wallHand(name, count + (drawn ? 1 : 0))}
        >
          {faces.map(face)}
          {drawn && <span className={styles.drawn}>{face(count)}</span>}
        </div>
      )}
      <div className={cx(styles.lid, sideClass, leave)} aria-hidden="true">
        {faces.map((i) => (
          <span key={i} />
        ))}
        {drawn && (
          <span className={styles.drawn}>
            <span />
          </span>
        )}
      </div>
      {side !== "top" && <div className={cx(styles.cap, sideClass, leave)} aria-hidden="true" />}
    </>
  );
});
