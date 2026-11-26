/**
 * Contract types shared by the redesigned viewer's parts (table, dock, timeline, review rail,
 * shell). Owned by the shell; other owners request changes instead of editing this file.
 */
import type { ReactNode, Ref, RefObject } from "react";
import type {
  GameLog,
  PlayerCount,
  Quad,
  Round,
  RyukyokuEvent,
  Seat,
  Wind,
  WinEvent,
} from "../../core/model";
import type { KnownTile, Tile } from "../../core/tile";
import type { BoardState, SeatView } from "../../replay/types";
import type { Bounds, Position } from "../navigation";
import type { SampleId } from "../samples";

export type Dir = 1 | -1;
export type View = "3d" | "flat";
export type AutoplaySpeed = 0.5 | 1 | 2 | 4;
export type Theme = "system" | "light" | "dark";
export type Side = "bottom" | "right" | "top" | "left";
export type Breakpoint = "wide" | "laptop" | "phoneLandscape" | "tabletPortrait" | "phonePortrait";
export type PanelMode = "column" | "sheet" | "inline";

export type StepKind =
  | "deal"
  | "draw"
  | "discard"
  | "riichi"
  | "chi"
  | "pon"
  | "daiminkan"
  | "ankan"
  | "kakan"
  | "kita"
  | "result";
export interface StepInfo {
  kind: StepKind;
  seat: Seat | null;
  tsumogiri: boolean;
  doraReveal: boolean;
}
/** Failed rounds have one "deal" step. */
export interface StepIndex extends Bounds {
  playerCount: PlayerCount;
  info(round: number, step: number): StepInfo;
}

export type NavCommand =
  | { kind: "step"; dir: Dir }
  | { kind: "ownTurn"; dir: Dir }
  | { kind: "keyMoment"; dir: Dir }
  | { kind: "nextRound" }
  | { kind: "roundStartOrPrev" }
  | { kind: "roundStart" }
  | { kind: "roundEnd" };
export type NavSource = "user" | "repeat" | "autoplay";
export type MoveKind =
  | "init"
  | "step"
  | "repeat"
  | "jump"
  | "scrub"
  | "history"
  | "autoplay"
  | "pov";

export interface DiscardRef {
  seat: Seat;
  /** Index into that seat's DiscardView[] in the round. */
  index: number;
}
export interface DiscardInfo {
  step: number;
  decisionStep: number;
  turn: number;
  tile: Tile;
  tsumogiri: boolean;
  riichi: boolean;
  afterRiichi: boolean;
  called: boolean;
}
export interface DiscardIndex {
  get(ref: DiscardRef): DiscardInfo | undefined;
}

export interface ViewerState {
  position: Position;
  /** Always a playing seat. */
  pov: Seat;
  playing: boolean;
  /** Reset on every position change. */
  resultHidden: boolean;
  lastMove: { kind: MoveKind; dir: -1 | 0 | 1 };
  /** Sticky unseen-grid pick: spotlight + Moves filter. */
  pickedKind: number | null;
  /** Pond-tooltip pin on band 2; cleared on every position change. */
  pin: DiscardRef | null;
}
export type ViewerAction =
  | { type: "nav"; command: NavCommand; source: NavSource }
  | { type: "seek"; position: Position; kind: "jump" | "scrub" | "history"; pov?: Seat }
  | { type: "setPov"; seat: Seat }
  | { type: "cyclePov"; delta: 1 | -1 }
  | { type: "play" }
  | { type: "pause" }
  | { type: "togglePlay" }
  | { type: "hideResult" }
  | { type: "showResult" }
  | { type: "pick"; kind: number | null }
  | { type: "pin"; ref: DiscardRef | null };
/** 0-based, unclamped. */
export interface ViewerStart {
  round: number;
  step: number;
  pov: Seat | null;
}

export type PlateAid =
  /** -1 complete, 0 tenpai, n ≥ 1 shanten. */
  | { kind: "shanten"; value: number }
  | { kind: "waits"; tiles: readonly KnownTile[]; left: number; furiten: boolean };
