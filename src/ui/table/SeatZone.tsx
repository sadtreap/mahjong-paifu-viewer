import { type CSSProperties, memo } from "react";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { HandRow } from "../HandRow";
import { Pond } from "../Pond";
import type { SeatZoneProps } from "../viewer/types";
import { type OppRowLayout, oppRowLayout, seatViewEqual, wallLength } from "./geometry";
import layers from "./layers.module.css";
import styles from "./SeatZone.module.css";
import { WallParts } from "./WallLayer";

export interface SeatZoneOwnProps extends SeatZoneProps {
  /**
   * The round-end reveal on this step: the seat's wall stays mounted for a moment and fades out
   * while the face-up hand fades in.
   */
  revealing?: boolean;
}

/** "23400" → ["234", "00"]: the console edge prints the hundreds smaller. */
export function edgeScore(score: number): [string, string] {
  return score % 100 === 0 && Math.abs(score) >= 100
    ? [String(score / 100), "00"]
    : [String(score), ""];
}

/**
 * An opponent's row on the table (geometry.ts oppRowLayout): where it starts, its tile scale and
 * the felt kept free after a standing wall. The point of view's seat has no row in the plane.
 */
export function seatRow(
  view: NonNullable<SeatZoneProps["view"]>,
  seat: NonNullable<SeatZoneProps["seat"]>,
  side: SeatZoneProps["side"],
  walled: boolean,
): OppRowLayout {
  return side === "bottom" ? { start: 0, hs: 1, gap: 0 } : oppRowLayout(view, seat, side, walled);
}

function SeatZoneImpl({
  side,
  seat,
  view,
  name,
  wind,
  dealer,
  active,
  revealed,
  isPov,
  walled,
  highlightIndex,
  dimTsumogiri,
  flightIndex,
  revealing = false,
}: SeatZoneOwnProps) {
  const { m } = useI18n();
  const layerClass = cx(layers.layer, layers[side]);
  if (seat === null || view === null) {
    return (
      <div className={layerClass} data-side={side}>
        <div className={styles.emptyChair} aria-hidden="true" />
      </div>
    );
  }
  const row = seatRow(view, seat, side, walled);
  const hs = row.hs;
  const length = wallLength(view);
  const [hundreds, zeros] = edgeScore(view.score);
  const sideWall = side === "right" || side === "left" ? side : null;
  return (
    <div
      className={layerClass}
      data-side={side}
      style={{ "--hs": String(hs), "--L": String(length) } as CSSProperties}
    >
      <div className={cx(styles.edge, side === "top" && styles.upright)} aria-hidden="true">
        {wind !== null && (
          <span className={cx(styles.wind, dealer && styles.dealer)}>
            {m.board.windsShort[wind]}
          </span>
        )}
        <span className={styles.score}>
          {hundreds}
          {zeros !== "" && <small>{zeros}</small>}
        </span>
      </div>
      {active && <div className={styles.turnBar} />}
      {view.riichi && <span className={styles.stick} role="img" aria-label={m.board.riichi} />}
      <div className={styles.pond}>
        <Pond
          discards={view.discards}
          name={name}
          lastIndex={highlightIndex}
          dimTsumogiri={dimTsumogiri}
          seat={seat}
          hiddenIndex={flightIndex}
          hiddenClassName={styles.landing}
        />
      </div>
      {!isPov && (
        <div className={styles.opp}>
          <HandRow
            seat={seat}
            view={view}
            name={name}
            revealed={revealed}
            spacer={walled}
            spacerGap={row.gap / hs}
            showKita
            concealedClassName={revealing ? styles.revealIn : undefined}
          />
        </div>
      )}
      {sideWall !== null && walled && (
        <WallParts
          side={sideWall}
          count={view.hand.length}
          drawn={view.drawn !== null}
          hs={hs}
          name={name}
        />
      )}
      {sideWall !== null && revealing && !walled && (
        <WallParts
          side={sideWall}
          count={view.hand.length}
          drawn={view.drawn !== null}
          hs={hs}
          name={name}
          leaving
        />
      )}
    </div>
  );
}

function propsEqual(a: SeatZoneOwnProps, b: SeatZoneOwnProps): boolean {
  return (
    a.side === b.side &&
    a.seat === b.seat &&
    a.name === b.name &&
    a.wind === b.wind &&
    a.dealer === b.dealer &&
    a.active === b.active &&
    a.revealed === b.revealed &&
    a.isPov === b.isPov &&
    a.walled === b.walled &&
    a.highlightIndex === b.highlightIndex &&
    a.dimTsumogiri === b.dimTsumogiri &&
    a.flightIndex === b.flightIndex &&
    a.revealing === b.revealing &&
    (a.view === b.view || (a.view !== null && b.view !== null && seatViewEqual(a.view, b.view)))
  );
}

/**
 * One seat's layer in the plane: the console edge (wind and score), the turn bar, the riichi
 * stick, the pond, and for opponents the hand row (face up, lying backs in flat mode, or a spacer
 * under a standing side wall), kita and melds. A null seat is the sanma empty chair: only a dashed
 * outline. Memoised per step by seatViewEqual.
 */
export const SeatZone = memo(SeatZoneImpl, propsEqual);
