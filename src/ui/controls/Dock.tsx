import { useI18n } from "../../i18n/context";
import type { DockProps } from "../viewer/types";
import { BackChip } from "./BackChip";
import styles from "./Dock.module.css";
import { ShowResultChip } from "./ShowResultChip";
import { StatusLine } from "./StatusLine";
import { Transport } from "./Transport";

/**
 * The block under the stage (SPEC §4.1): the status line (the viewer's only live region) with
 * the "Show result" and back chips, the timeline bands, and the transport. `rootRef` is where the viewer attaches
 * wheel stepping. On phones in landscape the dock dissolves (display: contents) and its three
 * parts take the player grid's `status`, `bands` and `nav` areas.
 */
export function Dock({ status, back, onBack, onShowResult, transport, bands, rootRef }: DockProps) {
  const { m } = useI18n();
  return (
    <div className={styles.dock} ref={rootRef}>
      <StatusLine
        {...status}
        prefix={m.transport.turnPrefix(transport.turn)}
        result={onShowResult ? <ShowResultChip onShowResult={onShowResult} /> : null}
        back={back ? <BackChip target={back} onBack={onBack} /> : null}
      />
      <div className={styles.bands}>{bands}</div>
      <Transport {...transport} />
    </div>
  );
}
