import type { Quad, WinEvent } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { yakuLabel, yakuValueLabel } from "../labels";
import { keyed } from "../layout";
import styles from "./YakuList.module.css";

/** Whether a win has anything for the yaku list: yaku the log names, or a liable player. */
export function hasYakuDetails(win: WinEvent): boolean {
  return (win.yaku?.length ?? 0) > 0 || win.pao !== undefined;
}

export interface YakuListProps {
  win: WinEvent;
  names: Quad<string>;
}

/** A win's yaku, each with its value, and the player liable for the hand (pao) when there is one. */
export function YakuList({ win, names }: YakuListProps) {
  const { m } = useI18n();
  return (
    <div className={styles.details}>
      {win.yaku && win.yaku.length > 0 && (
        <ul className={styles.yaku} aria-label={m.result.yaku}>
          {keyed(win.yaku).map(({ key, item }) => (
            <li key={key} className={styles.row}>
              <span className={styles.name}>{yakuLabel(m, item)}</span>
              <span className={styles.value}>{yakuValueLabel(m, item)}</span>
            </li>
          ))}
        </ul>
      )}
      {win.pao !== undefined && <p className={styles.pao}>{m.result.pao(names[win.pao])}</p>}
    </div>
  );
}
