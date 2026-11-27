import { type CSSProperties, type KeyboardEvent, type ReactNode, useId } from "react";
import type { Quad, RyukyokuEvent, WinEvent } from "../../core/model";
import type { KnownTile } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import type { SeatView } from "../../replay/types";
import { roundDeltas } from "../controls/roundSummary";
import { winValueLabel } from "../labels";
import { keyed } from "../layout";
import type { ResultCardProps } from "../viewer/types";
import { handUnits } from "./handUnits";
import styles from "./ResultCard.module.css";
import { ScoreTable } from "./ScoreTable";
import { useOverflow } from "./useOverflow";
import { WinHand } from "./WinHand";
import { hasYakuDetails, YakuList } from "./YakuList";

/** The keys that scroll a focused box. */
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/**
 * Keeps the scroll keys of the focused body to the body: they stop here, before the viewer's
 * shortcuts on the window, where Down would leave the round instead of scrolling.
 */
function keepScrollKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (event.target === event.currentTarget && SCROLL_KEYS.has(event.key)) {
    event.stopPropagation();
  }
}

/**
 * The widths that size the tiles of the winning hands (see ResultCard.module.css), in tile widths:
 * those of the widest hand on the card, so that the hands of a multiple ron share one tile size.
 * None when no hand is known.
 */
function handWidths(wins: readonly WinEvent[], seats: Quad<SeatView>): CSSProperties | undefined {
  const units = wins.flatMap(
    (win) => handUnits(win, seats[win.seat].melds, seats[win.seat].kita) ?? [],
  );
  if (units.length === 0) {
    return undefined;
  }
  return {
    "--hand-line": Math.max(...units.map((hand) => hand.line)),
    "--hand-all": Math.max(...units.map((hand) => hand.all)),
  } as CSSProperties;
}

/** How a win was made: "Tsumo", or "Ron off C". */
function howLabel(m: Messages, win: WinEvent, names: Quad<string>): string {
  return win.from === win.seat ? m.result.tsumo : m.result.ronFrom(names[win.from]);
}

interface WinBlockProps {
  win: WinEvent;
  seats: Quad<SeatView>;
  names: Quad<string>;
  doraIndicators: readonly KnownTile[];
}

/** One win of a multiple ron: the winner and the value as its heading, then the hand and yaku. */
function WinBlock({ win, seats, names, doraIndicators }: WinBlockProps) {
  const { m, locale } = useI18n();
  const headingId = useId();
  const value = winValueLabel(m, locale, win);
  return (
    <article className={styles.block} aria-labelledby={headingId}>
      <div className={styles.heading}>
        <h3 id={headingId} className={styles.blockTitle}>
          {names[win.seat]}
        </h3>
        {value && <p className={styles.value}>{value}</p>}
      </div>
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
 * The round result, a card for the layer over the stage: who won, off whom and for how much, the
 * winning hand with its dora and yaku, then how the scores moved (at a draw, with who was tenpai
 * and on what); after the last round, the final standings. A multiple ron stacks its wins.
 *
 * It is one box that is never larger than its container (the size container named `result`): the
 * heading and the buttons stay in place and the part between them scrolls when it has to, and can
 * then be focused and scrolled with the keys. Stage gestures ignore it, and it never takes the
 * focus when it appears.
 */
export function ResultCard({
  results,
  seats,
  names,
  playerCount,
  final,
  drawWaits,
  doraIndicators,
  onHide,
  onNextRound,
}: ResultCardProps) {
  const { m, locale } = useI18n();
  const titleId = useId();
  const [bodyRef, { scrolls, more }] = useOverflow<HTMLDivElement>();
  const wins = results.filter((result): result is WinEvent => result.type === "win");
  const draw = results.find((result): result is RyukyokuEvent => result.type === "ryukyoku");
  const [win] = wins;
  const tenpai = draw?.tenpai ? { seats: draw.tenpai, waits: drawWaits } : null;
  const scores = seats.map((seat) => seat.score) as Quad<number>;
  const changes = roundDeltas(results);
  const showScores = final !== null || tenpai !== null || changes.some((change) => change !== 0);

  let title: ReactNode = m.result.heading;
  let value = "";
  let details: ReactNode = null;
  if (win && wins.length === 1) {
    title = (
      <>
        <span className={styles.strong}>{names[win.seat]}</span>
        {` · ${howLabel(m, win, names)}`}
      </>
    );
    value = winValueLabel(m, locale, win);
    details = (
      <>
        <div className={styles.lead}>
          <WinHand
            win={win}
            melds={seats[win.seat].melds}
            kita={seats[win.seat].kita}
            doraIndicators={doraIndicators}
          />
        </div>
        {hasYakuDetails(win) && (
          <div className={styles.detail}>
            <YakuList win={win} names={names} />
          </div>
        )}
      </>
    );
  } else if (win) {
    // Several winners of one discard: the card names the discarder, each block its winner.
    title = howLabel(m, win, names);
    details = keyed(wins).map(({ key, item }) => (
      <WinBlock key={key} win={item} seats={seats} names={names} doraIndicators={doraIndicators} />
    ));
  } else if (draw) {
    title = <span className={styles.strong}>{m.ryukyoku[draw.reason]}</span>;
  }
  const layout = wins.length > 1 ? "stacked" : win ? "win" : "draw";
  // What a body that scrolls needs to be reached and scrolled from the keyboard, all or nothing.
  const scrolling = {
    role: "group",
    "aria-labelledby": titleId,
    tabIndex: 0,
    onKeyDown: keepScrollKeys,
  };

  return (
    <section
      className={styles.card}
      aria-label={m.result.heading}
      data-result-card=""
      data-gesture="ignore"
      data-layout={layout}
      data-scrolls={scrolls ? "" : undefined}
      data-more={more ? "" : undefined}
      style={handWidths(wins, seats)}
    >
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {value && <p className={styles.value}>{value}</p>}
      </header>
      {(details || showScores) && (
        <div ref={bodyRef} className={styles.body} {...(scrolls ? scrolling : {})}>
          {details}
          {showScores && (
            <div className={styles.scores}>
              <ScoreTable
                scores={scores}
                changes={changes}
                names={names}
                playerCount={playerCount}
                tenpai={tenpai}
                final={final}
              />
            </div>
          )}
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" onClick={onHide}>
          {m.result.showTable}
        </button>
        {!final && (
          <button type="button" data-variant="primary" onClick={onNextRound}>
            {m.result.nextRound}
          </button>
        )}
      </div>
    </section>
  );
}
