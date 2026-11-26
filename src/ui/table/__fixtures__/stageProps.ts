import { createRef } from "react";
import type { GameLog, Quad, Round, Seat } from "../../../core/model";
import { SEATS } from "../../../core/model";
import type { BoardState } from "../../../replay/types";
import type {
  DiscardIndex,
  DiscardInfo,
  PlateAid,
  Spotlight,
  TableStageProps,
} from "../../viewer/types";
import { platesFor } from "../geometry";

/** A discard index that knows every pond tile of `state` (turn = index + 1). */
export function discardIndexOf(state: BoardState): DiscardIndex {
  return {
    get(ref) {
      const discard = state.seats[ref.seat].discards[ref.index];
      if (discard === undefined) {
        return undefined;
      }
      const info: DiscardInfo = {
        step: 1,
        decisionStep: 0,
        turn: ref.index + 1,
        tile: discard.tile,
        tsumogiri: discard.tsumogiri,
        riichi: discard.riichi,
        afterRiichi: false,
        called: discard.called,
      };
      return info;
    },
  };
}

export const noSpotlight: Spotlight = { hover() {}, clear() {} };

export interface StagePropsInput {
  game: GameLog;
  round: Round;
  state: BoardState;
  names: Quad<string>;
  pov?: Seat;
  aid?: (seat: Seat) => PlateAid | null;
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
    walls: false,
    dimTsumogiri: true,
    plates: platesFor({
      playerCount: game.playerCount,
      dealer: round.dealer,
      seats: state.seats,
      names,
      pov,
      aid,
    }),
    nextDiscard: null,
    captions: [],
    motion: { flight: null, reveal: [] },
    discards: discardIndexOf(state),
    spotlight: noSpotlight,
    pickedKind: null,
    onRoundList() {},
    onPondDwell() {},
    onPondJump() {},
    stageRef: createRef<HTMLElement>(),
    ...overrides,
  };
}
