import { memo } from "react";
import { useI18n } from "../../i18n/context";
import { doraSlots, keyed } from "../layout";
import { TileGroup } from "../TileGroup";
import { TileImage } from "../TileImage";
import type { HudProps } from "../viewer/types";
import styles from "./Hud.module.css";

/**
 * The heads-up display at the stage's top-left (the Viewer places it on .player, outside the
 * stage): dora indicators (face-down slots for the rest), honba and riichi deposits, and the rule
 * text. It ignores the pointer, so clicks and the wheel fall through to the stage.
 */
export const Hud = memo(function Hud({ doraIndicators, honba, riichiSticks, ruleLabel }: HudProps) {
  const { m } = useI18n();
  return (
    <div className={styles.hud}>
      <TileGroup className={styles.dora} label={m.board.dora}>
        {keyed(doraSlots(doraIndicators)).map(({ key, item }) => (
          <TileImage key={key} tile={item ?? "?"} faceDown={item === null} />
        ))}
      </TileGroup>
      <div className={styles.counts}>
        <span className={styles.count} title={m.board.honba}>
          <span className={styles.stick100} aria-hidden="true" />
          <span className="sr-only">{m.board.honba}</span>
          {m.table.stickCount(honba)}
        </span>
        <span className={styles.count} title={m.board.riichiSticks}>
          <span className={styles.stick1000} aria-hidden="true" />
          <span className="sr-only">{m.board.riichiSticks}</span>
          {m.table.stickCount(riichiSticks)}
        </span>
      </div>
      {ruleLabel !== "" && <div className={styles.rules}>{ruleLabel}</div>}
    </div>
  );
});
