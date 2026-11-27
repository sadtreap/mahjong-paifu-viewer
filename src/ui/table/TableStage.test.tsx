// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quad, Seat } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState } from "../../replay/types";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { boardState, game, round } from "../__fixtures__/game";
import type { TableStageProps } from "../viewer/types";
import { stageProps } from "./__fixtures__/stageProps";
import { CAPTION_MS } from "./CallCaption";
import { FLIGHT_FALLBACK_MS } from "./FlightLayer";
import { CAMERAS, captionAnchor, STACK_TILT } from "./geometry";
import { REVEAL_MS, TableStage } from "./TableStage";

const names: Quad<string> = ["A", "B", "C", "D"];

function renderStage(overrides: Partial<TableStageProps> = {}, state: BoardState = boardState()) {
  const props = stageProps({ game, round, state, names, pov: overrides.pov ?? 0 }, overrides);
  return render(
    <I18nProvider>
      <TableStage {...props} />
    </I18nProvider>,
  );
}

const stage = () => screen.getByRole("region", { name: "Mahjong table" });
const consoleButton = () => screen.getByRole("button", { name: "Show score differences" });
const tagOf = (seat: number) => stage().querySelector(`[data-seat="${seat}"]`) as HTMLElement;
const SIDES = ["bottom", "right", "top", "left"] as const;
/** The console's cells as text, in side order from the point of view (null where none). */
const cells = () =>
  SIDES.map((side) => consoleButton().querySelector(`[data-edge="${side}"]`)?.textContent ?? null);

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

