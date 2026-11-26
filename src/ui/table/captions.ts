import type { Round, RoundEvent } from "../../core/model";
import type { BoardState } from "../../replay/types";
import type { AutoplaySpeed, CaptionSpec, ViewerState } from "../viewer/types";

/** Captions and motion run only after a single forward step (autoplay up to 2×). */
export function isSingleForwardStep(
  lastMove: ViewerState["lastMove"],
  speed: AutoplaySpeed,
): boolean {
  if (lastMove.dir !== 1) {
    return false;
  }
  return lastMove.kind === "step" || (lastMove.kind === "autoplay" && speed <= 2);
}

/** The events a step applied, from its main event to its last one (folded events included). */
export function stepEvents(round: Round, state: BoardState): RoundEvent[] {
  if (state.eventIndex < 0) {
    return [];
  }
  let first = state.eventIndex;
  // Folded dora and riichiAccepted belong to the event before them; multiple ron share a step.
  while (first > 0) {
    const event = round.events[first];
    const before = round.events[first - 1];
    const folds =
      event?.type === "dora" ||
      event?.type === "riichiAccepted" ||
      (event?.type === "win" && before?.type === "win");
    if (!folds) {
      break;
    }
    first--;
  }
  return round.events.slice(first, state.eventIndex + 1);
}

/**
 * Call captions for a step (Chi, Pon, Kan, Riichi, Kita, Ron, Tsumo; one per winner), only after a
 * single forward step and never at 4× autoplay. Ids are unique per step, so a caption replays when
 * its step is reached again after leaving it.
 */
export function captionsFor(
  round: Round,
  state: BoardState,
  lastMove: ViewerState["lastMove"],
  speed: AutoplaySpeed,
): CaptionSpec[] {
  if (!isSingleForwardStep(lastMove, speed)) {
    return [];
  }
  const captions: CaptionSpec[] = [];
  const add = (seat: CaptionSpec["seat"], kind: CaptionSpec["kind"]) => {
    captions.push({ id: state.eventIndex * 8 + captions.length, seat, kind });
  };
  for (const event of stepEvents(round, state)) {
    switch (event.type) {
      case "chi":
      case "pon":
        add(event.seat, event.type);
        break;
      case "daiminkan":
      case "ankan":
      case "kakan":
        add(event.seat, "kan");
        break;
      case "kita":
        add(event.seat, "kita");
        break;
      case "discard":
        if (event.riichi) {
          add(event.seat, "riichi");
        }
        break;
      case "win":
        add(event.seat, event.from === event.seat ? "tsumo" : "ron");
        break;
      default:
        break;
    }
  }
  return captions;
}
