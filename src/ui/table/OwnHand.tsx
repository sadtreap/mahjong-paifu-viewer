import { type CSSProperties, memo } from "react";
import { useI18n } from "../../i18n/context";
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
 * The point of view's hand, flat under the table at the frame's bottom: the concealed tiles stand
 * (lid above the face), then the drawn tile after a gap, the kita group and the melds (first call
 * rightmost), which keep the lying thickness. The drawn tile's slot stays (empty) between turns,
 * so the centred row does not slide on every draw and discard.
 */
export const OwnHand = memo(function OwnHand({ seat, view, name }: OwnHandProps) {
  const { m } = useI18n();
  return (
    <div
      className={styles.own}
      style={{ "--units": String(Math.max(1, ownRowUnits(view, seat))) } as CSSProperties}
      data-own-hand=""
    >
      <TileGroup className={styles.concealed} label={m.board.hand(name)}>
        {keyed(view.hand).map(({ key, item }) => (
          <TileImage key={key} tile={item} className={styles.standing} style={STANDING_STYLE} />
        ))}
        {view.drawn !== null ? (
          <span className={styles.drawn}>
            <TileImage
              tile={view.drawn}
              className={styles.standing}
              style={STANDING_STYLE}
              label={m.board.drawn(tileLabel(m, view.drawn))}
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
            <MeldTiles key={key} meld={item} owner={seat} low />
          ))}
        </TileGroup>
      )}
    </div>
  );
});
