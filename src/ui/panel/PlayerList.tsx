import { useId } from "react";
import type { KnownTile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { cx } from "../cx";
import { formatDelta, formatPoints, tileLabel } from "../labels";
import { keyed } from "../layout";
import { TileImage } from "../TileImage";
import { shortcutKey, shortcutKeys } from "../viewer/shortcuts";
import type { PlayerListProps, PlayerRow, SeatAid } from "../viewer/types";
import styles from "./PlayerList.module.css";

/** A shanten count in words: a complete hand, tenpai, or "2-shanten". */
function shantenLabel(m: Messages, value: number): string {
  if (value < 0) {
    return m.table.completeHand;
  }
  return value === 0 ? m.table.tenpai : m.table.shanten(value);
}

/** The tiles a hand waits on, small; the words around them name the group for screen readers. */
function WaitTiles({ tiles }: { tiles: readonly KnownTile[] }) {
  return (
    <span className={styles.tiles} aria-hidden="true">
      {keyed(tiles).map(({ key, item }) => (
        <TileImage key={key} tile={item} label="" />
      ))}
    </span>
  );
}

interface NoteProps {
  aid: SeatAid | null;
  /** At a draw that lists its tenpai seats: whether this seat is one, and its waits. */
  tenpai: { is: boolean; waits: readonly KnownTile[] } | null;
}

/**
 * What a row says under the name: at a draw, tenpai (with the waits) or noten; otherwise the
 * seat's aid, its shanten in words or its waits with the tiles left and furiten.
 */
function Note({ aid, tenpai }: NoteProps) {
  const { m } = useI18n();
  if (tenpai !== null) {
    if (!tenpai.is) {
      return <span className={styles.note}>{m.result.noten}</span>;
    }
    return (
      <span className={styles.note}>
        <span className={styles.strong}>{m.result.tenpai}</span>
        {tenpai.waits.length > 0 && (
          <>
            {/* The word and the waits are read as two phrases; the tiles are for the eye. */}
            <span className="sr-only">
              {" "}
              {m.result.waits(tenpai.waits.map((tile) => tileLabel(m, tile)))}
            </span>
            <WaitTiles tiles={tenpai.waits} />
          </>
        )}
      </span>
    );
  }
  if (aid === null) {
    return null;
  }
  if (aid.kind === "shanten") {
    return (
      <span className={cx(styles.note, aid.value <= 0 && styles.strong)}>
        {shantenLabel(m, aid.value)}
      </span>
    );
  }
  return (
    <span className={styles.note}>
      <span className="sr-only">
        {m.table.waitsSr(
          aid.tiles.map((tile) => tileLabel(m, tile)),
          aid.left,
          aid.furiten,
        )}
      </span>
      <span aria-hidden="true">{m.table.waitsShort}</span>
      <WaitTiles tiles={aid.tiles} />
      <span aria-hidden="true">{m.table.left(aid.left)}</span>
      {aid.furiten && (
        <span className={styles.furiten} aria-hidden="true">
          {m.table.furiten}
        </span>
      )}
    </span>
  );
}

interface RowProps {
  player: PlayerRow;
  viewed: boolean;
  change: number | null;
  tenpai: NoteProps["tenpai"];
  seatKey: string | undefined;
  onPov(): void;
}

/** One player: a button that views the table from that seat. */
function Row({ player, viewed, change, tenpai, seatKey, onPov }: RowProps) {
  const { m, locale } = useI18n();
  return (
    <button
      type="button"
      data-variant="ghost"
      className={styles.row}
      aria-pressed={viewed}
      title={seatKey ? m.tools.withKey(m.tools.pov, seatKey) : m.tools.pov}
      onClick={onPov}
    >
      <span className={styles.wind} data-dealer={player.wind === 0 || undefined}>
        <span aria-hidden="true">{m.board.windsShort[player.wind]}</span>
        <span className="sr-only">{m.round.winds[player.wind]}</span>
      </span>
      <span className={styles.who}>
        <span className={styles.name}>{player.name}</span>
        {viewed && <span className={styles.viewed}>{m.tools.pov}</span>}
      </span>
      {change !== null && change !== 0 && (
        <span className={styles.change} data-sign={change > 0 ? "gain" : "loss"}>
          {formatDelta(locale, change)}
        </span>
      )}
      <span className={styles.score}>{formatPoints(locale, player.score)}</span>
      <Note aid={player.aid} tenpai={tenpai} />
    </button>
  );
}

/**
 * The players, one row per playing seat in seat order: the seat wind (the dealer's is filled, as
 * on the table), the name, the score and what the hand is doing (its waits or shanten; at a draw,
 * tenpai or noten). At a round's result each row also shows the round's point change. Pressing a
 * row views the table from that seat; the viewed one is marked. Above the rows, the switch
 * between all hands face up and only the viewed player's.
 */
export function PlayerList({
  players,
  pov,
  onPov,
  showAllHands,
  onToggleHands,
  changes,
  tenpai,
}: PlayerListProps) {
  const { m } = useI18n();
  const headingId = useId();
  const seatKeys = shortcutKeys("seat");
  const handsKey = shortcutKey({ type: "toggleHands" });
  return (
    <section className={styles.players} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading}>
          {m.panel.players}
        </h2>
        <label
          className={styles.hands}
          title={handsKey ? m.tools.withKey(m.viewer.showAllHands, handsKey) : undefined}
        >
          <input type="checkbox" checked={showAllHands} onChange={onToggleHands} />
          {m.viewer.showAllHands}
        </label>
      </div>
      {players.map((player) => (
        <Row
          key={player.seat}
          player={player}
          viewed={player.seat === pov}
          change={changes ? changes[player.seat] : null}
          tenpai={
            tenpai
              ? { is: tenpai.seats.includes(player.seat), waits: tenpai.waits[player.seat] ?? [] }
              : null
          }
          seatKey={seatKeys[player.seat]}
          onPov={() => onPov(player.seat)}
        />
      ))}
    </section>
  );
}
