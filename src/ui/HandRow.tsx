import type { Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { SeatView } from "../replay/types";
import styles from "./HandRow.module.css";
import { tileLabel } from "./labels";
import { keyed } from "./layout";
import { MeldTiles } from "./MeldTiles";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";
import { KitaTiles } from "./table/KitaTiles";

export interface HandRowProps {
  seat: Seat;
  view: SeatView;
  name: string;
  /** Draw the concealed tiles face up. */
  revealed: boolean;
}

/**
 * A seat's row on the table: the concealed tiles, the drawn tile set apart, the kita group
 * (three-player North tiles) and the melds at the right end (first call rightmost). Hidden tiles
 * are counted in the group's name, so assistive technology does not read each back.
 */
export function HandRow({ seat, view, name, revealed }: HandRowProps) {
  const { m } = useI18n();
  const concealed = view.hand.length + (view.drawn === null ? 0 : 1);
  return (
    <div className={styles.row}>
      <TileGroup
        className={styles.concealed}
        label={revealed ? m.board.hand(name) : m.table.wallHand(name, concealed)}
      >
        {keyed(view.hand).map(({ key, item }) => (
          <TileImage key={key} tile={item} faceDown={!revealed} label={revealed ? undefined : ""} />
        ))}
        {view.drawn !== null && (
          <span className={styles.drawn}>
            <TileImage
              tile={view.drawn}
              faceDown={!revealed}
              label={revealed ? m.board.drawn(tileLabel(m, view.drawn)) : ""}
            />
          </span>
        )}
      </TileGroup>
      {view.kita.length > 0 && <KitaTiles tiles={view.kita} name={name} />}
      {view.melds.length > 0 && (
        <TileGroup className={styles.melds} label={m.board.melds(name)}>
          {keyed(view.melds).map(({ key, item }) => (
            <MeldTiles key={key} meld={item} owner={seat} low />
          ))}
        </TileGroup>
      )}
    </div>
  );
}
