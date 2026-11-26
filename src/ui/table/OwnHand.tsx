import { type CSSProperties, memo } from "react";
import type { Tile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { cx } from "../cx";
import { tileLabel } from "../labels";
import { keyed, ownRowUnits } from "../layout";
import { MeldTiles } from "../MeldTiles";
import { TileGroup } from "../TileGroup";
import { TileImage } from "../TileImage";
import { TILE_FRONT_URL } from "../tileAssets";
import type { OwnHandProps } from "../viewer/types";
import { KitaTiles } from "./KitaTiles";
import styles from "./OwnHand.module.css";

/** Standing tiles darken a little toward the felt. */
const STANDING_STYLE: CSSProperties = {
  backgroundImage: `linear-gradient(transparent, rgb(0 0 0 / 0.07)), url("${TILE_FRONT_URL}")`,
};

/**
 * Which tile the next discard removes: the drawn tile for tsumogiri, else the first concealed
 * tile equal to it (red fives count as their own tile). -1 = the drawn tile, null = none.
 */
export function nextIndex(hand: readonly Tile[], drawn: Tile | null, next: OwnHandProps["next"]) {
  if (next === null) {
    return null;
  }
  if (next.drawn) {
    return drawn === null ? null : -1;
  }
  const index = hand.indexOf(next.tile);
  if (index >= 0) {
    return index;
  }
  return drawn === next.tile ? -1 : null;
}

function nextLabel(m: Messages, label: string, isNext: boolean): string {
  return isNext ? `${label} ${m.table.nextDiscard}` : label;
}

/**
 * The point of view's hand, flat under the table at the frame's bottom: the concealed tiles stand
 * (lid above the face), then the drawn tile after a gap, the kita group and the melds (first call
 * rightmost), which keep the lying thickness. The drawn tile's slot stays (empty) between turns,
 * so the centred row does not slide on every draw and discard. The next-discard marker lifts and
 * outlines the tile the next discard removes.
 */
export const OwnHand = memo(function OwnHand({ seat, view, name, next }: OwnHandProps) {
  const { m } = useI18n();
  const marked = nextIndex(view.hand, view.drawn, next);
  return (
    <div
      className={styles.own}
      style={{ "--units": String(Math.max(1, ownRowUnits(view, seat))) } as CSSProperties}
    >
      <TileGroup className={styles.concealed} label={m.board.hand(name)}>
        {keyed(view.hand).map(({ key, index, item }) => (
          <TileImage
            key={key}
            tile={item}
            className={cx(styles.standing, marked === index && styles.next)}
            style={STANDING_STYLE}
            label={nextLabel(m, tileLabel(m, item), marked === index)}
          />
        ))}
        {view.drawn !== null ? (
          <span className={styles.drawn}>
            <TileImage
              tile={view.drawn}
              className={cx(styles.standing, marked === -1 && styles.next)}
              style={STANDING_STYLE}
              label={nextLabel(m, m.board.drawn(tileLabel(m, view.drawn)), marked === -1)}
            />
          </span>
        ) : (
          <span className={cx(styles.drawn, styles.slot)} aria-hidden="true" data-drawn-slot="" />
        )}
      </TileGroup>
      {view.kita.length > 0 && <KitaTiles tiles={view.kita} name={name} />}
      {view.melds.length > 0 && (
        <TileGroup className={styles.melds} label={m.board.melds(name)}>
          {keyed(view.melds).map(({ key, item }) => (
            <MeldTiles key={key} meld={item} owner={seat} />
          ))}
        </TileGroup>
      )}
    </div>
  );
});
