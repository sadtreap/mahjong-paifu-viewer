import { type CSSProperties, memo } from "react";
import type { DiscardView, MeldView, SeatView } from "../../replay/types";
import { cx } from "../cx";
import { HandRow } from "../HandRow";
import { Pond } from "../Pond";
import type { SeatZoneProps } from "../viewer/types";
import { handScale, pondScale } from "./geometry";
import layers from "./layers.module.css";
import styles from "./SeatZone.module.css";

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
  highlightIndex,
  landingIndex,
}: SeatZoneProps) {
  const layerClass = cx(layers.layer, layers[side]);
  if (seat === null || view === null) {
    return <div className={layerClass} data-side={side} />;
  }
  return (
    <div className={layerClass} data-side={side}>
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
          landingIndex={landingIndex}
          landingClassName={styles.landing}
        />
      </div>
      <div
        className={styles.hand}
        style={{ "--hs": handScale(view, seat).toFixed(4) } as CSSProperties}
        data-own-hand={side === "bottom" ? "" : undefined}
      >
        <HandRow seat={seat} view={view} name={name} revealed={revealed} />
      </div>
    </div>
  );
}

function propsEqual(a: SeatZoneProps, b: SeatZoneProps): boolean {
  return (
    a.side === b.side &&
    a.seat === b.seat &&
    a.name === b.name &&
    a.revealed === b.revealed &&
    a.highlightIndex === b.highlightIndex &&
    a.landingIndex === b.landingIndex &&
    (a.view === b.view || (a.view !== null && b.view !== null && seatViewEqual(a.view, b.view)))
  );
}

/**
 * One seat's layer on the table: the riichi stick by the console, the pond and the hand row (face
 * up, or lying backs while the hand is hidden) with its kita and melds. The viewed player's row is
 * the bottom one, drawn like the others. A null seat is the empty chair of a three-player game:
 * an empty layer. Memoised per step by seatViewEqual.
 */
export const SeatZone = memo(SeatZoneImpl, propsEqual);
