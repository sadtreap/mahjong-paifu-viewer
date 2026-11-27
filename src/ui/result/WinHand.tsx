import type { WinEvent } from "../../core/model";
import type { KnownTile, Tile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import type { MeldView } from "../../replay/types";
import { tileLabel } from "../labels";
import { keyed, splitWinningHand } from "../layout";
import { MeldTiles } from "../MeldTiles";
import { TileGroup } from "../TileGroup";
import { TileImage } from "../TileImage";
import styles from "./WinHand.module.css";

/** A short label and the indicator tiles after it, as one group named in full. */
function Indicators({
  label,
  name,
  tiles,
}: {
  label: string;
  name: string;
  tiles: readonly KnownTile[];
}) {
  return (
    <TileGroup className={styles.indicators} label={name}>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      {keyed(tiles).map(({ key, item }) => (
        <TileImage key={key} tile={item} />
      ))}
    </TileGroup>
  );
}

export interface WinHandProps {
  win: WinEvent;
  /** The winner's calls. */
  melds: readonly MeldView[];
  /** The winner's kita (three-player North tiles set aside), shown after the hand. */
  kita: readonly Tile[];
  /** The round's dora indicators. */
  doraIndicators: readonly KnownTile[];
}

/**
 * The hand a win was made with: the concealed tiles with the winning tile set apart, then after a
 * wider gap the kita and the calls (only the winning tile when the log has no hand), and under it
 * the dora indicators and, for a riichi win, the ura dora indicators on one line.
 */
export function WinHand({ win, melds, kita, doraIndicators }: WinHandProps) {
  const { m } = useI18n();
  const hand = win.hand ? splitWinningHand(win.hand, win.tile) : null;
  const ura = win.uraIndicators ?? [];
  return (
    <div className={styles.root}>
      {hand && (
        <TileGroup className={styles.hand} label={m.result.winningHand}>
          <span className={styles.concealed}>
            {keyed(hand.rest).map(({ key, item }) => (
              <TileImage key={key} tile={item} />
            ))}
            {hand.winning !== null && (
              <span className={styles.winning}>
                <TileImage
                  tile={hand.winning}
                  label={`${m.result.winningTile}: ${tileLabel(m, hand.winning)}`}
                />
              </span>
            )}
          </span>
          {kita.length > 0 && (
            <TileGroup className={styles.set} label={m.result.kita(kita.length)}>
              {keyed(kita).map(({ key, item }) => (
                <TileImage key={key} tile={item} label="" />
              ))}
            </TileGroup>
          )}
          {keyed(melds).map(({ key, item }) => (
            <MeldTiles key={key} meld={item} owner={win.seat} />
          ))}
        </TileGroup>
      )}
      {!hand && win.tile !== undefined && (
        <TileGroup className={styles.hand} label={m.result.winningTile}>
          <TileImage tile={win.tile} />
        </TileGroup>
      )}
      {(doraIndicators.length > 0 || ura.length > 0) && (
        <div className={styles.indicatorLine}>
          {doraIndicators.length > 0 && (
            <Indicators
              label={m.result.dora}
              name={m.result.doraIndicators}
              tiles={doraIndicators}
            />
          )}
          {ura.length > 0 && (
            <Indicators label={m.result.ura} name={m.result.uraIndicators} tiles={ura} />
          )}
        </div>
      )}
    </div>
  );
}
