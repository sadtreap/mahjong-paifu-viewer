// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { SeatAid, SeatTagInfo, Side } from "../viewer/types";
import { CAMERAS, type TagPlace, tagPlace } from "./geometry";
import { SeatTags, TAG_WAIT_TILES, wordWidth } from "./SeatTags";

function tag(overrides: Partial<SeatTagInfo> = {}): SeatTagInfo {
  return {
    seat: 1,
    side: "right",
    name: "Bartholomew",
    wind: 0,
    dealer: true,
    score: 37500,
    riichi: false,
    aid: null,
    ...overrides,
  };
}

const placesFor = (rim: boolean) =>
  Object.fromEntries(
    (["bottom", "right", "top", "left"] as const).map((side) => [
      side,
      tagPlace(side, rim ? CAMERAS.wide : CAMERAS.stack, rim, rim),
    ]),
  ) as Record<Side, TagPlace>;
const places = placesFor(true);

function renderTags(tags: SeatTagInfo[], at: Record<Side, TagPlace> = places) {
  return render(
    <I18nProvider>
      <SeatTags tags={tags} places={at} />
    </I18nProvider>,
  );
}

const tagOf = (seat: number) => document.querySelector(`[data-seat="${seat}"]`) as HTMLElement;
/** What a sighted reader gets from a tag: its text without the hidden sentences. */
const seen = (el: HTMLElement) =>
  [...el.querySelectorAll(":scope > :not(.sr-only)")].map((part) => part.textContent).join(" | ");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("SeatTags", () => {
  it("shows the wind's letter and the name, and nothing to press", () => {
    renderTags([tag()]);
    const el = tagOf(1);
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("role")).toBeNull();
    expect(seen(el)).toBe("EBartholomew");
    expect(screen.getByText("E").getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();
    expect(el.querySelector("img")).toBeNull();
  });

  it("carries the wind, the score, the dealer and riichi as hidden text", () => {
    renderTags([
      tag({ riichi: true }),
      tag({ seat: 2, side: "top", wind: 1, dealer: false, score: -1200 }),
    ]);
    expect(screen.getByText("East, 37,500 points, dealer, riichi").className).toBe("sr-only");
    expect(screen.getByText("South, −1,200 points").className).toBe("sr-only");
    // Neither the score nor riichi is drawn in a tag.
    expect(seen(tagOf(1))).toBe("EBartholomew");
  });

  it("puts the shanten count, tenpai or a complete hand after the name, as a word", () => {
    const cases: [SeatAid, string][] = [
      [{ kind: "shanten", value: 2 }, "2-shanten"],
      [{ kind: "shanten", value: 0 }, "Tenpai"],
      [{ kind: "shanten", value: -1 }, "Complete hand"],
    ];
    for (const [aid, text] of cases) {
      renderTags([tag({ seat: 0, side: "bottom", aid })]);
      expect(seen(tagOf(0))).toBe(`EBartholomew | ${text}`);
      // Assistive technology reads the word as well.
      expect(screen.getByText(text).closest('[aria-hidden="true"]')).toBeNull();
      cleanup();
    }
  });

  it("shows waits on a second line: the label, the tiles and the tiles left", () => {
    renderTags([tag({ aid: { kind: "waits", tiles: ["3p", "6p"], left: 6, furiten: false } })]);
    const el = tagOf(1);
    const line = screen.getByText("Wait").parentElement as HTMLElement;
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(line.parentElement).toBe(el);
    expect([...line.children].map((part) => part.textContent)).toEqual(["Wait", "", "6 left"]);
    const tiles = [...line.querySelectorAll("img")];
    expect(tiles.map((img) => img.getAttribute("src"))).toEqual([
      expect.stringMatching(/Pin3\.svg$/),
      expect.stringMatching(/Pin6\.svg$/),
    ]);
    expect(tiles.every((img) => img.getAttribute("alt") === "")).toBe(true);
    expect(screen.getByText("Waits 3 Pin and 6 Pin, 6 left").className).toBe("sr-only");
    expect(el.textContent).not.toContain("Furiten");
  });

  it("keeps a word for the waits, for where the tiles have no room", () => {
    renderTags([tag({ aid: { kind: "waits", tiles: ["3p"], left: 2, furiten: false } })]);
    // The stylesheet shows the word or the tiles, by the felt the tag has; the hidden sentence
    // names the waits either way.
    const word = screen.getByText("Tenpai");
    expect(word.parentElement).toBe(tagOf(1));
    expect(word.getAttribute("aria-hidden")).toBe("true");
    expect(word.nextElementSibling).toBe(screen.getByText("Wait").parentElement);
  });

  it("folds long waits into +n and marks furiten instead of counting", () => {
    renderTags([
      tag({
        aid: { kind: "waits", tiles: ["1s", "4s", "7s", "2z", "3z"], left: 9, furiten: true },
      }),
    ]);
    const el = tagOf(1);
    expect(el.querySelectorAll("img")).toHaveLength(TAG_WAIT_TILES);
    expect(screen.getByText("+2")).toBeTruthy();
    // "Furiten" is there twice, for the stylesheet to show one: beside the name when the tiles
    // have the second line, or in their place.
    const [beside, instead, ...rest] = screen.getAllByText("Furiten");
    expect(rest).toEqual([]);
    expect((el.firstElementChild as HTMLElement).contains(beside as HTMLElement)).toBe(true);
    expect(instead?.parentElement).toBe(el);
    expect(instead?.nextElementSibling).toBe(screen.getByText("Wait").parentElement);
    expect(beside?.getAttribute("aria-hidden")).toBe("true");
    expect(instead?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByText("9 left")).toBeNull();
    expect(screen.queryByText("Tenpai")).toBeNull();
    expect(screen.getByText(/, furiten$/).className).toBe("sr-only");
  });

  it("tells the stylesheet how wide each word and name is, to leave out what has no room", () => {
    renderTags([
      tag({ name: "B", aid: { kind: "waits", tiles: ["3p"], left: 2, furiten: true } }),
      tag({ seat: 0, side: "bottom", aid: { kind: "shanten", value: 1 } }),
    ]);
    const width = (el: Element | null | undefined) =>
      Number.parseFloat((el as HTMLElement).style.getPropertyValue("--w"));
    expect(width(screen.getByText("B"))).toBeCloseTo(0.64);
    expect(width(screen.getByText("1-shanten"))).toBeGreaterThan(width(screen.getByText("B")));
    for (const furiten of screen.getAllByText("Furiten")) {
      expect(width(furiten)).toBeCloseTo(7 * 0.64 + 0.7);
    }
  });

  it("estimates a word's width on the generous side, a full em for each wide character", () => {
    const em = (text: string, pad?: number) =>
      Number.parseFloat(String((wordWidth(text, pad) as Record<string, string>)["--w"]));
    expect(em("텐파이")).toBe(3);
    expect(em("聴牌")).toBe(2);
    expect(em("Tenpai")).toBeCloseTo(6 * 0.64);
    expect(em("1-shanten")).toBeCloseTo(8 * 0.64 + 0.4);
    expect(em("フリテン", 0.7)).toBeCloseTo(4.7);
  });

  it("puts each tag in a slot of the felt, upright, in the corner by its pond and its row", () => {
    const stack = placesFor(false);
    renderTags(
      [
        tag({ seat: 0, side: "bottom" }),
        tag(),
        tag({ seat: 2, side: "top" }),
        tag({ seat: 3, side: "left" }),
      ],
      stack,
    );
    const slotOf = (seat: number) => tagOf(seat).parentElement as HTMLElement;
    for (const [seat, side] of [
      [0, "bottom"],
      [1, "right"],
      [2, "top"],
      [3, "left"],
    ] as const) {
      const slot = slotOf(seat);
      const at = stack[side];
      if (at.kind !== "felt") {
        throw new Error(`${side} is not on the felt`);
      }
      expect(tagOf(seat).getAttribute("data-tag-side")).toBe(side);
      expect(slot.getAttribute("data-place")).toBe(at.corner);
      expect(slot.style.getPropertyValue("--x0")).toBe(at.left.toFixed(5));
      expect(slot.style.getPropertyValue("--x1")).toBe(at.right.toFixed(5));
      expect(slot.style.getPropertyValue("--y0")).toBe(at.bottom.toFixed(5));
      expect(slot.style.getPropertyValue("--y1")).toBe(at.top.toFixed(5));
      expect(slot.getAttribute("style")).not.toMatch(/rotate|turn/);
    }
    expect([0, 2, 3].map((seat) => slotOf(seat).getAttribute("data-place"))).toEqual([
      "bottom-right",
      "top-left",
      "bottom-left",
    ]);
  });

  it("stands the side players' tags beside the table, off the rail's edge", () => {
    renderTags([tag(), tag({ seat: 3, side: "left" })]);
    for (const [seat, side] of [
      [1, "right"],
      [3, "left"],
    ] as const) {
      const slot = tagOf(seat).parentElement as HTMLElement;
      const at = places[side];
      if (at.kind !== "rim") {
        throw new Error(`${side} is not beside the table`);
      }
      expect(slot.getAttribute("data-place")).toBe(`rim-${side}`);
      expect(slot.style.getPropertyValue("--felt")).toBe(at.felt.toFixed(5));
      expect(slot.style.getPropertyValue("--rail")).toBe(at.rail.toFixed(5));
      expect(slot.style.getPropertyValue("--y0")).toBe(at.bottom.toFixed(5));
      expect(slot.style.getPropertyValue("--y1")).toBe(at.top.toFixed(5));
    }
  });
});
