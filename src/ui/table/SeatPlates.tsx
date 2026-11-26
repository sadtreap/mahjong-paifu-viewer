import { type CSSProperties, memo } from "react";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { cx } from "../cx";
import { formatPoints, tileLabel } from "../labels";
import { TileImage } from "../TileImage";
import type { PlateAid, PlateInfo, SeatPlatesProps } from "../viewer/types";
import { PLATE_ANCHORS, PLATE_MAX_WIDTH } from "./geometry";
import styles from "./SeatPlates.module.css";

/** Wait tiles shown in a plate before "+n". */
export const PLATE_WAIT_TILES = 3;

/** The first character of a name (a whole code point), for the monogram disc. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "";
}

function AidRow({ aid, m }: { aid: PlateAid | null; m: Messages }) {
  if (aid === null) {
    return null;
  }
  return (
    <span
      className={cx(
        styles.x,
        aid.kind === "waits" && styles.xw,
        aid.kind === "waits" && aid.furiten && styles.xfu,
      )}
    >
      {aid.kind === "shanten" && (
        <span className={cx(styles.sh, aid.value === 0 && styles.tenpai)}>
          {aid.value < 0
            ? m.table.completeHand
            : aid.value === 0
              ? m.table.tenpai
              : m.table.shanten(aid.value)}
        </span>
      )}
      {aid.kind === "waits" && (
        <>
          <span className={styles.lbl} aria-hidden="true">
            {m.table.waitsShort}
            <span className={styles.lblSep}> ·</span>
          </span>
          <span className={styles.wt} aria-hidden="true">
            {aid.tiles.slice(0, PLATE_WAIT_TILES).map((tile, i) => (
              <TileImage
                key={tile}
                tile={tile}
                label=""
                className={cx(styles.wtile, i >= 1 && styles.w2)}
              />
            ))}
          </span>
          {/* "+n" for each number of tiles shown: 3 on larger screens, 2 or 1 on phones. */}
          {[3, 2, 1].map((shown) =>
            aid.tiles.length > shown ? (
              <span
                key={shown}
                className={cx(styles.more, styles[`more${shown}`])}
                aria-hidden="true"
              >
                +{aid.tiles.length - shown}
              </span>
            ) : null,
          )}
          {aid.furiten ? (
            <span className={styles.fu} aria-hidden="true">
              {m.table.furiten}
            </span>
          ) : (
            <span className={styles.left} aria-hidden="true">
              {/* No leading "·": wrapped to a line of its own, a count must not start with it. */}
              <span className={styles.leftLong}>{m.table.left(aid.left)}</span>
              <span className={styles.leftShort}>{aid.left}</span>
            </span>
          )}
          <span className="sr-only">
            {m.table.waitsSr(
              aid.tiles.map((tile) => tileLabel(m, tile)),
              aid.left,
              aid.furiten,
            )}
          </span>
        </>
      )}
    </span>
  );
}

function Plate({ plate, active, pov }: { plate: PlateInfo; active: boolean; pov: boolean }) {
  const { m, locale } = useI18n();
  const [x, y] = PLATE_ANCHORS[plate.side];
  // Opponents' kita is shown as text (the foreshortened pill on the table is hard to read).
  const kita = pov ? 0 : plate.kita;
  const hasAid = plate.aid !== null || kita > 0;
  return (
    <div
      className={cx(
        styles.plate,
        active && styles.active,
        hasAid && styles.hasAid,
        pov && styles.pov,
      )}
      data-seat={plate.seat}
      data-plate-side={plate.side}
      style={
        {
          "--X": String(x),
          "--Y": String(y),
          "--W": String(PLATE_MAX_WIDTH[plate.side]),
          "--seatc": `var(--seatc${plate.seat})`,
        } as CSSProperties
      }
    >
      <span className={styles.av} aria-hidden="true">
        <span className={styles.ini}>{initialOf(plate.name)}</span>
        <span className={cx(styles.w, plate.dealer && styles.dealer)}>
          {m.board.windsShort[plate.wind]}
        </span>
      </span>
      <span className={styles.n}>{plate.name}</span>
      <span className={styles.p}>
        {formatPoints(locale, plate.score)}
        {plate.riichi && <span className={styles.stick} aria-hidden="true" />}
      </span>
      <span className="sr-only">{m.round.winds[plate.wind]}</span>
      {plate.dealer && <span className="sr-only">{m.board.dealer}</span>}
      {plate.riichi && <span className="sr-only">{m.board.riichi}</span>}
      <AidRow aid={plate.aid} m={m} />
      {kita > 0 && (
        <span className={cx(styles.kita, plate.aid === null && styles.kitaSep)}>
          <span className={styles.kitaLong}>{m.table.kitaPlate(kita)}</span>
          <span className={styles.kitaShort} aria-hidden="true">
            {m.table.kitaPlateShort(kita)}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * Player plates at the projected plate anchors (flat DOM above the plane): a monogram disc in the
 * seat colour with the wind badge, name, score, and an aid row (waits, tenpai, furiten, shanten;
 * opponents' kita). Display only: a click on a plate steps like the felt (the point of view
 * changes in the Players list, with 1-4 / V, or from the toolbar's seat menu). On phones the plate
 * is a compact chip: the seat-colour disc with the wind badge, the aid and a short kita count;
 * the name and the score (also on the console's edge) are screen-reader text there.
 */
export const SeatPlates = memo(function SeatPlates({ plates, active, pov }: SeatPlatesProps) {
  return (
    <div className={styles.plates}>
      {plates.map((plate) => (
        <Plate
          key={plate.seat}
          plate={plate}
          active={active === plate.seat}
          pov={pov === plate.seat}
        />
      ))}
    </div>
  );
});
