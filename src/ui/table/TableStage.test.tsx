// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quad, Seat } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState, DiscardView, MeldView, SeatView } from "../../replay/types";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { boardState, game, round } from "../__fixtures__/game";
import type { TableStageProps } from "../viewer/types";
import { stageProps } from "./__fixtures__/stageProps";
import { CAPTION_MS } from "./CallCaption";
import { captionAnchor, handScale, pondScale, stageVars } from "./geometry";
import { TableStage } from "./TableStage";

const names: Quad<string> = ["A", "B", "C", "D"];

function stageElement(overrides: Partial<TableStageProps> = {}, state: BoardState = boardState()) {
  const props = stageProps({ game, round, state, names, pov: overrides.pov ?? 0 }, overrides);
  return (
    <I18nProvider>
      <TableStage {...props} />
    </I18nProvider>
  );
}

const renderStage = (overrides: Partial<TableStageProps> = {}, state: BoardState = boardState()) =>
  render(stageElement(overrides, state));

/** The fixture's table with one seat changed. */
function withSeat(seat: Seat, change: Partial<SeatView>): BoardState {
  const state = boardState();
  const seats = [...state.seats] as Quad<SeatView>;
  seats[seat] = { ...seats[seat], ...change };
  return { ...state, seats };
}

const stage = () => screen.getByRole("region", { name: "Mahjong table" });
const consoleButton = () => screen.getByRole("button", { name: "Show score differences" });
const layer = (side: string) => stage().querySelector(`[data-side="${side}"]`) as HTMLElement;
const SIDES = ["bottom", "right", "top", "left"] as const;
/** The console's cells as text, in side order from the point of view (null where none). */
const cells = () =>
  SIDES.map((side) => consoleButton().querySelector(`[data-edge="${side}"]`)?.textContent ?? null);
/** The class of every pond tile on the table, by its `seat:index`. */
const pondClasses = () =>
  Object.fromEntries(
    [...stage().querySelectorAll("[data-d]")].map((el) => [
      el.getAttribute("data-d") ?? "",
      el.className,
    ]),
  );
/** The backs of a hidden hand: bodies without artwork, hidden from assistive technology. */
const backs = (group: HTMLElement) => group.querySelectorAll('span[aria-hidden="true"]:empty');

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
      expect(screen.getByRole("group", { name: `${seat}'s hand` })).toBeTruthy();
    }
  });

  it("draws one layer per seat around the console, each with its pond and its hand row", () => {
    renderStage();
    const table = stage().firstElementChild as HTMLElement;
    expect(stage().children).toHaveLength(1);
    expect([...table.querySelectorAll("[data-side]")].map((el) => el.parentElement)).toEqual(
      Array(4).fill(table),
    );
    for (const [index, side] of SIDES.entries()) {
      const name = names[index];
      expect(within(layer(side)).getByRole("group", { name: `${name}'s discards` })).toBeTruthy();
      expect(within(layer(side)).getByRole("group", { name: `${name}'s hand` })).toBeTruthy();
    }
    // The calls lie in their owner's row.
    expect(within(layer("top")).getByRole("group", { name: "C's calls" })).toBeTruthy();
    expect(within(layer("left")).getByRole("group", { name: "D's calls" })).toBeTruthy();
    expect(within(layer("bottom")).queryByRole("group", { name: /calls$/ })).toBeNull();
  });

  it("draws the viewed player's hand like the others, in the bottom layer, and marks it", () => {
    renderStage();
    const own = stage().querySelectorAll("[data-own-hand]");
    expect(own).toHaveLength(1);
    expect(own[0]?.parentElement).toBe(layer("bottom"));
    const hand = within(own[0] as HTMLElement).getByRole("group", { name: "A's hand" });
    expect(screen.getAllByRole("group", { name: "A's hand" })).toEqual([hand]);
    const tiles = within(hand).getAllByRole("img");
    expect(tiles).toHaveLength(13);
    expect(tiles[0]?.getAttribute("src")).toMatch(/tiles\/Man1\.svg$/);
    expect(tiles[12]?.getAttribute("alt")).toBe("1 Pin (just drawn)");
  });

  it("rotates the table to the point of view", () => {
    renderStage({ pov: 2 });
    expect(within(layer("bottom")).getByRole("group", { name: "C's discards" })).toBeTruthy();
    expect(within(layer("right")).getByRole("group", { name: "D's hand" })).toBeTruthy();
    expect(within(layer("top")).getByRole("group", { name: "A's hand" })).toBeTruthy();
    expect(within(layer("left")).getByRole("group", { name: "B's hand" })).toBeTruthy();
    const own = stage().querySelector("[data-own-hand]") as HTMLElement;
    expect(within(own).getByRole("group", { name: "C's hand" })).toBeTruthy();
    expect(within(own).getByRole("group", { name: "C's calls" })).toBeTruthy();
    expect(stage().querySelectorAll("[data-own-hand]")).toHaveLength(1);
  });

  it("gives the stage the table's numbers, whatever the table shows", () => {
    renderStage();
    const style = stage().getAttribute("style");
    for (const [name, value] of Object.entries(stageVars())) {
      expect(stage().style.getPropertyValue(name), name).toBe(value);
    }
    cleanup();
    renderStage({ pov: 2, revealed: new Set<Seat>([2]), scoreDiff: true });
    expect(stage().getAttribute("style")).toBe(style);
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

  it("forwards the stage element to stageRef, an object or a function", () => {
    const stageRef = { current: null as HTMLElement | null };
    const { unmount } = renderStage({ stageRef });
    expect(stageRef.current).toBe(stage());
    expect(stageRef.current?.tabIndex).toBe(-1);
    unmount();
    expect(stageRef.current).toBeNull();
    const callback = vi.fn();
    renderStage({ stageRef: callback });
    expect(callback).toHaveBeenLastCalledWith(stage());
  });
});

