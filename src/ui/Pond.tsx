import type { Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { DiscardView } from "../replay/types";
import { cx } from "./cx";
import { discardLabel } from "./labels";
import { discardRows } from "./layout";
import styles from "./Pond.module.css";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";

export interface PondProps {
  discards: DiscardView[];
  name: string;
  /** Index of the discard to highlight (the one just made), or -1. */
  lastIndex: number;
  /** Dim tsumogiri discards (a setting; on by default). */
  dimTsumogiri?: boolean;
  /** The pond's seat: each tile then carries `data-d="seat:index"` (pond tooltip, Alt+click). */
  seat?: Seat;
  /** Index of a discard drawn invisible while its flight proxy is in the air, or -1. */
  hiddenIndex?: number;
  /** Class for the invisible discard (see hiddenIndex). */
  hiddenClassName?: string;
}

/** Discards in rows of six: riichi tile sideways, tsumogiri dimmed, called tiles faded. */
export function Pond({
  discards,
  name,
  lastIndex,
  dimTsumogiri = true,
  seat,
  hiddenIndex = -1,
  hiddenClassName,
}: PondProps) {
  const { m } = useI18n();
  return (
    <TileGroup className={styles.pond} label={m.board.discards(name)}>
      {discardRows(discards).map((row, rowIndex) => (
        <div key={row[0]?.key} className={styles.row}>
          {row.map(({ key, index, item }, column) => (
            <TileImage
              key={key}
              depth={[column, rowIndex]}
              tile={item.tile}
              sideways={item.riichi}
              dimmed={dimTsumogiri && item.tsumogiri}
              called={item.called}
              highlighted={index === lastIndex}
              label={discardLabel(m, item, index === lastIndex)}
              discardRef={seat === undefined ? undefined : `${seat}:${index}`}
              className={cx(index === hiddenIndex && hiddenClassName)}
            />
          ))}
        </div>
      ))}
    </TileGroup>
  );
}
