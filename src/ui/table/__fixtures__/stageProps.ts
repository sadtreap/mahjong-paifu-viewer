import { createRef } from "react";
import type { GameLog, Quad, Round, Seat } from "../../../core/model";
import { SEATS } from "../../../core/model";
import type { BoardState } from "../../../replay/types";
import type { SeatAid, Spotlight, TableStageProps } from "../../viewer/types";
import { seatTagsFor } from "../seatTagInfo";

export const noSpotlight: Spotlight = { hover() {}, clear() {} };

export interface StagePropsInput {
  game: GameLog;
  round: Round;
  state: BoardState;
  names: Quad<string>;
  pov?: Seat;
  aid?: (seat: Seat) => SeatAid | null;
}

/** TableStage props for a table state, with no-op callbacks (override what a test checks). */
export function stageProps(
  { game, round, state, names, pov = 0, aid = () => null }: StagePropsInput,
  overrides: Partial<TableStageProps> = {},
): TableStageProps {
  return {
    game,
    round,
    state,
    names,
    pov,
    revealed: new Set(SEATS),
    view: "3d",
    arrangement: "wide",
    walls: false,
    tags: seatTagsFor({
      playerCount: game.playerCount,
      dealer: round.dealer,
      seats: state.seats,
      names,
      pov,
      aid,
    }),
    captions: [],
    motion: { flight: null, reveal: [] },
    spotlight: noSpotlight,
    onPondJump() {},
    stageRef: createRef<HTMLElement>(),
    scoreDiff: false,
    onToggleScoreDiff() {},
    ...overrides,
  };
}
