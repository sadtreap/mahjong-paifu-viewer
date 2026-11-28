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
  /** The pond's seat: each tile then carries `data-d="seat:index"` (Alt+click on a discard). */
  seat?: Seat;
  /** Index of the discard that slides in on this step (the one just made), or -1. */
  landingIndex?: number;
  /** Class for the landing discard (see landingIndex). */
  landingClassName?: string;
}

/**
 * Discards in rows of six, the last row taking every discard after the first rows (layout.ts
 * discardRows): the riichi tile sideways, tsumogiri dimmed, called tiles faded, the last discard
 * outlined.
 */
export function Pond({
  discards,
  name,
  lastIndex,
  seat,
  landingIndex = -1,
  landingClassName,
}: PondProps) {
  const { m } = useI18n();
  return (
    <TileGroup className={styles.pond} label={m.board.discards(name)}>
      {discardRows(discards).map((row) => (
        <div key={row[0]?.key} className={styles.row}>
          {row.map(({ key, index, item }) => (
            <TileImage
              key={key}
              tile={item.tile}
              sideways={item.riichi}
              dimmed={item.tsumogiri}
              called={item.called}
              highlighted={index === lastIndex}
              label={discardLabel(m, item, index === lastIndex)}
              discardRef={seat === undefined ? undefined : `${seat}:${index}`}
              className={cx(index === landingIndex && landingClassName)}
            />
          ))}
        </div>
      ))}
    </TileGroup>
  );
}
