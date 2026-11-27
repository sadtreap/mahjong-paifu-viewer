/**
 * Contract types shared by the viewer's parts (table, controls, result card, shell): the viewer
 * state and its actions, the settings blob, and the props the parts are wired with.
 */
import type { ReactNode, Ref } from "react";
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
import type { KnownTile } from "../../core/tile";
import type { BoardState, SeatView } from "../../replay/types";
import type { Bounds, Position } from "../navigation";
import type { SampleId } from "../samples";

export type Dir = 1 | -1;
export type View = "3d" | "flat";
export type AutoplaySpeed = 0.5 | 1 | 2 | 4;
export type Side = "bottom" | "right" | "top" | "left";
/** The page's three arrangements; see arrangement.ts for the media queries that pick one. */
export type Arrangement = "wide" | "short" | "stack";

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
}
/** Failed rounds have one "deal" step. */
export interface StepIndex extends Bounds {
  playerCount: PlayerCount;
  info(round: number, step: number): StepInfo;
}

export type NavCommand =
  | { kind: "step"; dir: Dir }
  | { kind: "ownTurn"; dir: Dir }
  | { kind: "nextRound" }
  | { kind: "roundStartOrPrev" }
  | { kind: "roundStart" }
  | { kind: "roundEnd" };
/**
 * Where a navigation comes from: a fresh single input ("user": it crosses round ends), a held,
 * auto-repeated or burst input ("repeat": it stops at a round's last step and at step 0), or
 * autoplay.
 */
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
export interface DiscardIndex {
  /**
   * The step before the pond tile's discard, where the player held the tile and chose; undefined
   * when the round has no such pond tile.
   */
  decisionStep(ref: DiscardRef): number | undefined;
}

/**
 * The result card at a round's last step: shown, due (it comes up after a moment, once the win has
 * been seen) or hidden ("Show table"). Every position change sets it to shown or due.
 */