describe("TableStage", () => {
  it("labels hands, melds and ponds", () => {
    renderStage();
    const hand = screen.getByRole("group", { name: "D's hand" });
    expect(within(hand).getAllByRole("img")).toHaveLength(13);
    expect(within(hand).getByAltText("5 Man (red)")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Pon: 9 Man, 9 Man, 9 Man" })).toBeTruthy();
    expect(screen.getByRole("group", { name: /^Closed kan/ })).toBeTruthy();
    expect(screen.getByAltText("9 Man, riichi declaration, called")).toBeTruthy();
    expect(screen.getByAltText("7 Sou, discarded right after drawing, last discard")).toBeTruthy();
    expect(screen.getByAltText("1 Pin (just drawn)")).toBeTruthy();
    for (const seat of names) {
      expect(screen.getByRole("group", { name: `${seat}'s discards` })).toBeTruthy();
    }
  });

  it("shows the round and the tiles left on the console", () => {
    renderStage();
    // The round's name without its honba count.
    expect(screen.getByText("East 1")).toBeTruthy();
    expect(screen.getByText("60 left")).toBeTruthy();
    // The console is a button with a name of its own, so the tiles left are repeated as text.
    expect(screen.getByText("60 tiles left").className).toBe("sr-only");
    expect(consoleButton().contains(screen.getByText("60 tiles left"))).toBe(false);
  });

  it("shows each seat's wind and score on its edge of the console, hidden from screen readers", () => {
    renderStage();
    expect(cells()).toEqual(["E25000", "S24000", "W25000", "N25000"]);
    for (const cell of consoleButton().querySelectorAll("[data-edge]")) {
      expect(cell.getAttribute("aria-hidden")).toBe("true");
    }
    cleanup();
    renderStage({ pov: 2 });
    expect(cells()).toEqual(["W25000", "N25000", "E25000", "S24000"]);
  });

  it("marks the dealer's wind and the edge of the player whose turn it is", () => {
    renderStage();
    const button = consoleButton();
    const winds = [...button.querySelectorAll("[data-edge] > span > span:first-child")];
    expect(winds.map((wind) => wind.textContent)).toEqual(["E", "S", "W", "N"]);
    // Only East's badge carries the dealer's class.
    expect(new Set(winds.map((wind) => wind.className)).size).toBe(2);
    expect(winds.filter((wind) => wind.className === winds[0]?.className)).toHaveLength(1);
    // The turn bar: seat 3 (on the left) is to act.
    const bars = [...button.querySelectorAll("[data-edge]")].filter(
      (cell) => cell.children.length === 2,
    );
    expect(bars.map((cell) => cell.getAttribute("data-edge"))).toEqual(["left"]);
  });

  it("makes the console the one button on the felt, which stage gestures treat as a button", () => {
    const onToggleScoreDiff = vi.fn();
    renderStage({ onToggleScoreDiff });
    expect(within(stage()).getAllByRole("button")).toEqual([consoleButton()]);
    expect(consoleButton().getAttribute("aria-pressed")).toBe("false");
    // Not ignored: a swipe that starts on it steps, and only a tap presses it.
    expect(consoleButton().closest('[data-gesture="ignore"]')).toBeNull();
    expect(consoleButton().closest("[data-side]")).toBeNull();
    fireEvent.click(consoleButton());
    expect(onToggleScoreDiff).toHaveBeenCalledTimes(1);
  });

  it("shows the other players' scores as differences from the viewed player's", () => {
    renderStage({ scoreDiff: true });
    expect(consoleButton().getAttribute("aria-pressed")).toBe("true");
    // Seat 0 looks: its own score stays, B is 1,000 behind, the others level.
    expect(cells()).toEqual(["E25000", "S−1000", "W±0", "N±0"]);
    cleanup();
    renderStage({ scoreDiff: true, pov: 1 });
    expect(cells()).toEqual(["S24000", "W+1000", "N+1000", "E+1000"]);
  });

  it("lays a riichi stick by the console on the declarer's side, as decoration", () => {
    renderStage();
    const sticks = [...stage().querySelectorAll("[data-side] > span[aria-hidden]")];
    expect(sticks.map((stick) => stick.parentElement?.getAttribute("data-side"))).toEqual([
      "right",
    ]);
    expect(sticks[0]?.querySelector("img")).toBeNull();
  });

  it("draws the point of view's hand outside the plane, standing", () => {
    renderStage();
    const own = screen.getByRole("group", { name: "A's hand" });
    expect(own.closest("[data-side]")).toBeNull();
    expect(within(own).getAllByRole("img")[0]?.getAttribute("src")).toMatch(/tiles\/Man1\.svg$/);
    // The bottom seat has no hand row in the plane.
    expect(screen.getAllByRole("group", { name: "A's hand" })).toHaveLength(1);
  });

  it("draws hidden hands face down when walls are off, counted in the group's name", () => {
    renderStage({ revealed: new Set<Seat>([0]) });
    const hidden = screen.getByRole("group", { name: "B's hand, 13 tiles face down" });
    // The backs themselves are not announced one by one.
    expect(within(hidden).queryAllByRole("img")).toEqual([]);
    const backs = [...hidden.querySelectorAll("img")];
    expect(backs).toHaveLength(13);
    for (const img of backs) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("src")).toMatch(/tiles\/Back\.svg$/);
    }
    expect(screen.queryByRole("group", { name: "B's hand" })).toBeNull();
    expect(stage().hasAttribute("data-walls")).toBe(false);
  });

  it("stands hidden hands up as walls, the far one in the unrotated layer", () => {
    renderStage({ revealed: new Set<Seat>([0]), walls: true });
    expect(stage().hasAttribute("data-walls")).toBe(true);
    const right = screen.getByRole("group", { name: "B's hand, 13 tiles face down" });
    // The group's name counts the faces; they are not announced one by one.
    expect(within(right).queryAllByRole("img")).toEqual([]);
    expect(right.querySelectorAll('img[alt=""]')).toHaveLength(13);
    expect(right.closest("[data-side]")?.getAttribute("data-side")).toBe("right");
    // C (across) has 11 concealed tiles and a pon.
    const top = screen.getByRole("group", { name: "C's hand, 11 tiles face down" });
    expect(top.closest("[data-side]")).toBeNull();
    expect(top.closest('[data-layer="wtop"]')).not.toBeNull();
    // The contact shadow, the lids and the end cap are decoration.
    const shadow = right.previousElementSibling;
    const lids = right.nextElementSibling;
    const cap = lids?.nextElementSibling;
    for (const el of [shadow, lids, cap]) {
      expect(el?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(lids?.children).toHaveLength(13);
    expect(top.nextElementSibling?.nextElementSibling).toBeNull();
    // The spacer keeps the row's place, so melds stay put.
    expect(screen.getByRole("group", { name: "Pon: 9 Man, 9 Man, 9 Man" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "B's hand" })).toBeNull();
  });

  it("keeps lying backs in flat mode", () => {
    renderStage({ revealed: new Set<Seat>([0]), walls: true, view: "flat" });
    expect(stage().getAttribute("data-view")).toBe("flat");
    // No standing walls: the hidden hands lie in their rows, face down.
    expect(stage().querySelector('[data-layer="wtop"]')).toBeNull();
    const right = stage().querySelector('[data-side="right"]') as HTMLElement;
    const hidden = within(right).getByRole("group", { name: "B's hand, 13 tiles face down" });
    expect(hidden.closest("[data-side]")).toBe(right);
    expect(hidden.querySelectorAll('img[src$="Back.svg"]')).toHaveLength(13);
  });

  it("rotates the table to the point of view", () => {
    renderStage({ pov: 2 });
    const bottom = stage().querySelector('[data-side="bottom"]') as HTMLElement;
    expect(within(bottom).getByRole("group", { name: "C's discards" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "C's hand" }).closest("[data-side]")).toBeNull();
    const left = stage().querySelector('[data-side="left"]') as HTMLElement;
    expect(within(left).getByRole("group", { name: "B's hand" })).toBeTruthy();
  });

  it("marks face-up tiles with their kind and pond tiles with seat:index", () => {
    renderStage();
    expect(screen.getByAltText("5 Man (red)").getAttribute("data-k")).toBe("4");
    expect(screen.getByAltText("9 Man, riichi declaration, called").getAttribute("data-d")).toBe(
      "1:0",
    );
    expect(
      screen.getByAltText("7 Sou, discarded right after drawing, last discard").dataset.d,
    ).toBe("3:0");
    renderStage({ revealed: new Set<Seat>([0]) });
    const back = screen.getByRole("group", { name: "B's hand, 13 tiles face down" });
    expect(back.querySelector("img")?.hasAttribute("data-k")).toBe(false);
  });

  it("tags every seat with its wind and name, as text", () => {
    renderStage();
    expect([0, 1, 2, 3].map((seat) => tagOf(seat).textContent?.slice(0, 2))).toEqual([
      "EA",
      "SB",
      "WC",
      "ND",
    ]);
    expect([0, 1, 2, 3].map((seat) => tagOf(seat).getAttribute("data-tag-side"))).toEqual([
      ...SIDES,
    ]);
    for (const name of names) {
      expect(screen.queryByRole("button", { name: new RegExp(`^${name}\\b`) })).toBeNull();
    }
    // The wind's letter is for the eye; the hidden text names the wind in full.
    expect(tagOf(1).querySelector('[aria-hidden="true"]')?.textContent).toBe("S");
    expect(tagOf(1).closest("[data-side]")).toBeNull();
  });

  it("repeats what the console draws about a seat as hidden text in its tag", () => {
    renderStage();
    const facts = [0, 1, 2, 3].map((seat) => tagOf(seat).querySelector(".sr-only")?.textContent);
    expect(facts).toEqual([
      "East, 25,000 points, dealer",
      "South, 24,000 points, riichi",
      "West, 25,000 points",
      "North, 25,000 points",
    ]);
    // No score to see in a tag: the console shows it.
    const seen = [...tagOf(1).querySelectorAll(":scope > :not(.sr-only)")];
    expect(seen.map((el) => el.textContent).join("")).toBe("SB");
  });

  it("writes the camera's numbers on the stage, the same whether or not hands are hidden", () => {
    renderStage({ walls: false });
    const shown = stage().getAttribute("style") ?? "";
    expect(shown).toContain("--tilt: 34deg");
    expect(shown).toContain("--pond-tile: 1.33");
    expect(shown).toContain("--console-size: 5");
    cleanup();
    renderStage({ walls: true, revealed: new Set<Seat>([0]) });
    expect(stage().getAttribute("style")).toBe(shown);
    cleanup();
    renderStage({ arrangement: "stack" });
    expect(stage().getAttribute("style")).toContain("--tilt: 20deg");
    cleanup();
    renderStage({ arrangement: "stack", view: "flat" });
    expect(stage().getAttribute("style")).toContain("--tilt: 0deg");
    cleanup();
    renderStage({ arrangement: "short" });
    expect(stage().getAttribute("style")).toContain("--tilt: 34deg");
  });

  it("fits the stack camera's tilt to the stage's size", () => {
    const measured = (width: number, height: number) =>
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        width,
        height,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        toJSON() {},
      });
    measured(390, 1200);
    renderStage({ arrangement: "stack" });
    expect(stage().style.getPropertyValue("--tilt")).toBe(`${STACK_TILT.min}deg`);
    cleanup();
    measured(320, 234);
    renderStage({ arrangement: "stack" });
    expect(stage().style.getPropertyValue("--tilt")).toBe(`${STACK_TILT.max}deg`);
    cleanup();
    // The other arrangements keep their camera, whatever the size.
    renderStage({ arrangement: "wide" });
    expect(stage().style.getPropertyValue("--tilt")).toBe("34deg");
    vi.restoreAllMocks();
  });

  it("keeps the hooks the browser checks read", () => {
    renderStage();
    expect(stage().hasAttribute("data-stage")).toBe(true);
    expect(
      [...stage().querySelectorAll("[data-side]")].map((el) => el.getAttribute("data-side")),
    ).toEqual([...SIDES]);
    expect(stage().querySelectorAll('[data-side="right"] img[data-d]')).toHaveLength(1);
    const own = stage().querySelector("[data-own-hand]") as HTMLElement;
    expect(within(own).getByRole("group", { name: "A's hand" })).toBeTruthy();
  });

  it("jumps on Alt+press on a pond tile without letting the press through", () => {
    const onPondJump = vi.fn();
    const outside = vi.fn();
    renderStage({ onPondJump });
    stage().addEventListener("pointerdown", outside);
    const tile = screen.getByAltText("7 Sou, discarded right after drawing, last discard");
    fireEvent.pointerDown(tile, { altKey: true, button: 0 });
    expect(onPondJump).toHaveBeenCalledWith({ seat: 3, index: 0 });
    expect(outside).not.toHaveBeenCalled();
    fireEvent.pointerDown(tile, { button: 0 });
    expect(onPondJump).toHaveBeenCalledTimes(1);
    expect(outside).toHaveBeenCalledTimes(1);
    // Alt+press elsewhere on the table is an ordinary press.
    fireEvent.pointerDown(screen.getByAltText("5 Man (red)"), { altKey: true, button: 0 });
    expect(onPondJump).toHaveBeenCalledTimes(1);
    expect(outside).toHaveBeenCalledTimes(2);
  });

  it("forwards the stage element to stageRef", () => {
    const stageRef = { current: null as HTMLElement | null };
    renderStage({ stageRef });
    expect(stageRef.current).toBe(stage());
    expect(stageRef.current?.tabIndex).toBe(-1);
  });

  it("marks the stage while an overlay card is up, and takes the console out of the Tab order", () => {
    const { rerender } = renderStage();
    expect(consoleButton().hasAttribute("tabindex")).toBe(false);
    const props = stageProps({ game, round, state: boardState(), names, pov: 0 }, {});
    rerender(
      <I18nProvider>
        <TableStage {...props} overlay={<div>card</div>} />
      </I18nProvider>,
    );
    expect(stage().hasAttribute("data-overlay")).toBe(true);
    expect(screen.getByText("card")).toBeTruthy();
    // The card lies over the console: a keyboard user is not sent under it. The tags stay.
    expect(consoleButton().getAttribute("tabindex")).toBe("-1");
    expect(tagOf(0).textContent).toContain("A");
  });

  it("marks the stage with its arrangement, and whether its dock holds something", () => {
    renderStage({ arrangement: "stack" });
    expect(stage().getAttribute("data-arrangement")).toBe("stack");
    expect(stage().hasAttribute("data-dock")).toBe(false);
    cleanup();
    renderStage({ dock: <div>bar</div> });
    expect(stage().hasAttribute("data-dock")).toBe(true);
  });

  it("stands side players' tags beside the table where the stage has room, else on the felt", () => {
    const places = () =>
      [0, 1, 2, 3].map((seat) => tagOf(seat).parentElement?.getAttribute("data-place"));
    renderStage({ dock: <div>bar</div> });
    expect(places()).toEqual(["bottom-right", "rim-right", "top-left", "rim-left"]);
    cleanup();
    renderStage({ arrangement: "short" });
    expect(places()).toEqual(["bottom-right", "rim-right", "top-left", "rim-left"]);
    cleanup();
    renderStage({ arrangement: "stack" });
    expect(places()[1]).toMatch(/^(top|bottom)-right$/);
    expect(places().slice(2)).toEqual(["top-left", "bottom-left"]);
  });

  it("puts the dock and the overlay in slots that stage gestures ignore", () => {
    renderStage({ dock: <div>bar</div>, overlay: <div>card</div> });
    const dock = screen.getByText("bar").closest('[data-gesture="ignore"]');
    const overlay = screen.getByText("card").closest('[data-gesture="ignore"]');
    expect(dock).not.toBeNull();
    expect(overlay).not.toBeNull();
    expect(overlay).not.toBe(dock);
    expect(stage().contains(dock)).toBe(true);
    // The overlay comes first, so the keyboard reaches the card before the bar, and lies outside
    // the box that clips the table; the dock is the last thing in the table's frame.
    expect(stage().firstElementChild).toBe(overlay);
    expect(overlay?.parentElement).toBe(stage());
    const frame = stage().querySelector("[data-own-hand]")?.parentElement as HTMLElement;
    expect(frame.lastElementChild?.contains(dock as Element)).toBe(true);
    expect(dock?.textContent).toBe("bar");
  });

  it("renders no slot without content", () => {
    renderStage();
    expect(stage().querySelector('[data-gesture="ignore"]')).toBeNull();
    expect(stage().hasAttribute("data-overlay")).toBe(false);
    expect(stage().children).toHaveLength(1);
  });

  it("shows call captions as decoration, for a moment", () => {
    vi.useFakeTimers();
    renderStage({ captions: [{ id: 1, seat: 2, kind: "pon" }] });
    const caption = screen.getByText("Pon");
    expect(caption.closest('[aria-hidden="true"]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(CAPTION_MS);
    });
    expect(screen.queryByText("Pon")).toBeNull();
  });

  it("centres each caption on its caller's pond, also two at once", () => {
    // Point of view 0: seat 1 is on the right, seat 3 on the left.
    renderStage({
      captions: [
        { id: 1, seat: 3, kind: "ron" },
        { id: 2, seat: 1, kind: "ron" },
      ],
    });
    const at = screen
      .getAllByText("Ron")
      .map((el) => [el.style.getPropertyValue("--ax"), el.style.getPropertyValue("--ay")]);
    expect(at).toEqual(
      (["left", "right"] as const).map((side) => {
        const anchor = captionAnchor(side, CAMERAS.wide);
        return [anchor.x.toFixed(5), anchor.y.toFixed(5)];
      }),
    );
  });

  it("flies a discard through a proxy, then shows the real tile", () => {
    vi.useFakeTimers();
    const state = boardState();
    renderStage(
      { motion: { flight: { seat: 3, index: 0, source: "opponent", riichi: false }, reveal: [] } },
      state,
    );
    const real = screen.getByAltText("7 Sou, discarded right after drawing, last discard");
    expect(real.className).not.toBe("");
    const proxies = stage().querySelectorAll('[aria-hidden="true"] img[data-k="24"]');
    expect(proxies).toHaveLength(1);
    expect(proxies[0]?.closest("[data-side]")).toBeNull();
    const before = real.className;
    act(() => {
      vi.advanceTimersByTime(FLIGHT_FALLBACK_MS);
    });
    expect(stage().querySelectorAll('[aria-hidden="true"] img[data-k="24"]')).toHaveLength(0);
    expect(real.className).not.toBe(before);
  });

  it("plays the round-end reveal on the step only, not when H or C changes the table later", () => {
    const state = boardState();
    const reveal = { flight: null, reveal: [1 as Seat] };
    const props = (overrides: Partial<TableStageProps>) =>
      stageProps({ game, round, state, names }, { revealed: new Set<Seat>([0, 1]), ...overrides });
    const leavingFaces = () =>
      (stage().querySelector('[data-side="right"]') as HTMLElement).querySelectorAll(
        '[aria-hidden="true"] img[src$="Back.svg"]',
      ).length;
    // Reached with hands shown (no walls): nothing to reveal.
    const { rerender } = render(
      <I18nProvider>
        <TableStage {...props({ walls: false, motion: reveal })} />
      </I18nProvider>,
    );
    expect(leavingFaces()).toBe(0);
    // H hides the hands at the same step: the walls stand, and no reveal plays.
    rerender(
      <I18nProvider>
        <TableStage {...props({ walls: true, motion: reveal })} />
      </I18nProvider>,
    );
    expect(leavingFaces()).toBe(0);
    // Flat, then C back to 3D at the same step: still no reveal.
    rerender(
      <I18nProvider>
        <TableStage {...props({ walls: true, view: "flat", motion: reveal })} />
      </I18nProvider>,
    );
    rerender(
      <I18nProvider>
        <TableStage {...props({ walls: true, view: "3d", motion: reveal })} />
      </I18nProvider>,
    );
    expect(leavingFaces()).toBe(0);
  });

  it("keeps a revealed wall for the round-end reveal, then removes it", () => {
    vi.useFakeTimers();
    renderStage({
      walls: true,
      revealed: new Set<Seat>([0, 1]),
      motion: { flight: null, reveal: [1] },
    });
    const right = stage().querySelector('[data-side="right"]') as HTMLElement;
    expect(within(right).getByRole("group", { name: "B's hand" })).toBeTruthy();
    expect(right.querySelectorAll('[aria-hidden="true"] img[src$="Back.svg"]')).toHaveLength(13);
    act(() => {
      vi.advanceTimersByTime(REVEAL_MS);
    });
    expect(right.querySelectorAll('img[src$="Back.svg"]')).toHaveLength(0);
  });
});

