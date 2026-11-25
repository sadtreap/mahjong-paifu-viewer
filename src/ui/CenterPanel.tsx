import type { KnownTile } from "../core/tile";
import { useI18n } from "../i18n/context";
import styles from "./CenterPanel.module.css";
import { doraSlots, keyed } from "./layout";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";

export interface CenterPanelProps {
  roundName: string;
  honba: number;
  riichiSticks: number;
  doraIndicators: KnownTile[];
  wallRemaining: number;
}

/** Middle of the table: round, honba and riichi sticks, dora indicators and tiles left. */
export function CenterPanel({
  roundName,
  honba,
  riichiSticks,
  doraIndicators,
  wallRemaining,
}: CenterPanelProps) {
  const { m } = useI18n();
  return (
    <div className={styles.center}>
      <div className={styles.roundName}>{roundName}</div>
      <div className={styles.counters}>
        <span className={styles.counter} title={m.board.honba}>
          <span className={styles.stick100} aria-hidden="true" />
          <span className="sr-only">{m.board.honba}</span>
          {honba}
        </span>
        <span className={styles.counter} title={m.board.riichiSticks}>
          <span className={styles.stick1000} aria-hidden="true" />
          <span className="sr-only">{m.board.riichiSticks}</span>
          {riichiSticks}
        </span>
      </div>
      <TileGroup className={styles.dora} label={m.board.dora}>
        {keyed(doraSlots(doraIndicators)).map(({ key, item }) => (
          <TileImage key={key} tile={item ?? "?"} faceDown={item === null} />
        ))}
      </TileGroup>
      <div className={styles.wall}>
        <span className={styles.wallLong}>{m.board.wall(wallRemaining)}</span>
        {/* Shown instead of the long text on small boards, which keep that for screen readers. */}
        <span className={styles.wallShort} aria-hidden="true">
          {m.board.wallShort(wallRemaining)}
        </span>
      </div>
    </div>
  );
}
