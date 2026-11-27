import { type CSSProperties, memo } from "react";
import type { DiscardView, MeldView, SeatView } from "../../replay/types";
import { cx } from "../cx";
import { HandRow } from "../HandRow";
import { Pond } from "../Pond";
import type { SeatZoneProps } from "../viewer/types";
import { OPP_ROW_START, type OppRowLayout, oppRowLayout, pondScale, wallLength } from "./geometry";
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

function meldEqual(a: MeldView, b: MeldView): boolean {
  return (
    a.type === b.type &&
    a.from === b.from &&
    a.calledTile === b.calledTile &&
    a.addedTile === b.addedTile &&
    a.tiles.length === b.tiles.length &&
    a.tiles.every((tile, i) => tile === b.tiles[i])
  );
}

function discardEqual(a: DiscardView, b: DiscardView): boolean {
  return (
    a.tile === b.tile &&
    a.tsumogiri === b.tsumogiri &&
    a.riichi === b.riichi &&
    a.called === b.called
  );
}

function listEqual<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => eq(x, b[i] as T)));
}

const same = <T,>(x: T, y: T) => x === y;

/**
 * Whether two snapshots of a seat draw the same: hand, melds and discards element by element, the
 * drawn tile, the kita count and riichi (the score is drawn on the console). The seat zones are
 * memoised per step by it.
 */
export function seatViewEqual(a: SeatView, b: SeatView): boolean {
  return (
    a === b ||
    (a.drawn === b.drawn &&
      a.riichi === b.riichi &&
      a.kita.length === b.kita.length &&
      listEqual(a.hand, b.hand, same) &&
      listEqual(a.melds, b.melds, meldEqual) &&
      listEqual(a.discards, b.discards, discardEqual))
  );
}

function SeatZoneImpl({
  side,
  seat,
  view,
  name,
  revealed,
  isPov,
  walled,
  highlightIndex,
  flightIndex,
  revealing = false,
}: SeatZoneOwnProps) {
  const layerClass = cx(layers.layer, layers[side]);
  if (seat === null || view === null) {
    return (
      <div className={layerClass} data-side={side}>
        <div className={styles.emptySeat} aria-hidden="true" />
      </div>
    );
  }
  const row = seatRow(view, seat, side, walled);
  const hs = row.hs;
  const sideWall = side === "right" || side === "left" ? side : null;
  const layerStyle = {
    "--hs": String(hs),
    "--L": String(wallLength(view)),
    "--row0": String(side === "bottom" ? 0 : OPP_ROW_START[side]),
  } as CSSProperties;
  return (
    <div className={layerClass} data-side={side} style={layerStyle}>
      {view.riichi && <span className={styles.stick} aria-hidden="true" />}
      <div
        className={styles.pond}
        style={{ "--ps": pondScale(view.discards).toFixed(4) } as CSSProperties}
      >
        <Pond
          discards={view.discards}
          name={name}
          lastIndex={highlightIndex}
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
    a.revealed === b.revealed &&
    a.isPov === b.isPov &&
    a.walled === b.walled &&
    a.highlightIndex === b.highlightIndex &&
    a.flightIndex === b.flightIndex &&
    a.revealing === b.revealing &&
    (a.view === b.view || (a.view !== null && b.view !== null && seatViewEqual(a.view, b.view)))
  );
}

/**
 * One seat's layer in the plane: the riichi stick by the console, the pond, and for opponents the
 * hand row (face up, lying backs in flat mode, or a spacer under a standing side wall), kita and
 * melds. A null seat is the empty seat of a three-player game: only a dashed outline. Memoised per
 * step by seatViewEqual.
 */
export const SeatZone = memo(SeatZoneImpl, propsEqual);