describe("the console", () => {
  it("shows the round with its honba, and without it for a small table", () => {
    renderStage();
    expect(consoleButton().contains(screen.getByText("East 1, 1 honba"))).toBe(true);
    expect(consoleButton().contains(screen.getByText("East 1"))).toBe(true);
    cleanup();
    // The honba count is the table's, not the round's first.
    renderStage({}, boardState({ honba: 0 }));
    expect(screen.queryByText(/honba/)).toBeNull();
    expect(screen.getAllByText("East 1")).toHaveLength(2);
  });

  it("shows the tiles left in two wordings, and says them once beside the button", () => {
    renderStage();
    expect(consoleButton().contains(screen.getByText("60 tiles left"))).toBe(true);
    expect(consoleButton().contains(screen.getByText("60 left"))).toBe(true);
    // The console is a button with a name of its own, so what it shows is repeated as text.
    const hidden = stage().querySelector(".sr-only") as HTMLElement;
    expect(hidden.textContent).toBe("Dora indicators: 3 Man. 60 tiles left");
    expect(consoleButton().contains(hidden)).toBe(false);
    expect(stage().querySelectorAll(".sr-only")).toHaveLength(1);
    cleanup();
    renderStage({}, boardState({ wallRemaining: 1 }));
    expect(screen.getByText("1 left")).toBeTruthy();
  });

  it("shows the dora indicators as tiles, named in the hidden text", () => {
    renderStage({}, boardState({ doraIndicators: ["3m", "2z", "0p", "9s"] }));
    const dora = consoleButton().querySelector("[data-count]") as HTMLElement;
    expect(dora.getAttribute("data-count")).toBe("4");
    expect(dora.textContent).toBe("Dora");
    const tiles = [...dora.querySelectorAll("img")];
    expect(tiles.map((img) => img.getAttribute("src")?.replace(/^.*\//, ""))).toEqual([
      "Man3.svg",
      "Nan.svg",
      "Pin5-Dora.svg",
      "Sou9.svg",
    ]);
    // Pictures on a button: the hidden text beside it names them.
    expect(tiles.map((img) => img.getAttribute("alt"))).toEqual(["", "", "", ""]);
    expect(within(dora).queryAllByRole("img")).toEqual([]);
    expect(tiles.map((img) => img.getAttribute("data-k"))).toEqual(["2", "28", "13", "26"]);
    expect(stage().querySelector(".sr-only")?.textContent).toBe(
      "Dora indicators: 3 Man, South, 5 Pin (red), 9 Sou. 60 tiles left",
    );
  });

  it("leaves the dora out while there is none to show", () => {
    renderStage({}, boardState({ doraIndicators: [] }));
    expect(consoleButton().querySelector("[data-count]")).toBeNull();
    expect(consoleButton().querySelector("img")).toBeNull();
    expect(screen.queryByText("Dora")).toBeNull();
    expect(stage().querySelector(".sr-only")?.textContent).toBe("60 tiles left");
  });

  it("counts the riichi deposits on the table, and says nothing of none", () => {
    renderStage();
    expect(consoleButton().contains(screen.getByText("1 deposit"))).toBe(true);
    cleanup();
    renderStage({}, boardState({ riichiSticks: 3 }));
    expect(screen.getByText("3 deposits")).toBeTruthy();
    cleanup();
    renderStage({}, boardState({ riichiSticks: 0 }));
    expect(screen.queryByText(/deposit/)).toBeNull();
  });

  it("shows each seat's wind and score on its edge, hidden from screen readers", () => {
    renderStage();
    expect(cells()).toEqual(["E25,000", "S24,000", "W25,000", "N25,000"]);
    for (const cell of consoleButton().querySelectorAll("[data-edge]")) {
      expect(cell.getAttribute("aria-hidden")).toBe("true");
    }
    cleanup();
    renderStage({ pov: 2 });
    expect(cells()).toEqual(["W25,000", "N25,000", "E25,000", "S24,000"]);
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
    const bars = () =>
      [...consoleButton().querySelectorAll("[data-edge]")]
        .filter((cell) => cell.children.length === 2)
        .map((cell) => cell.getAttribute("data-edge"));
    expect(bars()).toEqual(["left"]);
    cleanup();
    renderStage({}, boardState({ activeSeat: null }));
    expect(bars()).toEqual([]);
    cleanup();
    renderStage({ pov: 3 });
    expect(bars()).toEqual(["bottom"]);
  });

  it("is the one button on the table, which stage gestures treat as a button", () => {
    const onToggleScoreDiff = vi.fn();
    renderStage({ onToggleScoreDiff });
    expect(within(stage()).getAllByRole("button")).toEqual([consoleButton()]);
    expect(consoleButton().getAttribute("type")).toBe("button");
    expect(consoleButton().getAttribute("aria-pressed")).toBe("false");
    expect(consoleButton().hasAttribute("tabindex")).toBe(false);
    // Not ignored: a swipe that starts on it steps, and only a tap presses it.
    expect(stage().querySelector('[data-gesture="ignore"]')).toBeNull();
    expect(consoleButton().closest("[data-side]")).toBeNull();
    fireEvent.click(consoleButton());
    expect(onToggleScoreDiff).toHaveBeenCalledTimes(1);
  });

  it("names its key in the tooltip", () => {
    renderStage();
    expect(consoleButton().getAttribute("title")).toMatch(/^Show score differences \(.+\)$/);
  });

  it("shows the other players' scores as differences from the viewed player's", () => {
    renderStage({ scoreDiff: true });
    expect(consoleButton().getAttribute("aria-pressed")).toBe("true");
    // Seat 0 looks: its own score stays, B is 1,000 behind, the others level.
    expect(cells()).toEqual(["E25,000", "S−1,000", "W±0", "N±0"]);
    cleanup();
    renderStage({ scoreDiff: true, pov: 1 });
    expect(cells()).toEqual(["S24,000", "W+1,000", "N+1,000", "E+1,000"]);
  });
});

describe("the seats' tiles", () => {
  it("lays a riichi stick by the console on the declarer's side, as decoration", () => {
    renderStage();
    const sticks = [...stage().querySelectorAll("[data-side] > span[aria-hidden]")];
    expect(sticks.map((stick) => stick.parentElement?.getAttribute("data-side"))).toEqual([
      "right",
    ]);
    expect(sticks[0]?.childElementCount).toBe(0);
    // It comes first in its layer, so the pond and the hand row are drawn after it.
    expect(layer("right").firstElementChild).toBe(sticks[0]);
  });

  it("outlines the last discard and no other", () => {
    renderStage();
    const classes = pondClasses();
    const last = screen.getByAltText("7 Sou, discarded right after drawing, last discard");
    expect(last.getAttribute("data-d")).toBe("3:0");
    expect(screen.getAllByAltText(/last discard$/)).toEqual([last]);
    // Two steps later the viewed player's discard is the last one: it takes the outline and
    // the earlier tile loses it.
    cleanup();
    const later = withSeat(0, {
      drawn: null,
      discards: [{ tile: "1p", tsumogiri: true, riichi: false, called: false }],
    });
    renderStage({}, { ...later, eventIndex: 10, lastEvent: round.events[10] ?? null });
    const now = screen.getByAltText("1 Pin, discarded right after drawing, last discard");
    expect(now.getAttribute("data-d")).toBe("0:0");
    expect(screen.getAllByAltText(/last discard$/)).toEqual([now]);
    const before = screen.getByAltText("7 Sou, discarded right after drawing");
    expect(before.className).not.toBe(classes["3:0"]);
    expect(now.className).toBe(classes["3:0"]);
  });

  it("outlines nothing on a step that is not a discard", () => {
    renderStage({}, boardState({ eventIndex: 7, lastEvent: round.events[7] ?? null }));
    expect(screen.queryByAltText(/last discard$/)).toBeNull();
    expect(screen.getByAltText("7 Sou, discarded right after drawing")).toBeTruthy();
  });

  it("gives the discard that lands on this step a class of its own", () => {
    renderStage();
    const still = pondClasses();
    expect(Object.keys(still).sort()).toEqual(["1:0", "2:0", "3:0"]);
    cleanup();
    renderStage({ motion: { landing: { seat: 3, index: 0 } } });
    const moving = pondClasses();
    expect(Object.keys(moving).filter((ref) => moving[ref] !== still[ref])).toEqual(["3:0"]);
    // One class more on the tile: the outline of the last discard stays.
    const added = (moving["3:0"] ?? "").split(" ").filter((name) => !still["3:0"]?.includes(name));
    expect(added).toHaveLength(1);
    expect(moving["3:0"]?.startsWith(`${still["3:0"]} `)).toBe(true);
    // The same class whichever seat's discard lands.
    cleanup();
    renderStage({ motion: { landing: { seat: 1, index: 0 } } });
    const other = pondClasses();
    expect(Object.keys(other).filter((ref) => other[ref] !== still[ref])).toEqual(["1:0"]);
    expect(other["1:0"]?.split(" ")).toContain(added[0]);
  });

  it("lands nothing without a motion, or for a discard that is not on the table", () => {
    renderStage();
    const still = pondClasses();
    cleanup();
    renderStage({ motion: { landing: { seat: 0, index: 0 } } });
    expect(pondClasses()).toEqual(still);
    cleanup();
    renderStage({ motion: { landing: { seat: 3, index: 5 } } });
    expect(pondClasses()).toEqual(still);
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
    // Only pond tiles carry a discard's place.
    for (const tile of stage().querySelectorAll("[data-d]")) {
      expect(tile.closest('[role="group"]')?.getAttribute("aria-label")).toMatch(/'s discards$/);
    }
  });

  it("draws hidden hands as backs, counted in the group's name", () => {
    renderStage({ revealed: new Set<Seat>([0]) });
    const hidden = screen.getByRole("group", { name: "B's hand, 13 tiles face down" });
    // The backs themselves are not announced one by one, and are no images.
    expect(within(hidden).queryAllByRole("img")).toEqual([]);
    expect(backs(hidden)).toHaveLength(13);
    expect(hidden.querySelector("img, [data-k]")).toBeNull();
    expect(screen.queryByRole("group", { name: "B's hand" })).toBeNull();
    // C (across) has 11 concealed tiles and a pon; D has a closed kan.
    expect(backs(screen.getByRole("group", { name: "C's hand, 11 tiles face down" }))).toHaveLength(
      11,
    );
    expect(backs(screen.getByRole("group", { name: "D's hand, 13 tiles face down" }))).toHaveLength(
      13,
    );
    expect(screen.getByRole("group", { name: "Pon: 9 Man, 9 Man, 9 Man" })).toBeTruthy();
    expect(screen.getByRole("group", { name: /^Closed kan/ })).toBeTruthy();
    // The viewed player's hand is face up.
    expect(
      within(screen.getByRole("group", { name: "A's hand" })).getAllByRole("img"),
    ).toHaveLength(13);
  });

  it("gives away nothing of a hidden hand: no face, no kind for the spotlight", () => {
    renderStage({ revealed: new Set<Seat>([0]) });
    // D holds the only red 5 Man and no other face of it is on the table.
    expect(stage().querySelector('[data-k="4"]')).toBeNull();
    expect(stage().innerHTML).not.toContain("Man5-Dora");
    cleanup();
    renderStage({ revealed: new Set<Seat>([0, 3]) });
    expect(stage().querySelector('[data-k="4"]')).not.toBeNull();
  });

  it("hides the viewed player's drawn tile with the hand, from another seat", () => {
    renderStage({ pov: 1, revealed: new Set<Seat>([1]) });
    const hidden = screen.getByRole("group", { name: "A's hand, 13 tiles face down" });
    expect(hidden.closest("[data-side]")).toBe(layer("left"));
    expect(backs(hidden)).toHaveLength(13);
    expect(screen.queryByAltText("1 Pin (just drawn)")).toBeNull();
    expect(
      within(screen.getByRole("group", { name: "B's hand" })).getAllByRole("img"),
    ).toHaveLength(13);
  });

  it("shows every hand that is revealed, as at a round's end", () => {
    renderStage({ revealed: new Set<Seat>([0, 1]) });
    expect(screen.getByRole("group", { name: "A's hand" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "B's hand" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "C's hand, 11 tiles face down" })).toBeTruthy();
  });

  /** The tile scales a seat's layer carries: its pond's and its hand row's. */
  const scales = (name: string) => {
    const pond = screen.getByRole("group", { name: `${name}'s discards` }).parentElement;
    const hand = screen.getByRole("group", { name: `${name}'s hand` }).closest("[style]");
    return {
      pond: pond?.style.getPropertyValue("--ps"),
      hand: (hand as HTMLElement).style.getPropertyValue("--hs"),
    };
  };

  it("writes each pond's and each hand row's own tile scale, 1 while they fit", () => {
    // The fixture's D holds thirteen tiles beside a closed kan, more than a real hand: its row
    // is the one that shrinks.
    const state = boardState();
    renderStage({}, state);
    for (const [seat, name] of names.entries()) {
      const view = state.seats[seat as Seat];
      expect(scales(name), name).toEqual({
        pond: pondScale(view.discards).toFixed(4),
        hand: handScale(view, seat as Seat).toFixed(4),
      });
    }
    // A short pond, and a closed hand with its draw.
    expect(scales("A")).toEqual({ pond: "1.0000", hand: "1.0000" });
    // The scales are the pond's and the row's alone: neither box carries the other's.
    const pond = screen.getByRole("group", { name: "A's discards" }).parentElement;
    expect(pond?.style.getPropertyValue("--hs")).toBe("");
    expect(pond?.hasAttribute("data-own-hand")).toBe(false);
  });

  it("shrinks only the tiles of a pond that has grown too long", () => {
    renderStage();
    const before = names.map(scales);
    cleanup();
    const discards: DiscardView[] = Array.from({ length: 30 }, () => ({
      tile: "1z",
      tsumogiri: true,
      riichi: false,
      called: false,
    }));
    renderStage({}, withSeat(2, { discards }));
    expect(Number(scales("C").pond)).toBeLessThan(1);
    expect(scales("C")).toEqual({ pond: pondScale(discards).toFixed(4), hand: before[2]?.hand });
    expect(["A", "B", "D"].map(scales)).toEqual([before[0], before[1], before[3]]);
    // The rows of the long pond: six, six and all the rest.
    const pond = screen.getByRole("group", { name: "C's discards" });
    expect([...pond.children].map((row) => row.querySelectorAll("img").length)).toEqual([6, 6, 18]);
  });

  it("shrinks only the tiles of a hand row with too many calls", () => {
    renderStage();
    const before = names.map(scales);
    cleanup();
    const kan: MeldView = {
      type: "daiminkan",
      tiles: ["7z", "7z", "7z"],
      from: 1,
      calledTile: "7z",
    };
    const view = { hand: ["1m" as const], drawn: "2m" as const, melds: [kan, kan, kan, kan] };
    renderStage({}, withSeat(0, view));
    expect(Number(scales("A").hand)).toBeLessThan(1);
    expect(scales("A")).toEqual({
      pond: before[0]?.pond,
      hand: handScale({ ...view, kita: [] }, 0).toFixed(4),
    });
    expect(["B", "C", "D"].map(scales)).toEqual(before.slice(1));
  });
});

describe("Alt+click on a discard", () => {
  it("jumps without letting the press through", () => {
    const onPondJump = vi.fn();
    const outside = vi.fn();
    renderStage({ onPondJump });
    stage().addEventListener("pointerdown", outside);
    const tile = screen.getByAltText("7 Sou, discarded right after drawing, last discard");
    // The press is cancelled as well as stopped.
    expect(fireEvent.pointerDown(tile, { altKey: true, button: 0 })).toBe(false);
    expect(onPondJump).toHaveBeenCalledWith({ seat: 3, index: 0 });
    expect(outside).not.toHaveBeenCalled();
    expect(fireEvent.pointerDown(tile, { button: 0 })).toBe(true);
    expect(onPondJump).toHaveBeenCalledTimes(1);
    expect(outside).toHaveBeenCalledTimes(1);
  });

  it("reads the discard from a sideways riichi tile too", () => {
    const onPondJump = vi.fn();
    renderStage({ onPondJump });
    fireEvent.pointerDown(screen.getByAltText("9 Man, riichi declaration, called"), {
      altKey: true,
      button: 0,
    });
    expect(onPondJump).toHaveBeenCalledWith({ seat: 1, index: 0 });
  });

  it("is an ordinary press anywhere else on the table, and with another button", () => {
    const onPondJump = vi.fn();
    const outside = vi.fn();
    renderStage({ onPondJump });
    stage().addEventListener("pointerdown", outside);
    const elsewhere = [
      screen.getByAltText("5 Man (red)"),
      screen.getByRole("group", { name: "D's discards" }),
      consoleButton(),
      stage(),
    ];
    for (const target of elsewhere) {
      fireEvent.pointerDown(target, { altKey: true, button: 0 });
    }
    // Alt with the secondary button is the step back it always is.
    fireEvent.pointerDown(
      screen.getByAltText("7 Sou, discarded right after drawing, last discard"),
      { altKey: true, button: 2 },
    );
    expect(onPondJump).not.toHaveBeenCalled();
    expect(outside).toHaveBeenCalledTimes(elsewhere.length + 1);
  });

  it("calls the handler of the latest render", () => {
    const first = vi.fn();
    const second = vi.fn();
    // The same ref, so the stage keeps the listener it has.
    const stageRef = { current: null as HTMLElement | null };
    const { rerender } = renderStage({ onPondJump: first, stageRef });
    rerender(stageElement({ onPondJump: second, stageRef }));
    fireEvent.pointerDown(
      screen.getByAltText("7 Sou, discarded right after drawing, last discard"),
      { altKey: true, button: 0 },
    );
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ seat: 3, index: 0 });
  });
});

