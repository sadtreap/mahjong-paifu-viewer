import { type CSSProperties, useId } from "react";
import type { Quad, RyukyokuEvent, WinEvent } from "../../core/model";
import type { KnownTile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import type { SeatView } from "../../replay/types";
import { winValue } from "../labels";
import { keyed } from "../layout";
import { handLineUnits } from "../result/handUnits";
import { Standings } from "../result/Standings";
import { WinHand } from "../result/WinHand";
import { hasYakuDetails, YakuList } from "../result/YakuList";
import { shortcutKey } from "../viewer/shortcuts";
import type { ResultBlockProps } from "../viewer/types";
import styles from "./ResultBlock.module.css";

/**
 * The width that sizes the tiles of the winning hands (see ResultBlock.module.css), in tile
 * widths: that of the widest hand's concealed tiles, so that the hands of a multiple ron share one
 * tile size. None when no hand is known.
 */
function handWidth(wins: readonly WinEvent[], seats: Quad<SeatView>): CSSProperties | undefined {
  const lines = wins.flatMap(
    (win) => handLineUnits(win, seats[win.seat].melds, seats[win.seat].kita) ?? [],
  );
  if (lines.length === 0) {
    return undefined;
  }
  return { "--hand-line": Math.max(...lines) } as CSSProperties;
}

/** How a win was made: "Tsumo", or "Ron off C". */
function howLabel(m: Messages, win: WinEvent, names: Quad<string>): string {
  return win.from === win.seat ? m.result.tsumo : m.result.ronFrom(names[win.from]);
}

interface WinProps {
  win: WinEvent;
  seats: Quad<SeatView>;
  names: Quad<string>;
  doraIndicators: readonly KnownTile[];
}

/** One win: who won and how, for how much, then the hand with its dora and the yaku. */
function Win({ win, seats, names, doraIndicators }: WinProps) {
  const { m, locale } = useI18n();
  const headingId = useId();
  const value = winValue(m, locale, win);
  return (
    <article className={styles.win} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.title}>
        <span className={styles.winner}>{names[win.seat]}</span>{" "}
        <span className={styles.how}>{howLabel(m, win, names)}</span>
      </h3>
      {(value.points !== null || value.count !== "") && (
        <p className={styles.value}>
          {value.points !== null && <strong className={styles.points}>{value.points}</strong>}
          {value.count !== "" && <span className={styles.count}>{value.count}</span>}
        </p>
      )}
      <WinHand
        win={win}
        melds={seats[win.seat].melds}
        kita={seats[win.seat].kita}
        doraIndicators={doraIndicators}
      />
      {hasYakuDetails(win) && <YakuList win={win} names={names} />}
    </article>
  );
}

/**
 * The round's result, in the panel while the table shows the round's last step: beside its
 * heading the way on to the next round, then who won, off whom and for how much, the winning hand
 * with its dora and yaku (a multiple ron stacks its wins), or the kind of draw; after the last
 * round, the final standings.
 * The point changes, and who was tenpai at a draw, are in the player list right under it. Nothing
 * here covers the table.
 */
export function ResultBlock({
  results,
  seats,
  names,
  playerCount,
  final,
  doraIndicators,
  onNextRound,
}: ResultBlockProps) {
  const { m } = useI18n();
  const headingId = useId();
  const wins = results.filter((result): result is WinEvent => result.type === "win");
  const draw = results.find((result): result is RyukyokuEvent => result.type === "ryukyoku");
  const nextKey = shortcutKey({ type: "nav", command: { kind: "nextRound" } });
  return (
    <section
      className={styles.result}
      aria-labelledby={headingId}
      data-result=""
      style={handWidth(wins, seats)}
    >
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading}>
          {m.result.heading}
        </h2>
        {!final && (
          <button
            type="button"
            data-variant="primary"
            title={nextKey ? m.tools.withKey(m.result.nextRound, nextKey) : undefined}
            onClick={onNextRound}
          >
            {m.result.nextRound}
          </button>
        )}
      </div>
      {keyed(wins).map(({ key, item }) => (
        <Win key={key} win={item} seats={seats} names={names} doraIndicators={doraIndicators} />
      ))}
      {wins.length === 0 && draw && (
        <h3 className={styles.title}>
          <span className={styles.winner}>{m.ryukyoku[draw.reason]}</span>
        </h3>
      )}
      {final && <Standings final={final} names={names} playerCount={playerCount} />}
    </section>
  );
}
