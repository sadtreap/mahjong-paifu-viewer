import type { Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { SeatView } from "../replay/types";
import styles from "./HandRow.module.css";
import { tileLabel } from "./labels";
import { keyed } from "./layout";
import { MeldTiles } from "./MeldTiles";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";

export interface HandRowProps {
  seat: Seat;
  view: SeatView;
  name: string;
  /** Draw the concealed tiles face up. */
  revealed: boolean;
}

/** Concealed tiles, the drawn tile set apart, and the melds at the right end (first call rightmost). */
export function HandRow({ seat, view, name, revealed }: HandRowProps) {
  const { m } = useI18n();
  return (
    <div className={styles.row}>
      <TileGroup className={styles.concealed} label={m.board.hand(name)}>
        {keyed(view.hand).map(({ key, item }) => (
          <TileImage key={key} tile={item} faceDown={!revealed} />
        ))}
        {view.drawn !== null && (
          <span className={styles.drawn}>
            <TileImage
              tile={view.drawn}
              faceDown={!revealed}
              label={revealed ? m.board.drawn(tileLabel(m, view.drawn)) : m.tiles.back}
            />
          </span>
        )}
      </TileGroup>
      {view.melds.length > 0 && (
        <TileGroup className={styles.melds} label={m.board.melds(name)}>
          {keyed(view.melds).map(({ key, item }) => (
            <MeldTiles key={key} meld={item} owner={seat} />
          ))}
        </TileGroup>
      )}
    </div>
  );
}