export interface NextDiscard {
  tile: Tile;
  drawn: boolean;
}
export interface CaptionSpec {
  id: number;
  seat: Seat;
  kind: "chi" | "pon" | "kan" | "riichi" | "kita" | "ron" | "tsumo";
}
export interface MotionSpec {
  flight: {
    seat: Seat;
    index: number;
    source: "hand" | "drawn" | "opponent";
    riichi: boolean;
  } | null;
  /** Seats whose standing wall gives way to the face-up hand on this step (the round-end reveal). */
  reveal: readonly Seat[];
}

/** Persistent preferences (§5.1), stored as one versioned JSON blob; see settings/settings.ts. */
export interface Settings {
  version: 1;
  /** "3d" */
  view: View;
  /** true. Off = standing walls + frame reservation (data-walls). */
  showAllHands: boolean;
  /** true */
  dimTsumogiri: boolean;
  /** true */
  captions: boolean;
  /** true. Discard flight, riichi turn, round-end reveal. */
  motion: boolean;
  /** true. Plate aid rows. */
  showWaits: boolean;
  /** false: it shows the next move (a spoiler). */
  showNextDiscard: boolean;
  /** "system" */
  theme: Theme;
  /** true */
  clickToStep: boolean;
  /** true */
  wheelToStep: boolean;
  /** true */
  charKeys: boolean;
  /** 1 */
  autoplaySpeed: AutoplaySpeed;
  /** true (wide only). */
  panelOpen: boolean;
  /** false */
  movesOpen: boolean;
  /** false. Lists the moves after the current one in the Moves list (a spoiler). */
  movesShowRest: boolean;
  /** false */
  hintSeen: boolean;
}
export type LinkSource = { kind: "sample"; id: SampleId } | { kind: "tenhou"; logId: string };
/** Writes one <style>; no React state. */
export interface Spotlight {
  hover(kind: number | null): void;
  clear(): void;
}

// ---- A: table
export interface PlateInfo {
  seat: Seat;
  side: Side;
  name: string;
  wind: Wind;
  dealer: boolean;
  score: number;
  riichi: boolean;
  aid: PlateAid | null;
  /** Kita tiles set aside (0 when none, always 0 in four-player games); opponents show it as text. */
  kita: number;
}
export interface TableStageProps {
  game: GameLog;
  round: Round;
  state: BoardState;
  names: Quad<string>;
  pov: Seat;
  revealed: ReadonlySet<Seat>;
  view: View;
  /** = !showAllHands (frame reservation + standing walls). */
  walls: boolean;
  dimTsumogiri: boolean;
  plates: readonly PlateInfo[];
  nextDiscard: NextDiscard | null;
  /** Empty / null unless a single forward step. */
  captions: readonly CaptionSpec[];
  motion: MotionSpec;
  discards: DiscardIndex;
  spotlight: Spotlight;
  pickedKind: number | null;
  onRoundList(): void;
  onPondDwell(ref: DiscardRef | null): void;
  onPondJump(ref: DiscardRef): void;
  stageRef: Ref<HTMLElement>;
  /** FirstUseHint. */
  coach?: ReactNode;
  /** ResultCard (overlay) | Welcome. */
  overlay?: ReactNode;
}
export interface SeatZoneProps {
  side: Side;
  /** null = sanma empty chair. */
  seat: Seat | null;
  view: SeatView | null;
  name: string;
  wind: Wind | null;
  dealer: boolean;
  active: boolean;
  revealed: boolean;
  isPov: boolean;
  walled: boolean;
  highlightIndex: number;
  dimTsumogiri: boolean;
  /** -1 = none. */
  flightIndex: number;
}
export interface OwnHandProps {
  seat: Seat;
  view: SeatView;
  name: string;
  next: NextDiscard | null;
}
/** Display only: a click on a plate steps like the felt; the POV changes elsewhere. */
export interface SeatPlatesProps {
  plates: readonly PlateInfo[];
  active: Seat | null;
  pov: Seat;
}
export interface HudProps {
  doraIndicators: readonly KnownTile[];
  honba: number;
  riichiSticks: number;
  ruleLabel: string;
}

