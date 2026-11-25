import type { Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { MeldView } from "../replay/types";
import { meldLabel } from "./labels";
import { keyed, meldSlots } from "./layout";
import styles from "./MeldTiles.module.css";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";

/** A called set; the called tile lies sideways and a kakan's added tile is stacked on it. */
export function MeldTiles({ meld, owner }: { meld: MeldView; owner: Seat }) {
  const { m } = useI18n();
  return (
    <TileGroup className={styles.meld} label={meldLabel(m, meld)}>
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
