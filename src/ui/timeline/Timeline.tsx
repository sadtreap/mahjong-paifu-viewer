import type { TimelineProps } from "../viewer/types";
import { GameBand } from "./GameBand";
import { RoundBand } from "./RoundBand";
import styles from "./Timeline.module.css";

/**
 * The dock's two bands: band 1 is the whole game, band 2 the current round's swimlanes over the
 * step slider. Every seek goes through `onSeek` ("jump" for a press on band 1, "scrub" while
 * dragging or moving the slider); `onScrubEnd` follows a scrub once the pointer or key is released.
 */
export function Timeline({
  overview,
  position,
  marks,
  povMarks,
  laneOrder,
  pov,
  names,
  describe,
  turnOf,
  pin,
  onPinJump,
  onSeek,
  onScrubEnd,
}: TimelineProps) {
  const steps = Math.max(1, overview.rounds[position.round]?.steps ?? 1);
  return (
    <div className={styles.bands}>
      <GameBand
        overview={overview}
        position={position}
        povMarks={povMarks}
        onSeek={onSeek}
        onScrubEnd={onScrubEnd}
      />
      <RoundBand
        round={position.round}
        steps={steps}
        position={position}
        marks={marks}
        laneOrder={laneOrder}
        pov={pov}
        names={names}
        describe={describe}
        turnOf={turnOf}
        pin={pin}
        onPinJump={onPinJump}
        onSeek={onSeek}
        onScrubEnd={onScrubEnd}
      />
    </div>
  );
}