describe("TableStage in a three-player game", () => {
  const sanma = sanmaCrossFormatGame();
  const r0 = sanma.rounds[0];
  const states = r0 === undefined ? [] : buildTimeline(r0, 3);
  // After seat 2's two kita (step 15 of East 1), seat 0 has one.
  const state = states[15] as BoardState;
  const sanmaNames: Quad<string> = ["A", "B", "C", "Player 4"];

  function renderSanma(pov: Seat, overrides: Partial<TableStageProps> = {}) {
    if (r0 === undefined) {
      throw new Error("no round");
    }
    const props = stageProps({ game: sanma, round: r0, state, names: sanmaNames, pov }, overrides);
    return render(
      <I18nProvider>
        <TableStage {...props} />
      </I18nProvider>,
    );
  }

  it("draws three seats and an empty chair that moves with the point of view", () => {
    for (const [pov, side] of [
      [0, "left"],
      [1, "top"],
      [2, "right"],
    ] as const) {
      renderSanma(pov);
      const empty = stage().querySelector(`[data-side="${side}"]`) as HTMLElement;
      expect(empty.querySelector("img")).toBeNull();
      expect(empty.textContent).toBe("");
      expect(stage().querySelectorAll("[data-seat]")).toHaveLength(3);
      // The console has no cell on the empty side either.
      expect(cells().map((cell) => cell === null)).toEqual(SIDES.map((s) => s === side));
      expect(screen.getAllByRole("group", { name: /'s discards$/ })).toHaveLength(3);
      expect(stage().textContent).not.toContain("Player 4");
      cleanup();
    }
  });

  it("shows kita as a labelled group, with a ×n pill from two tiles on, and the tags' winds", () => {
    renderSanma(0);
    const kita = screen.getByRole("group", { name: "C's kita: 2 North tiles set aside" });
    expect(within(kita).getAllByRole("img")).toHaveLength(1);
    expect(within(kita).getByText("×2").getAttribute("aria-hidden")).toBe("true");
    // One tile is its own count.
    const own = screen.getByRole("group", { name: "A's kita: 1 North tile set aside" });
    expect(own.closest("[data-side]")).toBeNull();
    expect(own.textContent).toBe("");
    const winds = [...stage().querySelectorAll("[data-seat]")].map(
      (tag) => tag.querySelector('[aria-hidden="true"]')?.textContent,
    );
    expect(winds.sort()).toEqual(["E", "S", "W"]);
  });

  it("counts kita only on the kita tiles, never in a tag", () => {
    renderSanma(0);
    for (const seat of [0, 1, 2]) {
      expect(tagOf(seat).textContent).not.toContain("×");
    }
    expect(screen.getAllByText("×2")).toHaveLength(1);
  });
});
