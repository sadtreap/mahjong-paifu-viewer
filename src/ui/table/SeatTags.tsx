import { type CSSProperties, memo } from "react";
import { useI18n } from "../../i18n/context";
import type { Messages } from "../../i18n/messages";
import { cx } from "../cx";
import { formatPoints, tileLabel } from "../labels";
import { TileImage } from "../TileImage";
import type { SeatAid, SeatTagInfo, Side } from "../viewer/types";
import type { TagPlace } from "./geometry";
import styles from "./SeatTags.module.css";

/** Wait tiles shown in a tag before "+n". */
export const TAG_WAIT_TILES = 3;

type Waits = Extract<SeatAid, { kind: "waits" }>;

/** The padding on both sides of "Furiten", in em (.furiten in SeatTags.module.css). */
const FURITEN_PAD = 0.7;

/**
 * About how wide a word is in em, on the generous side, so that the stylesheet can leave out a
 * word the tag has no room for instead of cutting it, and a name with no room for even a letter
 * (`--w`, SeatTags.module.css). `pad` is the word's own padding, in em.
 */
export function wordWidth(text: string, pad = 0): CSSProperties {
  let em = pad;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    em += code >= 0x1100 ? 1 : /[\s\-.,:·]/.test(char) ? 0.4 : 0.64;
  }
  return { "--w": `${em.toFixed(2)}em` } as CSSProperties;
}

/** The shanten count as a word. */
function shantenText(m: Messages, value: number): string {
  return value < 0 ? m.table.completeHand : value === 0 ? m.table.tenpai : m.table.shanten(value);
}

/**
 * The aid in a word: the shanten count, or what stands in for the wait tiles where they have no
 * room ("Tenpai", or "Furiten").
 */
function AidWord({ aid, m }: { aid: SeatAid; m: Messages }) {
  if (aid.kind === "shanten") {
    const text = shantenText(m, aid.value);
    return (
      <span className={cx(styles.word, aid.value === 0 && styles.tenpai)} style={wordWidth(text)}>
        {text}
      </span>
    );
  }
  return aid.furiten ? (
    <span
      className={cx(styles.word, styles.furiten, styles.brief)}
      style={wordWidth(m.table.furiten, FURITEN_PAD)}
      aria-hidden="true"
    >
      {m.table.furiten}
    </span>
  ) : (
    <span
      className={cx(styles.word, styles.tenpai, styles.brief)}
      style={wordWidth(m.table.tenpai)}
      aria-hidden="true"
    >
      {m.table.tenpai}
    </span>
  );
}

/** The waits on a line of their own: "Wait", the tiles, "+n" and the tiles left. */
function WaitsLine({ aid, m }: { aid: Waits; m: Messages }) {
  const more = aid.tiles.length - TAG_WAIT_TILES;
  return (
    <span className={styles.detail} aria-hidden="true">
      <span className={styles.label}>{m.table.waitsShort}</span>
      <span className={styles.tiles}>
        {aid.tiles.slice(0, TAG_WAIT_TILES).map((tile) => (
          <TileImage key={tile} tile={tile} label="" className={styles.tile} />
        ))}
      </span>
      {more > 0 && <span className={styles.more}>+{more}</span>}
      {!aid.furiten && <span className={styles.count}>{m.table.left(aid.left)}</span>}
    </span>
  );
}

/** The custom properties a slot is placed by (SeatTags.module.css). */
function slotStyle(at: TagPlace): CSSProperties {
  const n = (value: number) => value.toFixed(5);
  const vars =
    at.kind === "felt"
      ? { "--x0": n(at.left), "--x1": n(at.right), "--y0": n(at.bottom), "--y1": n(at.top) }
      : {
          "--y0": n(at.bottom),
          "--y1": n(at.top),
          "--felt": n(at.felt),
          "--rail": n(at.rail),
          "--len": n(at.length),
        };
  return vars as CSSProperties;
}

export interface SeatTagsProps {
  tags: readonly SeatTagInfo[];
  /** Where each side's tag goes (geometry.ts tagPlace). */
  places: Readonly<Record<Side, TagPlace>>;
}

/**
 * The seat tags: one small, flat, upright label per player, beside that player's pond and against
 * that player's hand row, or, for a side player where the stage has room, beside the table next
 * to that player's row. A tag names the player (the seat wind's letter and the name) and shows
 * the aid the viewer passes: a word ("1-shanten", "Tenpai", "Furiten") or, for a hand with waits,
 * the wait tiles, with "Furiten" beside the name. How much of that shows, and on how many lines,
 * the stylesheet decides from the room each tag has (`places`); the parts it chooses between are
 * all in the markup. Display only: the pointer goes through to the felt.
 *
 * The scores, the dealer and riichi are drawn on the console and around it; each tag repeats them
 * as hidden text, so assistive technology reads a player in one place.
 */
export const SeatTags = memo(function SeatTags({ tags, places }: SeatTagsProps) {
  const { m, locale } = useI18n();
  return (
    <div className={styles.tags}>
      {tags.map((tag) => {
        const at = places[tag.side];
        const { aid } = tag;
        return (
          <div
            key={tag.seat}
            className={styles.slot}
            data-place={at.kind === "felt" ? at.corner : `rim-${at.side}`}
            style={slotStyle(at)}
          >
            <div
              className={cx(styles.tag, aid?.kind === "waits" && styles.waits)}
              data-seat={tag.seat}
              data-tag-side={tag.side}
            >
              <span className={styles.line}>
                <span className={styles.who}>
                  <span className={cx(styles.wind, tag.dealer && styles.dealer)} aria-hidden="true">
                    {m.board.windsShort[tag.wind]}
                  </span>
                  <span className={styles.name} style={wordWidth(tag.name)}>
                    {tag.name}
                  </span>
                </span>
                {aid?.kind === "waits" && aid.furiten && (
                  <span
                    className={cx(styles.word, styles.furiten, styles.beside)}
                    style={wordWidth(m.table.furiten, FURITEN_PAD)}
                    aria-hidden="true"
                  >
                    {m.table.furiten}
                  </span>
                )}
              </span>
              {aid !== null && <AidWord aid={aid} m={m} />}
              {aid?.kind === "waits" && <WaitsLine aid={aid} m={m} />}
              <span className="sr-only">
                {m.table.seatFacts(
                  m.round.winds[tag.wind] ?? "",
                  formatPoints(locale, tag.score),
                  tag.dealer,
                  tag.riichi,
                )}
              </span>
              {aid?.kind === "waits" && (
                <span className="sr-only">
                  {m.table.waitsSr(
                    aid.tiles.map((tile) => tileLabel(m, tile)),
                    aid.left,
                    aid.furiten,
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
