import type { CSSProperties } from "react";
import type { Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { SeatView } from "../replay/types";
import { cx } from "./cx";
import styles from "./HandRow.module.css";
import { tileLabel } from "./labels";
import { keyed } from "./layout";
import { MELD_COLUMNS, MeldTiles } from "./MeldTiles";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";
import { KitaTiles } from "./table/KitaTiles";

export interface HandRowProps {
  seat: Seat;
  view: SeatView;
  name: string;
  /** Draw the concealed tiles face up. */
  revealed: boolean;
  /**
   * Leave an empty space as long as the concealed and drawn tiles instead of drawing them (the 3D
   * table draws a standing wall there).
   */
  spacer?: boolean;
  /**
   * Free felt after the spacer, in tile widths: a standing wall leans along the row, and the kita
   * or melds after it keep clear of its lean (geometry.ts oppRowLayout).
   */
  spacerGap?: number;
  /** Draw the kita group (three-player North tiles) between the concealed tiles and the melds. */
  showKita?: boolean;
  /** Extra class on the concealed group (the 3D table's reveal animation). */
  concealedClassName?: string;
}

/**
 * Concealed tiles, the drawn tile set apart, the kita group (optional) and the melds at the right
 * end (first call rightmost).
 */
export function HandRow({
  seat,
  view,
  name,
  revealed,
  spacer = false,
  spacerGap = 0,
  showKita = false,
  concealedClassName,
}: HandRowProps) {
  const { m } = useI18n();
  const length = view.hand.length + (view.drawn === null ? 0 : 1.4);
  // Paint order on the 3D table (TileImage depth): columns follow the row from left to right, so
  // the melds, drawn right to left (first call rightmost), count from the last one.
  const meldColumn = (index: number) =>
    view.hand.length + 2 + (view.melds.length - 1 - index) * MELD_COLUMNS;
  return (
    <div className={styles.row}>
      {spacer ? (
        <div
          className={styles.spacer}
          style={{ "--L": String(length), "--gap": spacerGap.toFixed(4) } as CSSProperties}
        />
      ) : (
        <TileGroup className={cx(styles.concealed, concealedClassName)} label={m.board.hand(name)}>
          {keyed(view.hand).map(({ key, index, item }) => (
            <TileImage key={key} tile={item} faceDown={!revealed} depth={[index, 0]} />
          ))}
          {view.drawn !== null && (
            <span className={styles.drawn}>
              <TileImage
                tile={view.drawn}
                faceDown={!revealed}
                label={revealed ? m.board.drawn(tileLabel(m, view.drawn)) : m.tiles.back}
                depth={[view.hand.length, 0]}
              />
            </span>
          )}
        </TileGroup>
      )}
      {showKita && view.kita.length > 0 && <KitaTiles tiles={view.kita} name={name} />}
      {view.melds.length > 0 && (
        <TileGroup className={styles.melds} label={m.board.melds(name)}>
          {keyed(view.melds).map(({ key, index, item }) => (
            <MeldTiles key={key} meld={item} owner={seat} column={meldColumn(index)} />
          ))}
        </TileGroup>
      )}
    </div>
  );
}
