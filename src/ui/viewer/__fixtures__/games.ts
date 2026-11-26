import type { GameLog, Round } from "../../../core/model";
import {
  discard,
  draw,
  makeGame,
  makeRound,
  makeSanmaGame,
  sampleRound,
  sampleSanmaRound,
  win,
} from "../../../test/round-builder";
import { buildTimeline } from "../../../replay/timeline";
import { createTimelineCache } from "../../timelineCache";
import { createStepIndex } from "../stepIndex";
import type { StepIndex } from "../types";

/**
 * Step map of `sampleRound()` (25 steps): 0 deal; 1 draw S0; 2 discard; 3 chi S1; 4 discard;
 * 5 pon S3; 6 discard; 7 draw S0; 8 riichi S0; 9 draw S1; 10 tsumogiri; 11 daiminkan S2;
 * 12 draw S2 (rinshan); 13 discard + dora; 14 draw S3; 15 kakan S3; 16 draw S3; 17 tsumogiri +
 * dora; 18 draw S0; 19 ankan S0 + dora; 20 draw S0; 21 tsumogiri; 22 draw S1; 23 tsumogiri;
 * 24 ron (result).
 */
export const SAMPLE_STEPS = 25;

/**
 * Step map of `sampleSanmaRound()` (24 steps): 1 draw S0; 2 kita S0; 3 draw S0; 4 tsumogiri;
 * 5 draw S1; 6 kita S1; 7 draw S1; 8 tsumogiri; 9 draw S2; 10 tsumogiri; 11 pon S0; 12 discard;
 * 13 draw S1; 14 riichi S1; 15 draw S2; 16 tsumogiri; 17 draw S0; 18 ankan S0 + dora;
 * 19 draw S0 (rinshan); 20 tsumogiri; 21 draw S1; 22 kita S1; 23 ron on the North (result).
 */
export const SANMA_STEPS = 24;

/** A double ron: 0 deal, 1 draw, 2 discard, 3 both wins (one step). */
export function doubleRonRound(): Round {
  return makeRound({
    events: [
      draw(0, "4z"),
      discard(0, "4z", { tsumogiri: true }),
      win(1, 0, [-8000, 4000, 4000, 0]),
      win(2, 0, [-8000, 4000, 4000, 0]),
    ],
  });
}

/** Three four-player rounds: sampleRound, sampleRound, and the double ron (4 steps). */
export function fourPlayerGame(): GameLog {
  return makeGame([sampleRound(), sampleRound(), doubleRonRound()]);
}

/** Two three-player rounds of sampleSanmaRound. */
export function sanmaGame(): GameLog {
  return makeSanmaGame([sampleSanmaRound(), sampleSanmaRound()]);
}

/** The step index of a game; `failing` rounds fail to replay (one "deal" step each). */
export function stepIndexOf(game: GameLog, failing: readonly number[] = []): StepIndex {
  const timelines = createTimelineCache(game.rounds, game.playerCount, (round) => {
    if (failing.includes(game.rounds.indexOf(round))) {
      throw new Error("broken round");
    }
    return buildTimeline(round, game.playerCount);
  });
  return createStepIndex(game, timelines);
}
