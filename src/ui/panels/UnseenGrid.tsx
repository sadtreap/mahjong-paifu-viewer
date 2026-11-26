import { memo, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import type { PlayerCount } from "../../core/model";
import { SANMA_UNUSED_KINDS } from "../../core/players";
import { tileFromKind } from "../../core/tile";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { tileLabel } from "../labels";
import { TileImage } from "../TileImage";
import type { Spotlight } from "../viewer/types";
import styles from "./UnseenGrid.module.css";

export interface UnseenGridProps {
  povName: string;
  /** 34 kinds: the tiles the POV cannot see (unseenCounts). */
  unseen: Uint8Array;
  playerCount: PlayerCount;
  doraKinds: ReadonlySet<number>;
  /** The sticky pick: its spotlight stays on and it filters the Moves list. */
  picked: number | null;
  onPick(kind: number | null): void;
  spotlight: Spotlight;
}

/** Rows of the grid: the suits and the honours, without 2m-8m with three players. */
function rows(playerCount: PlayerCount): number[][] {
  const range = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => from + i).filter(
      (kind) => playerCount === 4 || !SANMA_UNUSED_KINDS.has(kind),
    );
  return [range(0, 9), range(9, 18), range(18, 27), range(27, 34)];
}

interface CellProps {
  kind: number;
  n: number;
  dora: boolean;
  pressed: boolean;
  onPick(kind: number | null): void;
  spotlight: Spotlight;
}

/** One kind: re-renders only when its count, dora mark or pick changes. */
const UnseenCell = memo(function UnseenCell({
  kind,
  n,
  dora,
  pressed,
  onPick,
  spotlight,
}: CellProps) {
  const { m } = useI18n();
  const tile = tileFromKind(kind);
  const hover = (event: ReactPointerEvent, value: number | null) => {
    if (event.pointerType === "mouse") {
      spotlight.hover(value);
    }
  };
  return (
    <button
      type="button"
      className={cx(styles.cell, dora && styles.dora)}
      data-n={n}
      data-kind={kind}
      aria-pressed={pressed}
      aria-label={m.panel.unseenCell(tileLabel(m, tile), n, dora)}
      onClick={() => onPick(pressed ? null : kind)}
      onPointerEnter={(event) => hover(event, kind)}
      onPointerLeave={(event) => hover(event, null)}
      onFocus={() => spotlight.hover(kind)}
      onBlur={() => spotlight.hover(null)}
    >
      <TileImage tile={tile} label="" />
      <span className={styles.count} aria-hidden="true">
        {n}
      </span>
    </button>
  );
});

/**
 * The tiles the POV has not seen, per kind (its own hand and every public tile count as seen;
 * other hands never do). Pointing at a cell spotlights that kind on the table; a click pins it
 * (aria-pressed), keeping the spotlight while stepping and filtering the Moves list.
 */
export function UnseenGrid({
  povName,
  unseen,
  playerCount,
  doraKinds,
  picked,
  onPick,
  spotlight,
}: UnseenGridProps) {
  const { m } = useI18n();
  const total = unseen.reduce((sum, n) => sum + n, 0);
  const cells: ReactNode[] = [];
  for (const [row, kinds] of rows(playerCount).entries()) {
    for (const kind of kinds) {
      cells.push(
        <UnseenCell
          key={kind}
          kind={kind}
          n={unseen[kind] ?? 0}
          dora={doraKinds.has(kind)}
          pressed={picked === kind}
          onPick={onPick}
          spotlight={spotlight}
        />,
      );
    }
    if (row === 0 && kinds.length < 9) {
      cells.push(<span key="gap-man" className={styles.gap7} />);
    }
  }
  cells.push(<span key="gap-honors" className={styles.gap2} />);
  return (
    <section className={styles.section} aria-label={m.panel.unseen(povName)}>
      <h3 className={styles.heading}>
        <span>{m.panel.unseen(povName)}</span>
        <span className={styles.total}>{m.panel.unseenTotal(total)}</span>
      </h3>
      <div className={styles.grid}>{cells}</div>
    </section>
  );
}