describe("call captions", () => {
  it("show as decoration, for a moment", () => {
    vi.useFakeTimers();
    renderStage({ captions: [{ id: 1, seat: 2, kind: "pon" }] });
    const caption = screen.getByText("Pon");
    expect(caption.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(caption.closest("[data-side]")).toBe(caption);
    expect(caption.getAttribute("data-side")).toBe("top");
    // Upright over the table, not in a seat's turned layer.
    expect(caption.parentElement?.parentElement).toBe(stage().firstElementChild);
    act(() => {
      vi.advanceTimersByTime(CAPTION_MS - 1);
    });
    expect(screen.queryByText("Pon")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Pon")).toBeNull();
  });

  it("show again for the next call, after the last one has gone", () => {
    vi.useFakeTimers();
    const { rerender } = renderStage({ captions: [{ id: 1, seat: 2, kind: "pon" }] });
    act(() => {
      vi.advanceTimersByTime(CAPTION_MS);
    });
    rerender(stageElement({ captions: [] }));
    expect(stage().querySelector('[aria-hidden="true"] [data-side]')).toBeNull();
    rerender(stageElement({ captions: [{ id: 9, seat: 3, kind: "chi" }] }));
    expect(screen.getByText("Chi").getAttribute("data-side")).toBe("left");
  });

  it("centre each caption on its caller's pond, also two at once", () => {
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
        const anchor = captionAnchor(side);
        return [anchor.x.toFixed(5), anchor.y.toFixed(5)];
      }),
    );
    expect(at[0]).not.toEqual(at[1]);
  });

  it("follow the point of view", () => {
    renderStage({ pov: 2, captions: [{ id: 1, seat: 2, kind: "riichi" }] });
    const caption = screen.getByText("Riichi");
    expect(caption.getAttribute("data-side")).toBe("bottom");
    expect(caption.style.getPropertyValue("--ay")).toBe(captionAnchor("bottom").y.toFixed(5));
  });

  it("say a win in another colour than a call", () => {
    renderStage({
      captions: [
        { id: 1, seat: 1, kind: "pon" },
        { id: 2, seat: 2, kind: "kan" },
        { id: 3, seat: 3, kind: "ron" },
        { id: 4, seat: 0, kind: "tsumo" },
      ],
    });
    const classOf = (text: string) => screen.getByText(text).className;
    expect(classOf("Kan")).toBe(classOf("Pon"));
    expect(classOf("Tsumo")).toBe(classOf("Ron"));
    expect(classOf("Ron")).not.toBe(classOf("Pon"));
    expect(classOf("Ron").startsWith(classOf("Pon"))).toBe(true);
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

  it("draws three seats and an empty side that moves with the point of view", () => {
    for (const [pov, side] of [
      [0, "left"],
      [1, "top"],
      [2, "right"],
    ] as const) {
      renderSanma(pov);
      // The empty chair's layer keeps its place and holds nothing.
      expect(layer(side).childElementCount).toBe(0);
      expect(SIDES.filter((s) => layer(s).childElementCount === 0)).toEqual([side]);
      // The console has no cell on the empty side either.
      expect(cells().map((cell) => cell === null)).toEqual(SIDES.map((s) => s === side));
      expect(screen.getAllByRole("group", { name: /'s discards$/ })).toHaveLength(3);
      expect(screen.getAllByRole("group", { name: /'s hand$/ })).toHaveLength(3);
      expect(stage().textContent).not.toContain("Player 4");
      const own = stage().querySelector("[data-own-hand]") as HTMLElement;
      expect(own.closest("[data-side]")).toBe(layer("bottom"));
      expect(within(own).getByRole("group", { name: `${sanmaNames[pov]}'s hand` })).toBeTruthy();
      cleanup();
    }
  });

  it("gives the three seats East, South and West on the console", () => {
    renderSanma(0);
    const winds = [...consoleButton().querySelectorAll("[data-edge] > span > span:first-child")];
    expect(winds.map((wind) => wind.textContent)).toEqual(["E", "S", "W"]);
    expect(cells()[3]).toBeNull();
  });

  it("shows kita as a labelled group in its owner's row, with a ×n pill from two tiles on", () => {
    renderSanma(0);
    const kita = screen.getByRole("group", { name: "C's kita: 2 North tiles set aside" });
    expect(kita.closest("[data-side]")).toBe(layer("top"));
    expect(within(kita).getAllByRole("img")).toHaveLength(1);
    expect(within(kita).getByText("×2").getAttribute("aria-hidden")).toBe("true");
    // One tile is its own count; the viewed player's kita lies in the own row.
    const own = screen.getByRole("group", { name: "A's kita: 1 North tile set aside" });
    expect(own.closest("[data-own-hand]")).not.toBeNull();
    expect(own.textContent).toBe("");
    expect(screen.getAllByText("×2")).toHaveLength(1);
  });

  it("keeps kita face up beside a hidden hand", () => {
    renderSanma(0, { revealed: new Set<Seat>([0]) });
    const kita = screen.getByRole("group", { name: "C's kita: 2 North tiles set aside" });
    expect(within(kita).getByRole("img", { name: "North" })).toBeTruthy();
    expect(screen.getByRole("group", { name: /^C's hand, \d+ tiles face down$/ })).toBeTruthy();
  });
});
