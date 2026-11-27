import { memo } from "react";
import { useI18n } from "../../i18n/context";
import { keyed } from "../layout";
import { TileGroup } from "../TileGroup";
import { TileImage } from "../TileImage";
import type { InfoChipProps } from "../viewer/types";
import styles from "./InfoChip.module.css";

/**
 * What the round has on the side: the revealed dora indicators and, when there are any, the honba
 * count and the riichi deposits ("1 honba · 2 deposits"; a narrow chip breaks the line before the
 * dot, never inside a count). Display only, with nothing to press.
 */
export const InfoChip = memo(function InfoChip({ doraIndicators, honba, deposits }: InfoChipProps) {
  const { m } = useI18n();
  const counts = [
    honba > 0 ? m.info.honba(honba) : null,
    deposits > 0 ? m.info.deposits(deposits) : null,
  ].filter((part) => part !== null);

  return (
    <div className={styles.chip} data-gesture="ignore">
      {/* The tile group below is named "Dora indicators"; this is its short label for the eye. */}
      <span className={styles.label} aria-hidden="true">
        {m.info.dora}
      </span>
      <TileGroup className={styles.tiles} label={m.board.dora}>
        {keyed(doraIndicators).map(({ key, item }) => (
          <TileImage key={key} tile={item} />
        ))}
      </TileGroup>
      {counts.length > 0 && (
        <p className={styles.counts}>
          {counts.map((part, index) => (
            <span key={part}>
              {index > 0 && " "}
              <span className={styles.part}>{index > 0 ? `· ${part}` : part}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
});
