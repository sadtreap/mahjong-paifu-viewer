import {
  type CSSProperties,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Seat } from "../../core/model";
import { isActiveSeat, seatWind } from "../../core/players";
import { useI18n } from "../../i18n/context";
import type { BoardState } from "../../replay/types";
import { cx } from "../cx";
import { roundLabel } from "../labels";
import { ownRowUnits, SIDES, seatOnSide, sideOf } from "../layout";
import { highlightedDiscard } from "../steps";
import type { DiscardRef, MotionSpec, TableStageProps } from "../viewer/types";
import { CallCaption } from "./CallCaption";
import { CONSOLE_ATTR, Console } from "./Console";
import { FlightLayer } from "./FlightLayer";
import { emptySide, PRESETS, type Preset, wallLength } from "./geometry";
import layers from "./layers.module.css";
import { flightOffset, pondSlotCenter } from "./motion";
import { OwnHand } from "./OwnHand";
import { type PondTip, PondTooltip } from "./PondTooltip";
import { Room } from "./Room";
import { SeatPlates } from "./SeatPlates";
import { SeatZone, seatRow } from "./SeatZone";
import { SPOTLIGHT_ROOT_ATTR, type SpotlightController } from "./spotlight";
import styles from "./TableStage.module.css";
import { useStageHover } from "./useSpotlight";
import { WallParts } from "./WallLayer";

/** The round-end reveal keeps the leaving walls this long (fade 240 ms, face-up in by 360 ms). */
export const REVEAL_MS = 400;

