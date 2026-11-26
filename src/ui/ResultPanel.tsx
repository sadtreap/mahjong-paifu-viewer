import type { PlayerCount, Quad, RyukyokuEvent, Seat, WinEvent } from "../core/model";
import { activeSeats } from "../core/players";
import type { KnownTile, Tile } from "../core/tile";
import { useI18n } from "../i18n/context";
import type { MeldView } from "../replay/types";
import { DeltaTable } from "./DeltaTable";
import { tileLabel, winValueLabel, yakuLabel, yakuValueLabel } from "./labels";
import { keyed, splitWinningHand } from "./layout";
import { MeldTiles } from "./MeldTiles";
import styles from "./ResultPanel.module.css";
import { TileGroup } from "./TileGroup";
import { TileImage } from "./TileImage";
import { KitaTiles } from "./table/KitaTiles";
import type { RiichiLine } from "./viewer/types";

/** A riichi line: "Riichi turn 10 · waited [3s 6s 9s] · 7 left". */
export function RiichiLineView({ line, names }: { line: RiichiLine; names: Quad<string> }) {
  const { m } = useI18n();
  const head = line.winner
    ? m.result.riichiLine(line.turn)
    : m.result.otherRiichi(names[line.seat], line.turn);
  return (
    <div className={styles.riichiLine}>
      <span>{head}</span>
      {line.waits.length > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <WaitTiles label={m.result.waited} tiles={line.waits} />
        </>
      )}
      {line.left !== null && (
        <>
          <span aria-hidden="true">·</span>
          <span>{m.table.left(line.left)}</span>
        </>
      )}
    </div>
  );
}

/** "waited" followed by the wait tiles, as one labelled group. */
function WaitTiles({ label, tiles }: { label: string; tiles: readonly KnownTile[] }) {
  const { m } = useI18n();
  return (
    <TileGroup
      className={styles.waits}
      label={`${label} ${tiles.map((tile) => tileLabel(m, tile)).join(", ")}`}
    >
      <span aria-hidden="true">{label}</span>
      {keyed(tiles).map(({ key, item }) => (
        <TileImage key={key} tile={item} label="" />
      ))}
    </TileGroup>
  );
}

export interface WinResultProps {
  win: WinEvent;
  names: Quad<string>;
  /** The winner's calls. */
  melds: readonly MeldView[];
  /** The winner's kita (three-player North tiles set aside), shown after the hand. */
  kita?: readonly Tile[];
  playerCount?: PlayerCount;
  /** Each seat's points before this win: the delta table shows "before → after". */
  before?: Quad<number>;
  /** The winner's riichi line, when it declared riichi. */
  riichi?: RiichiLine | null;
  /** The round's dora indicators, shown above the ura indicators. */
  doraIndicators?: readonly KnownTile[];
}

/** One win (inside the result card, which draws the box): winner, value, winning hand (with calls and kita), dora, riichi line, yaku, deltas. */
export function WinResult({
  win,
  names,
  melds,
  kita = [],
  playerCount = 4,
  before,
  riichi = null,
  doraIndicators = [],
}: WinResultProps) {
  const { m, locale } = useI18n();
  const value = winValueLabel(m, locale, win);
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
          {kita.length > 0 && <KitaTiles tiles={kita} name={names[win.seat]} />}
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
      {doraIndicators.length > 0 && (
        <div className={styles.ura}>
          <span className={styles.uraLabel}>{m.board.dora}</span>
          <span className={styles.tiles}>
            {keyed(doraIndicators).map(({ key, item }) => (
              <TileImage key={key} tile={item} />
            ))}
          </span>
        </div>
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
      {riichi && <RiichiLineView line={riichi} names={names} />}
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
      {win.pao !== undefined && <p className={styles.note}>{m.result.pao(names[win.pao])}</p>}
      <DeltaTable deltas={win.deltas} names={names} playerCount={playerCount} before={before} />
    </article>
  );
}

export interface DrawResultProps {
  draw: RyukyokuEvent;
  names: Quad<string>;
  playerCount?: PlayerCount;
  /** The waits of each tenpai seat, shown next to it. */
  waits?: Partial<Record<Seat, readonly KnownTile[]>>;
  /** Each seat's points before the noten payments: the delta table shows "before → after". */
  before?: Quad<number>;
}

/** A draw: its kind, the tenpai and noten seats (with each tenpai hand's waits) and the deltas. */
export function DrawResult({ draw, names, playerCount = 4, waits = {}, before }: DrawResultProps) {
  const { m } = useI18n();
  const tenpai = draw.tenpai;
  return (
    <article className={styles.result}>
      <h3 className={styles.title}>{m.ryukyoku[draw.reason]}</h3>
      {tenpai !== undefined && (
        <ul className={styles.tenpai}>
          {activeSeats(playerCount).map((seat) => {
            const seatWaits = tenpai.includes(seat) ? waits[seat] : undefined;
            return (
              <li key={seat} className={styles.tenpaiRow}>
                <span className={styles.tenpaiName}>{names[seat]}</span>
                {seatWaits && seatWaits.length > 0 && (
                  <WaitTiles label={m.table.waits} tiles={seatWaits} />
                )}
                <span className={tenpai.includes(seat) ? styles.isTenpai : styles.noten}>
                  {tenpai.includes(seat) ? m.result.tenpai : m.result.noten}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {draw.deltas.some((delta) => delta !== 0) && (
        <DeltaTable deltas={draw.deltas} names={names} playerCount={playerCount} before={before} />
      )}
    </article>
  );
}
