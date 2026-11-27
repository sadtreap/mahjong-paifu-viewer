import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Seat } from "../../core/model";
import { isActiveSeat } from "../../core/players";
import { useI18n } from "../../i18n/context";
import type { BoardState } from "../../replay/types";
import { cx } from "../cx";
import { roundLabel } from "../labels";
import { ownRowUnits, SIDES, seatOnSide, sideOf } from "../layout";
import { highlightedDiscard } from "../steps";
import type { DiscardRef, MotionSpec, Side, TableStageProps } from "../viewer/types";
import { CallCaption } from "./CallCaption";
import { Console, consoleCells } from "./Console";
import { FlightLayer } from "./FlightLayer";
import {
  cameraFor,
  emptySide,
  OPP_ROW_START,
  pondSlot,
  type StageBox,
  stageVars,
  type TagPlace,
  tagPlace,
  wallLength,
} from "./geometry";
import layers from "./layers.module.css";
import { flightOffset } from "./motion";
import { OwnHand } from "./OwnHand";
import { SeatTags } from "./SeatTags";
import { SeatZone, seatRow } from "./SeatZone";
import { SPOTLIGHT_ROOT_ATTR } from "./spotlight";
import styles from "./TableStage.module.css";
import { useStageHover } from "./useSpotlight";
import { WallParts } from "./WallLayer";

/** The round-end reveal keeps the leaving walls this long (fade 240 ms, face-up in by 360 ms). */
export const REVEAL_MS = 400;

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

/** A slot is rendered only while it has something to show. */
function isFilled(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}

/**
 * The stage's size while `measure` is on (the stack camera fits its tilt to it), else null. It is
 * read once when the stage appears and then whenever it changes size.
 */