export type ResultCardState = "shown" | "due" | "hidden";
export interface ViewerState {
  position: Position;
  /** Always a playing seat. */
  pov: Seat;
  playing: boolean;
  resultCard: ResultCardState;
  lastMove: { kind: MoveKind; dir: -1 | 0 | 1 };
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
  | { type: "showResult" };
/** 0-based, unclamped. */
export interface ViewerStart {
  round: number;
  step: number;
  pov: Seat | null;
}

/** The waits and shanten aid of one seat, shown next to the player's name. */
export type SeatAid =
  /** -1 complete, 0 tenpai, n ≥ 1 shanten. */
  | { kind: "shanten"; value: number }
  | { kind: "waits"; tiles: readonly KnownTile[]; left: number; furiten: boolean };
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

/** Persistent preferences, stored as one versioned JSON blob; see settings/settings.ts. */
export interface Settings {
  version: 2;
  view: View;
  /** Off: opponents' hands stay hidden (standing walls on the 3D table). */
  showAllHands: boolean;
  /** The waits and shanten aid next to each player. */
  showWaits: boolean;
  /** Single-key shortcuts: letters, digits, punctuation and Space. */
  charKeys: boolean;
  autoplaySpeed: AutoplaySpeed;
}
export type LinkSource = { kind: "sample"; id: SampleId } | { kind: "tenhou"; logId: string };
/** Writes one <style>; no React state. */
export interface Spotlight {
  hover(kind: number | null): void;
  clear(): void;
}

// ---- table
/** What the table shows next to one playing seat. */
export interface SeatTagInfo {
  seat: Seat;
  side: Side;
  name: string;
  wind: Wind;
  dealer: boolean;
  score: number;
  riichi: boolean;
  aid: SeatAid | null;
}
export interface TableStageProps {
  game: GameLog;
  round: Round;
  state: BoardState;
  names: Quad<string>;
  pov: Seat;
  revealed: ReadonlySet<Seat>;
  view: View;
  /** Picks the camera: "stack" has its own; "wide" and "short" share one. */
  arrangement: Arrangement;
  /** = !showAllHands: the opponents' hidden hands stand as walls. */
  walls: boolean;
  tags: readonly SeatTagInfo[];
  /** Empty unless a single forward step. */
  captions: readonly CaptionSpec[];
  motion: MotionSpec;
  spotlight: Spotlight;
  /** Alt+click on a discard. */
  onPondJump(ref: DiscardRef): void;
  stageRef: Ref<HTMLElement>;
  /** The console shows the other players' scores as differences from the viewed player. */
  scoreDiff: boolean;
  onToggleScoreDiff(): void;
  /**
   * The transport bar ("wide" only), in a slot centred on the felt strip between the viewed
   * player's pond and hand. The slot ignores stage gestures.
   */
  dock?: ReactNode;
  /**
   * The result card's layer, in a slot above everything else in the stage. The slot ignores stage
   * gestures; its box is the stage down to the dock slot, raised by `--overlay-rise`.
   */
  overlay?: ReactNode;
}
export interface SeatZoneProps {
  side: Side;
  /** null = sanma empty chair. */
  seat: Seat | null;
  view: SeatView | null;
  name: string;
  revealed: boolean;
  isPov: boolean;
  walled: boolean;
  highlightIndex: number;
  /** -1 = none. */
  flightIndex: number;
}
export interface OwnHandProps {
  seat: Seat;
  view: SeatView;
  name: string;
}

// ---- controls
/** The viewer's popovers; at most one is open. */
export type PopoverName = "pov" | "menu" | "rounds";
/** One playing seat at a step: a row of the point-of-view menu, which doubles as the scoreboard. */
export interface PlayerRow {
  seat: Seat;
  name: string;
  wind: Wind;
  score: number;
}
export interface PovMenuProps {
  /** One row per playing seat, in seat order. */
  players: readonly PlayerRow[];
  pov: Seat;
  onPov(seat: Seat): void;
  open: boolean;
  onOpenChange(open: boolean): void;
}
export interface AppMenuProps {
  /** A sample or a Tenhou log: the menu lists "Copy link to this moment". */
  linkable: boolean;
  onOpenLog(): void;
  onCopyLink(): void;
  onSettings(): void;
  onHelp(): void;
  open: boolean;
  onOpenChange(open: boolean): void;
}
export interface ToolbarProps
  extends Omit<PovMenuProps, "open" | "onOpenChange">,
    Omit<AppMenuProps, "open" | "onOpenChange"> {
  showAllHands: boolean;
  onToggleHands(): void;
  /** Which of the toolbar's two menus is open. */
  popover: PopoverName | null;
  onPopover(popover: PopoverName | null): void;
}
export interface InfoChipProps {
  /** The revealed indicators only. */
  doraIndicators: readonly KnownTile[];
  honba: number;
  /** Riichi deposits on the table. */
  deposits: number;
}
export interface ScrubberProps {
  /** Round index and its step count (at least 1). */
  round: number;
  steps: number;
  /** The current step (0-based). */
  step: number;
  /** The step's description for the value text; it must follow the reveal rule (no hidden draws). */
  describe(step: number): string;
  turnOf(step: number): number;
  onSeek(position: Position, kind: "scrub"): void;
}
/** How a round ended: its wins (several for a multiple ron), or a draw; null with no result. */
export type RoundOutcome =
  | {
      kind: "win";
      /** `from` is the winner's own seat for a tsumo. */
      wins: readonly { seat: Seat; from: Seat; points: number | undefined }[];
    }
  | { kind: "draw" }
  | null;
/** One round of the game, for the round list. */
export interface RoundSummary {
  index: number;
  wind: Wind;
  number: number;
  honba: number;
  outcome: RoundOutcome;
  /** The point changes of all of the round's results together. */
  deltas: Quad<number>;
}
export interface RoundListProps {
  rounds: readonly RoundSummary[];
  /** Index of the round on the table. */
  current: number;
  names: Quad<string>;
  /** The list shows this player's point change in each round. */
  pov: Seat;
  /** Jumps to a round's start. */
  onRound(index: number): void;
  /** Jumps to the game's last step. */
  onFinal(): void;
  open: boolean;
  onOpenChange(open: boolean): void;
}
export interface TransportProps {
  /** Where the transport sits: a bar on the felt, rows in the side column, or the bottom block. */
  arrangement: Arrangement;
  turn: number;
  limits: { gameStart: boolean; gameEnd: boolean; lastRound: boolean };
  playing: boolean;
  speed: AutoplaySpeed;
  /** Returns false when nothing moved. */
  onNav(command: NavCommand, source: Exclude<NavSource, "autoplay">): boolean;
  onTogglePlay(): void;
  onSpeed(speed: AutoplaySpeed): void;
  /** Shows the hidden result card again; null while there is no hidden card. */
  onShowResult: (() => void) | null;
  scrubber: ScrubberProps;
  roundList: RoundListProps;
  /** The viewer attaches wheel stepping here. */
  rootRef: Ref<HTMLDivElement>;
}
export interface LiveStatusProps {
  /** What the current step shows, in words. */
  text: string;
  /** Steps are flying by (autoplay, a hold, a wheel burst, a scrub): they are not read out. */
  quiet: boolean;
  /**
   * A message that takes the text's place and is read out even while quiet. A new `id` reads the
   * same words out again.
   */
  announcement: { id: number; text: string } | null;
}

// ---- result card
export interface ResultCardProps {
  results: ReadonlyArray<WinEvent | RyukyokuEvent>;
  /** The seats at the result step, with the hands the result reveals. */
  seats: Quad<SeatView>;
  names: Quad<string>;
  playerCount: PlayerCount;
  /** Non-null only at the game's last result. */
  final: Quad<number> | null;
  /** The waits of each tenpai seat at a draw. */
  drawWaits: Partial<Record<Seat, readonly KnownTile[]>>;
  doraIndicators: readonly KnownTile[];
  onHide(): void;
  onNextRound(): void;
}

// ---- shell
/** The app's dialogs: the load form ("open"), the settings and the controls ("help"). */
export type DialogName = "settings" | "help" | "open";
export interface SettingsContextValue {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  reset(): void;
  openDialog(dialog: DialogName): void;
}
