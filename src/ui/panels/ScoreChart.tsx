import { type CSSProperties, memo } from "react";
import type { Quad, Seat } from "../../core/model";
import styles from "./ScoreChart.module.css";

export interface ScoreChartProps {
  /** Per seat of `seats`: the score at each round start, then after the game (scoreSeries). */
  series: readonly number[][];
  seats: readonly Seat[];
  names: Quad<string>;
  /** Shaded: the round being viewed (between its start and the next point). */
  currentRound: number;
}

/** Dash pattern per seat, so the lines differ by more than colour. */
const DASHES: Record<Seat, string | undefined> = { 0: undefined, 1: "6 3", 2: "2 3", 3: "8 3 2 3" };

const WIDTH = 300;
const HEIGHT = 100;
const LINE_END = 270;
const LABEL_GAP = 11;

/**
 * The score of each playing seat over the game: a line per seat in its colour and dash pattern,
 * the round being viewed shaded, the seats' initials at the line ends (kept 11 units apart).
 * Decorative: the round matrix below has the same numbers.
 */
export const ScoreChart = memo(function ScoreChart({
  series,
  seats,
  names,
  currentRound,
}: ScoreChartProps) {
  const points = series[0]?.length ?? 0;
  if (points < 2) {
    return null;
  }
  const values = series.flat();
  const low = Math.min(...values) - 2000;
  const high = Math.max(...values) + 2000;
  const y = (value: number) => 94 - ((value - low) / (high - low)) * 88;
  const x = (index: number) => 6 + index * ((LINE_END - 6) / (points - 1));
  const ends = seats
    .map((seat, index) => ({ seat, y: y(series[index]?.[points - 1] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    const previous = ends[i - 1] as { y: number };
    const end = ends[i] as { y: number };
    end.y = Math.max(end.y, previous.y + LABEL_GAP);
  }
  const shadeFrom = Math.min(Math.max(currentRound, 0), points - 2);
  return (
    <div className={styles.chart} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        focusable="false"
        aria-hidden="true"
      >
        <rect
          className={styles.shade}
          x={x(shadeFrom)}
          width={x(shadeFrom + 1) - x(shadeFrom)}
          y={0}
          height={HEIGHT}
        />
        {seats.map((seat, index) => (
          <polyline
            key={seat}
            className={styles.line}
            points={(series[index] ?? []).map((value, i) => `${x(i)},${y(value)}`).join(" ")}
            style={{ "--line": `var(--seat-${seat})` } as CSSProperties}
            strokeDasharray={DASHES[seat]}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {ends.map(({ seat, y: top }) => (
        <span
          key={seat}
          className={styles.label}
          style={{ top: `${top}%`, color: `var(--seat-${seat})` } as CSSProperties}
        >
          {Array.from(names[seat])[0] ?? ""}
        </span>
      ))}
    </div>
  );
});
