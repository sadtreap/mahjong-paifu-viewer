import { type Ref, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Seat } from "../../core/model";
import { isActiveSeat } from "../../core/players";
import { useI18n } from "../../i18n/context";
import { roundLabel } from "../labels";
import { SIDES, seatOnSide } from "../layout";
import { highlightedDiscard } from "../steps";
import type { DiscardRef, TableStageProps } from "../viewer/types";
import { CallCaption } from "./CallCaption";
import { Console, consoleCells } from "./Console";
import { emptySide, stageVars } from "./geometry";
import { SeatZone } from "./SeatZone";
import { SPOTLIGHT_ROOT_ATTR } from "./spotlight";
import styles from "./TableStage.module.css";
import { useStageHover } from "./useSpotlight";

/** Parses a pond tile's `data-d` ("seat:index"). */
function parseDiscardRef(value: string | null | undefined): DiscardRef | null {
  const match = /^([0-3]):(\d+)$/.exec(value ?? "");
  if (match === null) {
    return null;
  }
  return { seat: Number(match[1]) as Seat, index: Number(match[2]) };
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref !== null && ref !== undefined) {
    (ref as RefObject<T | null>).current = value;
  }
}

/**
 * The table, seen from straight above: a square mat with the console in its middle and one layer
 * per seat around it (pond, riichi stick, hand row), the viewed player's at the bottom, and the
 * call captions upright over it. A three-player game leaves one side empty. The section is the
 * stage: the Viewer attaches the step gestures to it through `stageRef`.
 *
 * The square is as large as the stage's box allows; geometry.ts gives its proportions, which the
 * stage writes as custom properties for the stylesheets.
 *
 * The table itself handles only Alt+click on a pond tile (a jump to that discard's decision step,
 * in the capture phase, so it never steps), the same-tile spotlight on hover, and the console,
 * its one button.
 */
export function TableStage({
  game,
  round,
  state,
  names,
  pov,
  revealed,
  seats,
  captions,
  motion,
  spotlight,
  onPondJump,
  stageRef,
  scoreDiff,
  onToggleScoreDiff,
}: TableStageProps) {
  const { m, locale } = useI18n();
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLElement | null) => {
      setStage(el);
      assignRef(stageRef, el);
    },
    [stageRef],
  );

  const onPondJumpRef = useRef(onPondJump);
  useEffect(() => {
    onPondJumpRef.current = onPondJump;
  });

  useStageHover(stage, spotlight);

  // Alt+click (Option+click) on a pond tile: jump, without stepping (capture phase, stops here).
  useEffect(() => {
    if (stage === null) {
      return;
    }
    const onDown = (e: PointerEvent) => {
      if (!e.altKey || e.button !== 0 || !(e.target instanceof Element)) {
        return;
      }
      const tile = e.target.closest<HTMLElement>("[data-d]");
      const ref = tile !== null && stage.contains(tile) ? parseDiscardRef(tile.dataset.d) : null;
      if (ref !== null) {
        e.stopImmediatePropagation();
        e.preventDefault();
        onPondJumpRef.current(ref);
      }
    };
    stage.addEventListener("pointerdown", onDown, { capture: true });
    return () => stage.removeEventListener("pointerdown", onDown, { capture: true });
  }, [stage]);

  const playerCount = game.playerCount;
  const highlight = highlightedDiscard(round.events, state);
  const empty = emptySide(playerCount, pov);
  const vars = useMemo(() => stageVars(), []);
  const cells = useMemo(
    () => consoleCells(seats, pov, state.activeSeat, scoreDiff, locale),
    [seats, pov, state.activeSeat, scoreDiff, locale],
  );
  const landing = motion.landing;

  const zones = SIDES.map((side) => {
    const seat = seatOnSide(side, pov);
    if (side === empty || !isActiveSeat(seat, playerCount)) {
      return (
        <SeatZone
          key={side}
          side={side}
          seat={null}
          view={null}
          name=""
          revealed={false}
          highlightIndex={-1}
          landingIndex={-1}
        />
      );
    }
    return (
      <SeatZone
        key={side}
        side={side}
        seat={seat}
        view={state.seats[seat]}
        name={names[seat]}
        revealed={revealed.has(seat)}
        highlightIndex={highlight?.seat === seat ? highlight.index : -1}
        landingIndex={landing?.seat === seat ? landing.index : -1}
      />
    );
  });

  return (
    <section
      ref={setRefs}
      className={styles.stage}
      aria-label={m.board.table}
      tabIndex={-1}
      style={vars}
      {...{ [SPOTLIGHT_ROOT_ATTR]: "" }}
    >
      <div className={styles.table}>
        <Console
          roundName={roundLabel(m, { ...round, honba: state.honba })}
          roundShort={roundLabel(m, { ...round, honba: 0 })}
          doraIndicators={state.doraIndicators}
          wallRemaining={state.wallRemaining}
          deposits={state.riichiSticks}
          cells={cells}
          diff={scoreDiff}
          onToggleDiff={onToggleScoreDiff}
        />
        {zones}
        <CallCaption captions={captions} pov={pov} />
      </div>
    </section>
  );
}
