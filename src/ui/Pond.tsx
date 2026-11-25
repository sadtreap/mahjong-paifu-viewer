import { useI18n } from "../i18n/context";
import type { DiscardView } from "../replay/types";
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
}

/** Discards in rows of six: riichi tile sideways, tsumogiri dimmed, called tiles faded. */
export function Pond({ discards, name, lastIndex }: PondProps) {
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
            />
          ))}
        </div>
      ))}
    </TileGroup>
  );
}
