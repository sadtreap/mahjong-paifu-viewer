/**
 * How a path is painted: "stroke" draws its outline (the default), "fill" fills it, and "solid"
 * does both, which rounds the corners of small filled shapes.
 */
type Paint = "stroke" | "fill" | "solid";
type Part = readonly [d: string, paint?: Paint];

/** Path data from a template, with the numbers rounded to 3 decimals (no 4.299999999999999). */
const path = (strings: TemplateStringsArray, ...values: number[]) =>
  strings.reduce(
    (d, text, index) =>
      index === 0 ? text : `${d}${Math.round((values[index - 1] ?? 0) * 1000) / 1000}${text}`,
    "",
  );

/** A circle as path data, so every icon is a list of paths. */
const circle = (cx: number, cy: number, r: number) =>
  path`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/**
 * Original icons on a 24-unit grid with a 2-unit round stroke (no third-party icon set). The
 * transport icons say how far a press goes: one chevron for a step, two for an own turn, a chevron
 * against a bar for a round.
 */
const ICONS = {
  prevRound: [["M6 5v14"], ["M17.5 5l-7 7 7 7"]],
  nextRound: [["M18 5v14"], ["M6.5 5l7 7-7 7"]],
  prevStep: [["M14.5 5l-7 7 7 7"]],
  nextStep: [["M9.5 5l7 7-7 7"]],
  prevTurn: [["M11.5 5l-7 7 7 7"], ["M18.5 5l-7 7 7 7"]],
  nextTurn: [["M5.5 5l7 7-7 7"], ["M12.5 5l7 7-7 7"]],
  play: [["M7 4.5l13 7.5-13 7.5z", "solid"]],
  pause: [["M7 5h3v14H7zM14 5h3v14h-3z", "solid"]],
  /** Marks a button that opens a list. */
  caret: [["M7 9.5l5 5 5-5"]],

  open: [
    ["M3 7.5V18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9.5a1 1 0 0 0-1-1h-8.5L9.5 6H4a1 1 0 0 0-1 1.5z"],
  ],
  link: [
    ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"],
    ["M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  ],
  eye: [["M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"], [circle(12, 12, 3)]],
  settings: [
    ["M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"],
    [`${circle(15, 6, 2)}${circle(9, 12, 2)}${circle(17, 18, 2)}`],
  ],
  help: [
    [circle(12, 12, 9)],
    ["M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.6v.4"],
    [circle(12, 17, 0.6), "solid"],
  ],
  more: [[`${circle(5, 12, 2)}${circle(12, 12, 2)}${circle(19, 12, 2)}`, "fill"]],
  close: [["M6 6l12 12M18 6L6 18"]],
  /** Marks an error message. */
  alert: [["M12 4l9 15.5H3z"], ["M12 10v4.5"], [circle(12, 16.8, 0.6), "solid"]],
  /** Marks the language picker, whatever language its label is in. */
  globe: [
    [circle(12, 12, 9)],
    ["M3 12h18"],
    ["M12 3c2.7 2.6 4 5.6 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.6-4-9s1.3-6.4 4-9z"],
  ],
} satisfies Record<string, readonly Part[]>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Decorative icon; the button that holds it carries the accessible label. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  const parts: readonly Part[] = ICONS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {parts.map(([d, paint = "stroke"]) => (
        <path
          key={d}
          d={d}
          fill={paint === "stroke" ? "none" : "currentColor"}
          stroke={paint === "fill" ? "none" : "currentColor"}
        />
      ))}
    </svg>
  );
}