/** Parses a pond tile's `data-d` ("seat:index"). */
export function parseDiscardRef(value: string | null | undefined): DiscardRef | null {
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

/** The camera preset in use: flat, or the orientation's (the same media query as the CSS). */
function currentPreset(threeD: boolean): Preset {
  if (!threeD) {
    return PRESETS.flat;
  }
  const portrait =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(orientation: portrait)").matches;
  return portrait ? PRESETS.portrait : PRESETS.landscape;
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
 * rows, standing walls, the sanma empty chair, flight proxies), with the plates, the own hand,
 * captions and the coach mark as flat DOM above it and the room behind it. The section is the
 * stage: the Viewer attaches the step gestures to it through `stageRef`.
 *
 * The table itself handles only Alt+click on a pond tile (a jump to that discard's decision step,
 * in the capture phase, so it never steps) and the hover aids (spotlight, pond tooltip).
 */
export function TableStage({
  game,
  round,
  state,
  names,
  pov,
  revealed,
  view,
  walls,
  dimTsumogiri,
  plates,
  nextDiscard,
  captions,
  motion,
  discards,
  spotlight,
  pickedKind,
  onRoundList,
  onPondDwell,
  onPondJump,
  stageRef,
  coach,
  overlay,
}: TableStageProps) {
  const { m } = useI18n();
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLElement | null) => {
      setStage(el);
      assignRef(stageRef, el);
    },
    [stageRef],
  );

  const latest = useRef({ discards, names, onPondDwell, onPondJump, state });
  latest.current = { discards, names, onPondDwell, onPondJump, state };

  // The sticky pick, in case the spotlight came from somewhere other than useSpotlight.
  useEffect(() => {
    (spotlight as Partial<SpotlightController>).setSticky?.(pickedKind);
  }, [spotlight, pickedKind]);

  // Pond tooltip: two layout reads per dwell (stage and console); hidden on every position change.
  const [tip, setTip] = useState<PondTip | null>(null);
  const onDwell = useCallback(
    (tile: HTMLElement | null) => {
      if (tile === null || stage === null) {
        setTip(null);
        return;
      }
      const ref = parseDiscardRef(tile.dataset.d);
      const indexed = ref === null ? undefined : latest.current.discards.get(ref);
      const desk = stage.querySelector<HTMLElement>(`[${CONSOLE_ATTR}]`);
      if (ref === null || indexed === undefined || desk === null) {
        return;
      }
      // The index knows the round's end; "called" is what this step shows (no spoiler).
      const shown = latest.current.state.seats[ref.seat].discards[ref.index];
      const info = { ...indexed, called: shown?.called ?? false };
      setTip({
        ref,
        info,
        name: latest.current.names[ref.seat],
        rects: {
          stage: stage.getBoundingClientRect(),
          console: desk.getBoundingClientRect(),
        },
      });
      latest.current.onPondDwell(ref);
    },
    [stage],
  );
  useStageHover(stage, { spotlight, onDwell });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new position hides the tooltip
  useEffect(() => {
    setTip(null);
  }, [state]);

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
        latest.current.onPondJump(ref);
      }
    };
    stage.addEventListener("pointerdown", onDown, { capture: true });
    return () => stage.removeEventListener("pointerdown", onDown, { capture: true });
  }, [stage]);

  // Motion: one flight at a time (a new step replaces it), and the round-end reveal.
  const [flightDoneFor, setFlightDoneFor] = useState<BoardState | null>(null);
  const [revealDoneFor, setRevealDoneFor] = useState<BoardState | null>(null);
  useEffect(() => {
    if (motion.flight === null) {
      setFlightDoneFor(null);
    }
  }, [motion]);
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
          wind={null}
          dealer={false}
          active={false}
          revealed={false}
          isPov={false}
          walled={false}
          highlightIndex={-1}
          dimTsumogiri={dimTsumogiri}
          flightIndex={-1}
        />
      );
    }
    const seatView = state.seats[seat];
    const wind = seatWind(seat, round.dealer, playerCount);
    const isRevealed = revealed.has(seat);
    return (
      <SeatZone
        key={side}
        side={side}
        seat={seat}
        view={seatView}
        name={names[seat]}
        wind={wind}
        dealer={wind === 0}
        active={state.activeSeat === seat}
        revealed={isRevealed}
        isPov={seat === pov}
        walled={walls && threeD && !isRevealed && seat !== pov}
        highlightIndex={highlight?.seat === seat ? highlight.index : -1}
        dimTsumogiri={dimTsumogiri}
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
      const offset = flightOffset(
        { ...flight, source },
        flyer,
        currentPreset(threeD),
        ownUnits,
        seatRow(flyer, flight.seat, flightSide, flyerWalled),
      );
      const slot = pondSlotCenter(flight.index, flyer.discards);
      flightLayer = (
        <FlightLayer
          key={`${state.eventIndex}:${flight.seat}:${flight.index}`}
          side={flightSide}
          tile={discard.tile}
          riichi={flight.riichi && discard.riichi}
          x={slot.x}
          y={slot.y}
          fx={offset.fx}
          fy={offset.fy}
          fs={offset.fs}
          onDone={endFlight}
        />
      );
    }
  }

  const hasOverlay = overlay !== undefined && overlay !== null && overlay !== false;
  const stageAttrs = {
    [SPOTLIGHT_ROOT_ATTR]: "",
    "data-view": view,
    "data-thick": "",
    "data-walls": walls ? "" : undefined,
    "data-overlay": hasOverlay ? "" : undefined,
  };

  return (
    <section
      ref={setRefs}
      className={styles.stage}
      aria-label={m.board.table}
      tabIndex={-1}
      {...stageAttrs}
    >
      <div className={styles.frame}>
        <Room />
        <div className={styles.plane}>
          <Console
            roundName={roundLabel(m, { ...round, honba: 0 })}
            wallRemaining={state.wallRemaining}
            onRoundList={onRoundList}
          />
          {zones}
          {topWall}
          {flightLayer}
        </div>
        <SeatPlates plates={plates} active={state.activeSeat} pov={pov} />
        <OwnHand seat={pov} view={state.seats[pov]} name={names[pov]} next={nextDiscard} />
        <CallCaption captions={captions} pov={pov} />
        {coach}
      </div>
      <PondTooltip tip={hasOverlay ? null : tip} />
      {overlay}
    </section>
  );
}
