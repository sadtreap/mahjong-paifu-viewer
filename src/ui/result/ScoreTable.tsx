import { type CSSProperties, useId } from "react";
import type { PlayerCount, Quad, Seat } from "../../core/model";
import { activeSeats } from "../../core/players";
import type { KnownTile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { formatDelta, formatPoints, standings, tileLabel } from "../labels";
import { keyed } from "../layout";
import { TileGroup } from "../TileGroup";
import { TileImage } from "../TileImage";
import styles from "./ScoreTable.module.css";

/** Who was tenpai at a draw, and what each of those hands waited on. */
export interface TenpaiInfo {
  seats: readonly Seat[];
  /** The waits of each tenpai seat whose hand is known. */
  waits: Partial<Record<Seat, readonly KnownTile[]>>;
}

export interface ScoreTableProps {
  /** Each seat's score after the round. */
  scores: Quad<number>;
  /** The round's point changes, all of its results together. */
  changes: Quad<number>;
  names: Quad<string>;
  playerCount: PlayerCount;
  /** A draw that lists its tenpai seats: every row says tenpai (with the waits) or noten. */
  tenpai: TenpaiInfo | null;
  /** The game's final scores, after its last round only: the rows become the final standings. */
  final: Quad<number> | null;
}

/**
 * One row per playing seat: the name, at a draw tenpai (with the tiles the hand waited on) or
 * noten, the new score and the signed change (empty when nothing changed). After the last round
 * the rows are the final standings instead: ranked, with the place first and the final score.
 */
export function ScoreTable({
  scores,
  changes,
  names,
  playerCount,
  tenpai,
  final,
}: ScoreTableProps) {
  const { m, locale } = useI18n();
  const headingId = useId();
  const rows = final
    ? standings(final, playerCount)
    : activeSeats(playerCount).map((seat) => ({ seat, score: scores[seat], place: 0 }));
  return (
    <div className={styles.scores}>
      {final && (
        <h3 id={headingId} className={styles.heading}>
          {m.standings.heading}
        </h3>
      )}
      <table
        className={cx(styles.table, final && styles.ranked)}
        aria-labelledby={final ? headingId : undefined}
      >
        {!final && <caption className="sr-only">{m.result.deltas}</caption>}
        <thead className="sr-only">
          <tr>
            {final && <th scope="col">{m.standings.rank}</th>}
            <th scope="col">{m.result.player}</th>
            {tenpai && <th scope="col">{m.result.tenpai}</th>}
            <th scope="col">{m.standings.points}</th>
            <th scope="col">{m.result.change}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ seat, score, place }) => {
            const isTenpai = tenpai?.seats.includes(seat) ?? false;
            const waits = isTenpai ? (tenpai?.waits[seat] ?? []) : [];
            return (
              <tr key={seat} className={place === 1 ? styles.first : undefined}>
                {final && <td className={styles.place}>{m.standings.place(place)}</td>}
                <th scope="row" className={styles.name}>
                  {names[seat]}
                </th>
                {tenpai && (
                  <td className={styles.tenpai}>
                    <div className={styles.hand}>
                      <span className={isTenpai ? styles.isTenpai : styles.noten}>
                        {isTenpai ? m.result.tenpai : m.result.noten}
                      </span>
                      {waits.length > 0 && (
                        <TileGroup label={m.result.waits(waits.map((tile) => tileLabel(m, tile)))}>
                          <span
                            className={styles.waits}
                            style={{ "--n": waits.length } as CSSProperties}
                          >
                            {keyed(waits).map(({ key, item }) => (
                              <TileImage key={key} tile={item} label="" />
                            ))}
                          </span>
                        </TileGroup>
                      )}
                    </div>
                  </td>
                )}
                <td className={styles.score}>{formatPoints(locale, score)}</td>
                <td
                  className={cx(
                    styles.change,
                    changes[seat] > 0 && styles.gain,
                    changes[seat] < 0 && styles.loss,
                  )}
                >
                  {changes[seat] !== 0 && formatDelta(locale, changes[seat])}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
