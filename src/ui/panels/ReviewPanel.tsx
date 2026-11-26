import {
  isValidElement,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { useI18n } from "../../i18n/context";
import type { ReviewPanelProps } from "../viewer/types";
import { MovesList } from "./MovesList";
import { PanelHeader } from "./PanelHeader";
import { PlayersList } from "./PlayersList";
import { ResultCollapsed } from "./ResultCard";
import styles from "./ReviewPanel.module.css";
import { RoundMatrix } from "./RoundMatrix";
import { ScoreChart } from "./ScoreChart";
import { UnseenGrid } from "./UnseenGrid";

export interface ReviewPanelViewProps extends ReviewPanelProps {
  /** Full round names (roundLabel) for the matrix buttons' labels; the short labels otherwise. */
  roundNames?: readonly string[];
}

/**
 * The review rail: header, the docked result, players, the tiles the POV has not seen, the score
 * chart with the round matrix, and the round's moves. "column" is the wide layout's right column
 * (nothing when closed), "sheet" a modal side sheet (Esc, the close button or a click outside
 * closes it; focus returns to the opener), "inline" the portrait layout below the player, with the
 * unseen grid first and two columns when there is room.
 */
export function ReviewPanel(props: ReviewPanelViewProps) {
  const { m } = useI18n();
  const { mode, open, onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (mode !== "sheet" || !dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal?.();
    } else if (!open && dialog.open) {
      dialog.close?.();
    }
  }, [mode, open]);

  if (mode === "column") {
    return open ? (
      <aside className={styles.panel} data-mode="column" aria-label={m.panel.label}>
        <PanelContent {...props} />
      </aside>
    ) : null;
  }
  if (mode === "sheet") {
    // A click on the backdrop lands on the dialog itself.
    const onClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    };
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes the dialog natively (onClose)
      <dialog
        ref={dialogRef}
        className={styles.sheet}
        aria-label={m.panel.label}
        data-gesture="ignore"
        onClose={() => {
          if (open) {
            onClose();
          }
        }}
        onClick={onClick}
      >
        {open && (
          <div className={styles.panel} data-mode="sheet">
            <PanelContent {...props} />
          </div>
        )}
      </dialog>
    );
  }
  return (
    <section className={styles.panel} data-mode="inline" aria-label={m.panel.label}>
      <PanelContent {...props} />
    </section>
  );
}

/** Whether the result slot holds the card itself (not the collapsed line after Hide). */
function isCard(result: ReactNode | null): boolean {
  return result !== null && !(isValidElement(result) && result.type === ResultCollapsed);
}

function PanelContent({
  mode,
  onClose,
  title,
  source,
  result,
  players,
  onPov,
  pov,
  povName,
  unseen,
  playerCount,
  doraKinds,
  picked,
  onPick,
  spotlight,
  series,
  seats,
  names,
  matrix,
  final,
  currentRound,
  currentRowRef,
  roundNames,
  moves,
  currentStep,
  movesOpen,
  onMovesOpen,
  movesShowRest,
  onMovesShowRest,
  onSeek,
}: ReviewPanelViewProps) {
  const { m } = useI18n();
  const inline = mode === "inline";
  const roundsRef = useRef<HTMLElement>(null);
  const shownRound = useRef(currentRound);
  // A new round's matrix row scrolls into view, only while the matrix is on screen in the rail
  // (never inline, where it would scroll the page away from the table, and not when the rail
  // opens, which keeps its header in view).
  useEffect(() => {
    const section = roundsRef.current;
    if (shownRound.current === currentRound) {
      return;
    }
    shownRound.current = currentRound;
    if (inline || !section || currentRound < 0) {
      return;
    }
    const row = section.querySelector<HTMLElement>('tr[aria-current="true"]');
    const box =
      section.closest<HTMLElement>("dialog") ?? section.closest<HTMLElement>("[data-mode]");
    if (!row || !box) {
      return;
    }
    const view = box.getBoundingClientRect();
    const table = section.getBoundingClientRect();
    if (table.bottom > view.top && table.top < view.bottom) {
      row.scrollIntoView?.({ block: "nearest" });
    }
  }, [inline, currentRound]);
  // In the column, a docked result card takes the unseen grid's place.
  const showUnseen = !(mode === "column" && isCard(result));
  const playersSection = <PlayersList players={players} pov={pov} onPov={onPov} />;
  const unseenSection = showUnseen ? (
    <UnseenGrid
      povName={povName}
      unseen={unseen}
      playerCount={playerCount}
      doraKinds={doraKinds}
      picked={picked}
      onPick={onPick}
      spotlight={spotlight}
    />
  ) : null;
  return (
    <>
      <PanelHeader title={title} source={source} onClose={inline ? undefined : onClose} />
      {result !== null && <div className={styles.result}>{result}</div>}
      <div className={styles.columns}>
        <div className={styles.column}>
          {inline ? unseenSection : playersSection}
          {inline ? playersSection : unseenSection}
        </div>
        <div className={styles.column}>
          <section ref={roundsRef} className={styles.rounds} aria-label={m.panel.rounds}>
            <h3 className={styles.heading}>{m.panel.rounds}</h3>
            <ScoreChart series={series} seats={seats} names={names} currentRound={currentRound} />
            <p className={styles.legend} aria-hidden="true">
              <span>
                <span className={styles.won}>★</span> {m.panel.legendWon}
              </span>
              <span>
                <span className={styles.dealtIn}>▼</span> {m.panel.legendDealtIn}
              </span>
              <span>○ {m.panel.legendTenpai}</span>
              <span>
                <span className={styles.stick} /> {m.panel.legendRiichi}
              </span>
            </p>
            <RoundMatrix
              matrix={matrix}
              seats={seats}
              names={names}
              final={final}
              currentRound={currentRound}
              currentRowRef={currentRowRef}
              roundNames={roundNames}
              onSeek={onSeek}
            />
          </section>
          <MovesList
            moves={moves}
            currentStep={currentStep}
            pov={pov}
            names={names}
            picked={picked}
            open={movesOpen}
            onOpen={onMovesOpen}
            showRest={movesShowRest}
            onShowRest={onMovesShowRest}
            onSeek={onSeek}
          />
        </div>
      </div>
    </>
  );
}
