import type { Tile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import { TileGroup } from "../TileGroup";
import { TileImage } from "../TileImage";
import styles from "./KitaTiles.module.css";

export interface KitaTilesProps {
  /** The North tiles set aside, in order (at least one). */
  tiles: readonly Tile[];
  /** The owner's name, for the group's label. */
  name: string;
}

/**
 * A seat's kita (three-player North tiles set aside): one North tile and, for two or more, a ×n
 * pill over its corner, the one place the count is shown. The pill turns with `--kita-rot` (set
 * per seat layer) so it reads upright.
 */
export function KitaTiles({ tiles, name }: KitaTilesProps) {
  const { m } = useI18n();
  const first = tiles[0];
  if (first === undefined) {
    return null;
  }
  return (
    <TileGroup className={styles.kita} label={m.table.kita(name, tiles.length)}>
      <TileImage tile={first} />
      {tiles.length > 1 && (
        <span className={styles.count} aria-hidden="true">
          {m.table.kitaCount(tiles.length)}
        </span>
      )}
    </TileGroup>
  );
}
