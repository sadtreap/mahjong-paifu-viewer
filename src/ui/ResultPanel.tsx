import { useId } from "react";
import type { Quad, RyukyokuEvent, WinEvent } from "../core/model";
import { SEATS } from "../core/model";
import { useI18n } from "../i18n/context";
import type { Messages } from "../i18n/messages";
import type { MeldView } from "../replay/types";
import { DeltaTable } from "./DeltaTable";
import { formatPoints, tileLabel, yakuLabel, yakuValueLabel } from "./labels";
import { keyed, splitWinningHand } from "./layout";
import { MeldTiles } from "./MeldTiles";
import styles from "./ResultPanel.module.css";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";

export interface ResultPanelProps {
  results: Array<WinEvent | RyukyokuEvent>;
  names: Quad<string>;
  /** Each seat's calls at the round end; a winner's calls complete the winning hand. */
  melds: Quad<readonly MeldView[]>;
}

/** How a round ended: each win with its value and yaku, or the draw with tenpai seats. */
export function ResultPanel({ results, names, melds }: ResultPanelProps) {
  const { m } = useI18n();
  const headingId = useId();
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {m.result.heading}
      </h2>
      {keyed(results).map(({ key, item }) =>
        item.type === "win" ? (
          <WinResult key={key} win={item} names={names} melds={melds[item.seat]} />
        ) : (
          <DrawResult key={key} draw={item} names={names} />
        ),
      )}
    </section>
  );
}

function valueLine(m: Messages, locale: Parameters<typeof formatPoints>[0], win: WinEvent): string {
  const yakumanCount = (win.yaku ?? [])
    .filter((entry) => entry.yakuman)
    .reduce((sum, entry) => sum + Math.max(1, Math.round(entry.han / 13)), 0);
  const parts: string[] = [];
  if (yakumanCount > 0) {
    parts.push(m.result.yakuman(yakumanCount));
  } else {
    if (win.han !== undefined) {
      parts.push(m.result.han(win.han));
    }
    // Limit hands are named instead; tenhou.net/6 JSON has no fu for them, so hide it for every format.
    if (win.fu !== undefined && win.fu > 0 && win.limit === undefined) {
      parts.push(m.result.fu(win.fu));
    }
    if (win.limit !== undefined) {
      parts.push(m.result.limits[win.limit]);
    }
  }
  if (win.points !== undefined) {
    parts.push(m.result.points(formatPoints(locale, win.points)));
  }
  return parts.join(" · ");
}

interface WinResultProps {
  win: WinEvent;
  names: Quad<string>;
  /** The winner's calls. */
  melds: readonly MeldView[];
}

function WinResult({ win, names, melds }: WinResultProps) {
  const { m, locale } = useI18n();
  const value = valueLine(m, locale, win);
  const hand = win.hand ? splitWinningHand(win.hand, win.tile) : null;
  return (
    <article className={styles.result}>
      <h3 className={styles.title}>
        <span className={styles.winner}>{names[win.seat]}</span>
        <span className={styles.how}>
          {win.from === win.seat ? m.result.tsumo : m.result.ronFrom(names[win.from])}
        </span>
      </h3>
      {value && <p className={styles.value}>{value}</p>}
      {hand && (
        <TileGroup className={styles.tiles} label={m.result.winningHand}>
          {keyed(hand.rest).map(({ key, item }) => (
            <TileImage key={key} tile={item} />
          ))}
          {hand.winning !== null && (
            <span className={styles.winningTile}>
              <TileImage
                tile={hand.winning}
                label={`${m.result.winningTile}: ${tileLabel(m, hand.winning)}`}
              />
            </span>
          )}
          {keyed(melds).map(({ key, item }) => (
            <span key={key} className={styles.meld}>
              <MeldTiles meld={item} owner={win.seat} />
            </span>
          ))}
        </TileGroup>
      )}
      {!hand && win.tile !== undefined && (
        <TileGroup className={styles.tiles} label={m.result.winningTile}>
          <TileImage tile={win.tile} />
        </TileGroup>
      )}
      {win.yaku && win.yaku.length > 0 && (
        <ul className={styles.yaku} aria-label={m.result.yaku}>
          {keyed(win.yaku).map(({ key, item }) => (
            <li key={key} className={styles.yakuRow}>
              <span>{yakuLabel(m, item)}</span>
              <span className={styles.yakuHan}>{yakuValueLabel(m, item)}</span>
            </li>
          ))}
        </ul>
      )}
      {win.uraIndicators && win.uraIndicators.length > 0 && (
        <div className={styles.ura}>
          <span className={styles.uraLabel}>{m.result.uraIndicators}</span>
          <span className={styles.tiles}>
            {keyed(win.uraIndicators).map(({ key, item }) => (
              <TileImage key={key} tile={item} />
            ))}
          </span>
        </div>
      )}
      {win.pao !== undefined && <p className={styles.note}>{m.result.pao(names[win.pao])}</p>}
      <DeltaTable deltas={win.deltas} names={names} />
    </article>
  );
}

function DrawResult({ draw, names }: { draw: RyukyokuEvent; names: Quad<string> }) {
  const { m } = useI18n();
  const tenpai = draw.tenpai;
  return (
    <article className={styles.result}>
      <h3 className={styles.title}>{m.ryukyoku[draw.reason]}</h3>
      {tenpai !== undefined && (
        <ul className={styles.tenpai}>
          {SEATS.map((seat) => (
            <li key={seat} className={styles.tenpaiRow}>
              <span className={styles.tenpaiName}>{names[seat]}</span>
              <span className={tenpai.includes(seat) ? styles.isTenpai : styles.noten}>
                {tenpai.includes(seat) ? m.result.tenpai : m.result.noten}
              </span>
            </li>
          ))}
        </ul>
      )}
      {draw.deltas.some((delta) => delta !== 0) && (
        <DeltaTable deltas={draw.deltas} names={names} />
      )}
    </article>
  );
}
