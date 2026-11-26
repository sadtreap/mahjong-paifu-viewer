import { type CSSProperties, memo } from "react";
import type { Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { sideOf } from "../layout";
import type { CaptionSpec } from "../viewer/types";
import styles from "./CallCaption.module.css";
import { CAPTION_X, captionSlots } from "./geometry";

export interface CallCaptionProps {
  captions: readonly CaptionSpec[];
  pov: Seat;
}

/**
 * Call captions (Chi, Pon, Kan, Riichi, Kita, Ron, Tsumo) on the console, in one of its two strips
 * without text (geometry.ts captionSlots): a heavy oblique title on an opaque band that slides in
 * from the caller's side, pops and fades in 700 ms. Decoration only: hidden from screen readers
 * (the status line announces the step) and never in the pointer's way.
 */
export const CallCaption = memo(function CallCaption({ captions, pov }: CallCaptionProps) {
  const { m } = useI18n();
  if (captions.length === 0) {
    return null;
  }
  const placed = captions.map((caption) => ({ caption, side: sideOf(caption.seat, pov) }));
  const slots = captionSlots(placed.map(({ side }) => side));
  return (
    <div className={styles.captions} aria-hidden="true">
      {placed.map(({ caption, side }, index) => {
        const y = slots[index] ?? 10;
        const win = caption.kind === "ron" || caption.kind === "tsumo";
        return (
          <div
            key={caption.id}
            className={cx(styles.caption, win && styles.win)}
            data-side={side}
            style={{ "--X": String(CAPTION_X), "--Y": String(y) } as CSSProperties}
          >
            {m.captions[caption.kind]}
          </div>
        );
      })}
    </div>
  );
});
