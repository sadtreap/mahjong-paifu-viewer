import { createRef } from "react";
import type { GameLog, Quad, Round, Seat } from "../../../core/model";
import { SEATS } from "../../../core/model";
import type { BoardState } from "../../../replay/types";
import type { SeatAid, Spotlight, TableStageProps } from "../../viewer/types";
import { seatInfoFor } from "../seatInfo";

export const noSpotlight: Spotlight = { hover() {}, clear() {} };

export interface StagePropsInput {
  game: GameLog;
  round: Round;
  state: BoardState;
  names: Quad<string>;
  pov?: Seat;
  aid?: (seat: Seat) => SeatAid | null;
}

/**
 * TableStage props for a table state: every hand face up, nothing moving, no captions and no-op
 * callbacks (override what a test checks). The seats are those of `pov`, so pass the point of view
 * here and not only as an override.
 */
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
    seats: seatInfoFor({
      playerCount: game.playerCount,
      dealer: round.dealer,
      seats: state.seats,
      names,
      pov,
      aid,
    }),
    captions: [],
    motion: { landing: null },
    spotlight: noSpotlight,
    onPondJump() {},
    stageRef: createRef<HTMLElement>(),
    scoreDiff: false,
    onToggleScoreDiff() {},
    ...overrides,
  };
}