function useStageBox(stage: HTMLElement | null, measure: boolean): StageBox | null {
  const [box, setBox] = useState<StageBox | null>(null);
  useLayoutEffect(() => {
    if (stage === null || !measure) {
      return;
    }
    const keep = (width: number, height: number) =>
      setBox((old) =>
        old !== null && old.width === width && old.height === height ? old : { width, height },
      );
    const rect = stage.getBoundingClientRect();
    keep(rect.width, rect.height);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.contentRect;
      if (size !== undefined) {
        keep(size.width, size.height);
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage, measure]);
  return measure ? box : null;
}

/** The shape of a pond that bounds a seat tag's felt: its length and where its riichi tile is. */
function pondShape(discards: readonly { riichi: boolean }[]): string {
  return `${discards.length}:${discards.findIndex((discard) => discard.riichi)}`;
}

/** A pond of that shape, as tagPlace reads it. */
function pondOfShape(shape: string): { riichi: boolean }[] {
  const [length = 0, riichiAt = -1] = shape.split(":").map(Number);
  return Array.from({ length }, (_, i) => ({ riichi: i === riichiAt }));
}

/** Normalises a flight's source to the current point of view. */
function flightSource(flight: NonNullable<MotionSpec["flight"]>, pov: Seat) {
  if (flight.seat !== pov) {
    return "opponent" as const;
  }
  return flight.source === "opponent" ? ("hand" as const) : flight.source;
}

/**
 * The table: one flattened 3D plane (felt, rails, console, seat layers with ponds, opponents' hand
 * rows, standing walls, the empty seat of a three-player game, flight proxies), with the seat
 * tags, the own hand and captions as flat DOM above it, and behind it the room and the felt's
 * apron, which carries the felt and the side rails on toward the viewer under the own hand. The
 * section is the stage: the Viewer attaches the step gestures to it through `stageRef`.
 *
 * The arrangement and the view pick the camera (geometry.ts cameraFor; in the stack arrangement
 * its tilt also depends on the stage's size, the one thing the stage measures); the stage writes
 * its numbers as custom properties and the stylesheets size everything from them and from the
 * stage's own box.
 *
 * The table itself handles only Alt+click on a pond tile (a jump to that discard's decision step,
 * in the capture phase, so it never steps), the same-tile spotlight on hover, and the console,
 * its one button.
 *
 * Two slots hold what the Viewer puts over the table, and stage gestures ignore both: `dock` (the
 * transport bar, on the felt between the viewed player's pond and hand) and `overlay` (the result
 * card's layer, above everything). The overlay comes first in the document, so the keyboard reaches
 * the card before the console and the bar in the dock; its z-index puts it on top.
 */
export function TableStage({
  game,
  round,
  state,
  names,
  pov,
  revealed,
  view,
  arrangement,
  walls,
  tags,
  captions,
  motion,
  spotlight,
  onPondJump,
  stageRef,
  scoreDiff,
  onToggleScoreDiff,
  dock,
  overlay,
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

  // Motion: one flight at a time (a new step replaces it), and the round-end reveal.
  const [flightDoneFor, setFlightDoneFor] = useState<BoardState | null>(null);
  const [revealDoneFor, setRevealDoneFor] = useState<BoardState | null>(null);
  const threeD = view === "3d";
  const flight = motion.flight !== null && flightDoneFor !== state ? motion.flight : null;
  // The reveal belongs to the step that reaches the result, decided when the state arrives: H or
  // C at a result step is not a step, so it never plays the reveal afterwards.
  const canReveal = walls && threeD && motion.reveal.length > 0;
  const [revealFor, setRevealFor] = useState<BoardState | null>(canReveal ? state : null);
  const [stateSeen, setStateSeen] = useState(state);
  if (stateSeen !== state) {
    setStateSeen(state);
    setRevealFor(canReveal ? state : null);
    // A new step forgets the finished flight, so reaching that state again flies again.
    setFlightDoneFor(null);
  }
  const isRevealing =
    walls && threeD && revealFor === state && stateSeen === state && revealDoneFor !== state;
  const revealing = isRevealing ? new Set<Seat>(motion.reveal) : null;
  useEffect(() => {
    if (!isRevealing) {
      return;
    }
    const timer = window.setTimeout(() => setRevealDoneFor(state), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [isRevealing, state]);
  const endFlight = useCallback(() => setFlightDoneFor(state), [state]);

  const playerCount = game.playerCount;
  const highlight = highlightedDiscard(round.events, state);
  const empty = emptySide(playerCount, pov);

  const box = useStageBox(stage, arrangement === "stack");
  const camera = cameraFor(arrangement, view, box);
  const vars = useMemo(() => stageVars(camera), [camera]);
  // Each tag's felt is bounded by the pond of the seat on that seat's left, so the places are
  // worked out again only when one of those ponds changes shape. The viewed player's tag stays
  // above a bar in the dock; the side players' tags stand beside the table where the stage has
  // room there (every arrangement but "stack").
  const docked = isFilled(dock);
  const rim = arrangement !== "stack";
  const shapes = SIDES.map((_, i) =>
    pondShape(state.seats[seatOnSide(SIDES[(i + 3) % 4] as Side, pov)].discards),
  ).join(" ");
  const places = useMemo(() => {
    const ponds = shapes.split(" ");
    return Object.fromEntries(
      SIDES.map((side, i) => [
        side,
        tagPlace(side, camera, docked, rim, pondOfShape(ponds[i] ?? "")),
      ]),
    ) as Record<Side, TagPlace>;
  }, [camera, docked, rim, shapes]);
  const cells = useMemo(
    () => consoleCells(tags, pov, state.activeSeat, scoreDiff, locale),
    [tags, pov, state.activeSeat, scoreDiff, locale],
  );

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
          isPov={false}
          walled={false}
          highlightIndex={-1}
          flightIndex={-1}
        />
      );
    }
    const seatView = state.seats[seat];
    const isRevealed = revealed.has(seat);
    return (
      <SeatZone
        key={side}
        side={side}
        seat={seat}
        view={seatView}
        name={names[seat]}
        revealed={isRevealed}
        isPov={seat === pov}
        walled={walls && threeD && !isRevealed && seat !== pov}
        highlightIndex={highlight?.seat === seat ? highlight.index : -1}
        flightIndex={flight?.seat === seat ? flight.index : -1}
        revealing={revealing?.has(seat) ?? false}
      />
    );
  });

  // The far seat's wall lives in an unrotated layer after the seat layers.
  const topSeat = seatOnSide("top", pov);
  const topPlaying = empty !== "top" && isActiveSeat(topSeat, playerCount);
  const topView = state.seats[topSeat];
  const topWalled = topPlaying && walls && threeD && !revealed.has(topSeat) && topSeat !== pov;
  const topLeaving = topPlaying && !topWalled && (revealing?.has(topSeat) ?? false);
  const topHs = seatRow(topView, topSeat, "top", topWalled).hs;
  const topWall =
    topWalled || topLeaving ? (
      <div
        className={cx(layers.layer, layers.wtop)}
        data-layer="wtop"
        style={
          {
            "--hs": String(topHs),
            "--L": String(wallLength(topView)),
            "--row0": String(OPP_ROW_START.top),
          } as CSSProperties
        }
      >
        <WallParts
          side="top"
          count={topView.hand.length}
          drawn={topView.drawn !== null}
          hs={topHs}
          name={names[topSeat]}
          leaving={topLeaving}
        />
      </div>
    ) : null;

  let flightLayer = null;
  if (flight !== null) {
    const flyer = state.seats[flight.seat];
    const discard = flyer.discards[flight.index];
    if (discard !== undefined) {
      const source = flightSource(flight, pov);
      // The own row keeps the drawn tile's slot, so its width is the one the tile left from.
      const ownUnits = ownRowUnits(state.seats[pov], pov);
      const flightSide = sideOf(flight.seat, pov);
      const flyerWalled = walls && threeD && !revealed.has(flight.seat);
      const from = flightOffset(
        { ...flight, source },
        flyer,
        camera,
        ownUnits,
        seatRow(flyer, flight.seat, flightSide, flyerWalled),
      );
      flightLayer = (
        <FlightLayer
          key={`${state.eventIndex}:${flight.seat}:${flight.index}`}
          side={flightSide}
          tile={discard.tile}
          riichi={flight.riichi && discard.riichi}
          slot={pondSlot(flight.index, flyer.discards)}
          from={from}
          onDone={endFlight}
        />
      );
    }
  }

  const hasOverlay = isFilled(overlay);
  const stageAttrs = {
    [SPOTLIGHT_ROOT_ATTR]: "",
    "data-arrangement": arrangement,
    "data-view": view,
    "data-thick": "",
    "data-walls": walls ? "" : undefined,
    "data-dock": docked ? "" : undefined,
    "data-overlay": hasOverlay ? "" : undefined,
  };

  return (
    <section
      ref={setRefs}
      className={styles.stage}
      aria-label={m.board.table}
      tabIndex={-1}
      style={vars}
      {...stageAttrs}
    >
      {hasOverlay && (
        <div className={styles.overlay} data-gesture="ignore">
          {overlay}
        </div>
      )}
      <div className={styles.table}>
        <div className={styles.frame}>
          <div className={styles.apron} aria-hidden="true" />
          <div className={styles.plane}>
            <Console
              roundName={roundLabel(m, { ...round, honba: 0 })}
              wallRemaining={state.wallRemaining}
              cells={cells}
              diff={scoreDiff}
              onToggleDiff={onToggleScoreDiff}
              covered={hasOverlay}
            />
            {zones}
            {topWall}
            {flightLayer}
          </div>
          <SeatTags tags={tags} places={places} />
          <OwnHand seat={pov} view={state.seats[pov]} name={names[pov]} />
          <CallCaption captions={captions} pov={pov} camera={camera} />
          {isFilled(dock) && (
            <div className={styles.dock}>
              <div className={styles.dockContent} data-gesture="ignore">
                {dock}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
