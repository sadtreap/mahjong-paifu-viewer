import type { Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { MeldView } from "../replay/types";
import { meldLabel } from "./labels";
import { keyed, meldSlots } from "./layout";
import styles from "./MeldTiles.module.css";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";

export interface MeldTilesProps {
  meld: MeldView;
  owner: Seat;
  /**
   * The column of the meld's first tile in its hand row, for the 3D table's paint order (TileImage
   * depth): the slots take the columns after it, and a kakan's added tile lies one row farther than
   * the tile it is stacked on. Omitted: plain document order.
   */
  column?: number;
}

/** A called set; the called tile lies sideways and a kakan's added tile is stacked on it. */
export function MeldTiles({ meld, owner, column }: MeldTilesProps) {
  const { m } = useI18n();
  const depth = (index: number, row = 0) =>
    column === undefined ? undefined : ([column + index, row] as const);
  return (
    <TileGroup className={styles.meld} label={meldLabel(m, meld)}>
      {keyed(meldSlots(meld, owner)).map(({ key, index, item: slot }) =>
        slot.added === undefined ? (
          <TileImage
            key={key}
            tile={slot.tile}
            sideways={slot.sideways}
            faceDown={slot.faceDown}
            depth={depth(index)}
          />
        ) : (
          <span key={key} className={styles.stack}>
            <TileImage tile={slot.added} sideways depth={depth(index, -1)} />
            <TileImage tile={slot.tile} sideways depth={depth(index)} />
          </span>
        ),
      )}
    </TileGroup>
  );
}

/** Columns kept per meld in a hand row's paint order: a meld has at most four slots. */
export const MELD_COLUMNS = 5;
