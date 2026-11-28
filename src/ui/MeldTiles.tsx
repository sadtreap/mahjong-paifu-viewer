import type { Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { MeldView } from "../replay/types";
import { cx } from "./cx";
import { meldLabel } from "./labels";
import { keyed, meldSlots } from "./layout";
import styles from "./MeldTiles.module.css";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";

export interface MeldTilesProps {
  meld: MeldView;
  owner: Seat;
  /**
   * Draw a kakan's two stacked tiles smaller, so the stack is as tall as an upright tile (the
   * table's hand rows, which have a pond right above them).
   */
  low?: boolean;
}

/** A called set; the called tile lies sideways and a kakan's added tile is stacked on it. */
export function MeldTiles({ meld, owner, low = false }: MeldTilesProps) {
  const { m } = useI18n();
  return (
    <TileGroup className={cx(styles.meld, low && styles.low)} label={meldLabel(m, meld)}>
      {keyed(meldSlots(meld, owner)).map(({ key, item: slot }) =>
        slot.added === undefined ? (
          <TileImage key={key} tile={slot.tile} sideways={slot.sideways} faceDown={slot.faceDown} />
        ) : (
          <span key={key} className={styles.stack}>
            <TileImage tile={slot.added} sideways />
            <TileImage tile={slot.tile} sideways />
          </span>
        ),
      )}
    </TileGroup>
  );
}
