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

/** A rounded rectangle as path data. */
const rect = (x: number, y: number, w: number, h: number, r: number) =>
  path`M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}z`;

/** The outlined tile of the own-turn buttons and the filled diamond of the key-moment buttons. */
const tile = (x: number) => rect(x, 6, 7.5, 12, 1.6);
const diamond = (cx: number) => path`M${cx} 8.3l3.7 3.7-3.7 3.7-3.7-3.7z`;

/**
 * Original icons on a 24-unit grid with a 2-unit round stroke (no third-party icon set). The
 * transport icons pair a chevron with what it skips to: a bar (round), a tile (own turn) or a
 * diamond (a call, riichi or kita, as on the timeline).
 */
const ICONS = {
  prevRound: [["M6 5v14"], ["M18 6l-8 6 8 6z", "solid"]],
  nextRound: [["M18 5v14"], ["M6 6l8 6-8 6z", "solid"]],
  prevStep: [["M14.5 5l-7 7 7 7"]],
  nextStep: [["M9.5 5l7 7-7 7"]],
  prevTurn: [["M10 5l-7 7 7 7"], [tile(13.5)]],
  nextTurn: [[tile(3)], ["M14 5l7 7-7 7"]],
  prevKey: [["M11 5l-7 7 7 7"], [diamond(17), "fill"]],
  nextKey: [[diamond(7), "fill"], ["M13 5l7 7-7 7"]],
  play: [["M7 4.5l13 7.5-13 7.5z", "solid"]],
  pause: [["M7 5h3v14H7zM14 5h3v14h-3z", "solid"]],
  back: [["M9 14L4 9l5-5"], ["M4 9h10.5a5.5 5.5 0 0 1 0 11H11"]],

  open: [
    ["M3 7.5V18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9.5a1 1 0 0 0-1-1h-8.5L9.5 6H4a1 1 0 0 0-1 1.5z"],
  ],
  link: [
    ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"],
    ["M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  ],
  eye: [["M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"], [circle(12, 12, 3)]],
  cube: [["M12 3l8 4.5v9L12 21l-8-4.5v-9z"], ["M4 7.5l8 4.5 8-4.5M12 12v9"]],
  /** Point of view: a player's head and shoulders (the toolbar's seat menu). */
  pov: [[circle(12, 8, 3.5)], ["M5 20a7 7 0 0 1 14 0"]],
  settings: [
    ["M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"],
    [`${circle(15, 6, 2)}${circle(9, 12, 2)}${circle(17, 18, 2)}`],
  ],
  help: [
    [circle(12, 12, 9)],
    ["M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.6v.4"],
    [circle(12, 17, 0.6), "solid"],
  ],
  panel: [[rect(3, 4.5, 18, 15, 2)], ["M15 4.5v15"]],
  more: [[`${circle(5, 12, 2)}${circle(12, 12, 2)}${circle(19, 12, 2)}`, "fill"]],
  close: [["M6 6l12 12M18 6L6 18"]],
  caret: [["M7 10l5 5 5-5"]],
  mouse: [
    [rect(6.5, 3, 11, 18, 5.5)],
    ["M12 3v7M6.5 10h11"],
    ["M12 3.2a5.3 5.3 0 0 0-5.3 5.3V10H12z", "fill"],
  ],
  tap: [[circle(12, 12, 3), "fill"], [circle(12, 12, 7.5)]],
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