// ---- B: dock, transport, menu
export interface TransportProps {
  roundName: string;
  turn: number;
  limits: { gameStart: boolean; gameEnd: boolean; firstRound: boolean; lastRound: boolean };
  playing: boolean;
  speed: AutoplaySpeed;
  breakpoint: Breakpoint;
  /** Returns false when nothing moved. */
  onNav(command: NavCommand, source: Exclude<NavSource, "autoplay">): boolean;
  onTogglePlay(): void;
  onSpeed(speed: AutoplaySpeed): void;
  onRoundList(): void;
}
export interface StatusLineProps {
  text: string;
  quiet: boolean;
  announcement: string | null;
  counter: string;
  legend: ReactNode | null;
}
export interface BackTarget {
  /** Already localised: "E1 · turn 6". */
  label: string;
}
export interface DockProps {
  status: StatusLineProps;
  back: BackTarget | null;
  onBack(): void;
  /**
   * "Show result" in the status line, while the hidden result card would float over the table
   * (overlay mode); null otherwise. Kept off the felt, where it covered the far hand.
   */
  onShowResult: (() => void) | null;
  transport: TransportProps;
  bands: ReactNode;
  /** Viewer attaches useWheelStep here (the wheel steps over the whole dock). */
  rootRef: Ref<HTMLDivElement>;
}
export interface MoreMenuProps {
  open: boolean;
  onClose(): void;
  linkable: boolean;
  speed: AutoplaySpeed;
  showAllHands: boolean;
  view: View;
  onOpenLog(): void;
  onCopyLink(): void;
  onSpeed(s: AutoplaySpeed): void;
  onNav(c: NavCommand): void;
  onToggleHands(): void;
  onToggleView(): void;
  onSettings(): void;
  onHelp(): void;
  anchorRef: Ref<HTMLElement>;
}

// ---- C: timeline, review rail, results
export type RoundOutcome = { kind: "ron" | "tsumo"; wins: number } | { kind: "draw" } | null;
export interface RoundSummary {
  index: number;
  label: string;
  offset: number;
  steps: number;
  outcome: RoundOutcome;
  resultText: string;
  startScores: Quad<number>;
  deltas: Quad<number>;
}
export interface GameOverview {
  rounds: readonly RoundSummary[];
  totalSteps: number;
}
export type MarkKind =
  | "discard"
  | "tsumogiri"
  | "riichi"
  | "call"
  | "kan"
  | "kita"
  | "dora"
  | "end";
export interface StepMark {
  step: number;
  seat: Seat | null;
  kind: MarkKind;
}
export interface RoundMarks {
  marks: readonly StepMark[];
  riichiFrom: Partial<Record<Seat, number>>;
}
export interface PovMark {
  round: number;
  won: boolean;
  dealtIn: boolean;
  delta: number;
}
export interface TimelineProps {
  overview: GameOverview;
  position: Position;
  marks: RoundMarks;
  povMarks: readonly PovMark[];
  laneOrder: readonly Seat[];
  pov: Seat;
  names: Quad<string>;
  describe(step: number): string;
  turnOf(step: number): number;
  pin: { ref: DiscardRef; step: number; label: string } | null;
  onPinJump(): void;
  onSeek(p: Position, kind: "jump" | "scrub"): void;
  onScrubEnd(): void;
}
export interface PlayerRow {
  seat: Seat;
  name: string;
  /** Already localised (rankLabel); dropped first when the row is narrow. */
  rank: string | null;
  /** Already localised (viewer.rating, e.g. "R1850"); dropped after the rank. */
  rating: string | null;
  wind: Wind;
  dealer: boolean;
  riichi: boolean;
  score: number;
  place: number;
}
export type MatrixRole = "win" | "dealin" | "tenpai" | null;
export interface MatrixCell {
  delta: number;
  role: MatrixRole;
  riichi: boolean;
  target: Position;
}
export interface MatrixRow {
  round: number;
  label: string;
  outcome: RoundOutcome;
  start: Position;
  cells: Partial<Record<Seat, MatrixCell>>;
}
export type MoveNote =
  | "draw"
  | "discard"
  | "tsumogiri"
  | "riichi"
  | "called"
  | "chi"
  | "pon"
  | "kan"
  | "kita"
  | "tsumo"
  | "ron"
  | "drawEnd";
