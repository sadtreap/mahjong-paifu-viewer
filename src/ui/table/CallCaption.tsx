import { type CSSProperties, memo, useEffect, useState } from "react";
import type { Seat } from "../../core/model";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { sideOf } from "../layout";
import type { CaptionSpec } from "../viewer/types";
import styles from "./CallCaption.module.css";
import { type Camera, captionAnchor } from "./geometry";

/** How long a caption stays. */
export const CAPTION_MS = 700;

export interface CallCaptionProps {
  captions: readonly CaptionSpec[];
  pov: Seat;
  camera: Camera;
}

/**
 * Call captions (Chi, Pon, Kan, Riichi, Kita, Ron, Tsumo): a short label over the middle of the
 * caller's pond, gone after CAPTION_MS. Flat DOM above the plane, so it reads the same from every
 * seat. Decoration only: hidden from screen readers (the viewer announces the step) and never in
 * the pointer's way. A timer removes it, so it also goes away where animations are off.
 */
export const CallCaption = memo(function CallCaption({ captions, pov, camera }: CallCaptionProps) {
  const { m } = useI18n();
  const shown = captions.map((caption) => caption.id).join(",");
  const [gone, setGone] = useState("");
  useEffect(() => {
    if (shown === "") {
      return;
    }
    const timer = window.setTimeout(() => setGone(shown), CAPTION_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);
  if (shown === "" || gone === shown) {
    return null;
  }
  return (
    <div className={styles.captions} aria-hidden="true">
      {captions.map((caption) => {
        const side = sideOf(caption.seat, pov);
        const at = captionAnchor(side, camera);
        const win = caption.kind === "ron" || caption.kind === "tsumo";
        return (
          <div
            key={caption.id}
            className={cx(styles.caption, win && styles.win)}
            data-side={side}
            style={{ "--ax": at.x.toFixed(5), "--ay": at.y.toFixed(5) } as CSSProperties}
          >
            {m.captions[caption.kind]}
          </div>
        );
      })}
    </div>
  );
});
