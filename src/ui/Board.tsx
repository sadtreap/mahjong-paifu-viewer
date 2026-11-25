import type { CSSProperties } from "react";
import type { Quad, Round, Seat } from "../core/model";
import { useI18n } from "../i18n/context";
import type { BoardState } from "../replay/types";
import styles from "./Board.module.css";
import { CenterPanel } from "./CenterPanel";
import { cx } from "./cx";
import { HandRow } from "./HandRow";
import { roundLabel } from "./labels";
import { fitScale, handRowWidth, SIDES, seatOnSide, seatWind } from "./layout";
import { Pond } from "./Pond";
import { SeatInfo } from "./SeatInfo";
import { highlightedDiscard } from "./steps";

/** Length of a hand row in board units (one unit is a hand tile's width); see Board.module.css. */
const HAND_ROW_UNITS = 18.1;

export interface BoardProps {
  round: Round;
  state: BoardState;
  names: Quad<string>;
  /** Seat drawn at the bottom. */
  pov: Seat;
  /** Seats whose concealed tiles are face up. */
  revealed: ReadonlySet<Seat>;
}

/**
 * Square table. Each seat is drawn in a full-size layer laid out for the bottom side and rotated
 * into place, so all four sides share one layout; the center panel is not rotated.
 */
export function Board({ round, state, names, pov, revealed }: BoardProps) {
  const { m } = useI18n();
  const highlight = highlightedDiscard(round.events, state);

  return (
    <section className={styles.board} aria-label={m.board.table}>
      <div className={styles.center}>
        <CenterPanel
          // Honba has its own counter in the center panel, so the name leaves it out.
          roundName={roundLabel(m, { ...round, honba: 0 })}
          honba={state.honba}
          riichiSticks={state.riichiSticks}
          doraIndicators={state.doraIndicators}
          wallRemaining={state.wallRemaining}
        />
      </div>
      {SIDES.map((side) => {
        const seat = seatOnSide(side, pov);
        const view = state.seats[seat];
        const scale = fitScale(handRowWidth(view, seat), HAND_ROW_UNITS);
        return (
          <div key={side} className={cx(styles.layer, styles[side])}>
            <div className={styles.info}>
              <SeatInfo
                wind={seatWind(seat, round.dealer)}
                name={names[seat]}
                score={view.score}
                active={state.activeSeat === seat}
              />
            </div>
            {view.riichi && (
              <span className={styles.riichiStick} role="img" aria-label={m.board.riichi} />
            )}
            <div className={styles.pond}>
              <Pond
                discards={view.discards}
                name={names[seat]}
                lastIndex={highlight?.seat === seat ? highlight.index : -1}
              />
            </div>
            <div className={styles.hand} style={{ "--hand-scale": String(scale) } as CSSProperties}>
              <HandRow seat={seat} view={view} name={names[seat]} revealed={revealed.has(seat)} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