export interface MoveRow {
  step: number;
  target: Position;
  turn: number;
  seat: Seat | null;
  tile: Tile | null;
  kind: number | null;
  notes: readonly MoveNote[];
}
export interface RiichiLine {
  seat: Seat;
  turn: number;
  waits: readonly KnownTile[];
  left: number | null;
  winner: boolean;
}
export interface ReviewPanelProps {
  mode: PanelMode;
  open: boolean;
  onClose(): void;
  title: string;
  source: string;
  /** Docked ResultCard or null. */
  result: ReactNode | null;
  players: readonly PlayerRow[];
  onPov(seat: Seat): void;
  pov: Seat;
  povName: string;
  unseen: Uint8Array;
  playerCount: PlayerCount;
  doraKinds: ReadonlySet<number>;
  picked: number | null;
  onPick(kind: number | null): void;
  spotlight: Spotlight;
  series: readonly number[][];
  seats: readonly Seat[];
  names: Quad<string>;
  matrix: readonly MatrixRow[];
  final: Quad<number>;
  currentRound: number;
  currentRowRef: Ref<HTMLTableRowElement>;
  moves: readonly MoveRow[];
  currentStep: number;
  movesOpen: boolean;
  onMovesOpen(open: boolean): void;
  /** Off: the Moves list stops at the current step and offers the rest behind a toggle. */
  movesShowRest: boolean;
  onMovesShowRest(show: boolean): void;
  /** Every jump from the rail (history entry). */
  onSeek(p: Position): void;
}
export interface ResultCardProps {
  results: ReadonlyArray<WinEvent | RyukyokuEvent>;
  seats: Quad<SeatView>;
  names: Quad<string>;
  playerCount: PlayerCount;
  /** Non-null only at the game's last result. */
  final: Quad<number> | null;
  startScores: Quad<number>;
  riichiLines: readonly RiichiLine[];
  drawWaits: Partial<Record<Seat, readonly KnownTile[]>>;
  mode: "docked" | "overlay";
  onHide(): void;
  onNextRound(): void;
}

// ---- D: shell
export interface StageToolsProps {
  breakpoint: Breakpoint;
  showAllHands: boolean;
  view: View;
  panelOpen: boolean;
  linkable: boolean;
  /** The seat menu (the toolbar's POV control) lists these rows, one per playing seat. */
  players: readonly PlayerRow[];
  pov: Seat;
  onPov(seat: Seat): void;
  onOpenLog(): void;
  onCopyLink(): void;
  onToggleHands(): void;
  onToggleView(): void;
  onSettings(): void;
  onHelp(): void;
  onTogglePanel(): void;
  /** The id of the review rail (or its sheet), for the Review panel button's aria-controls. */
  panelId: string;
  /**
   * Renders the ⋯ menu (MoreMenu) where the ⋯ button shows (phones). The toolbar owns whether it
   * is open, so it passes that state in; MoreMenu takes the same three props.
   */
  menu(slot: MoreMenuSlot): ReactNode;
}
/** The ⋯ menu's state as StageTools hands it to `menu`. */
export interface MoreMenuSlot {
  open: boolean;
  onClose(): void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}
export interface WelcomeProps {
  loading: boolean;
  error: ReactNode | null;
  onOpenFile(file: File): void;
  onPaste(): void;
  onSample(id: SampleId): void;
  onDismiss(): void;
}
export interface FirstUseHintProps {
  pointer: "mouse" | "touch";
  compact: boolean;
  onDismiss(): void;
}
/** "open": the toolbar's Open action (file, paste, samples, with drop and paste anywhere). */
export type DialogName = "settings" | "help" | "paste" | "open";
export interface SettingsContextValue {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  reset(): void;
  openDialog(dialog: DialogName): void;
}
