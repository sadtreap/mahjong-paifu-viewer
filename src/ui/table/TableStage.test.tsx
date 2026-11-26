// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quad, Seat } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState } from "../../replay/types";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { boardState, game, round } from "../__fixtures__/game";
import type { DiscardRef, TableStageProps } from "../viewer/types";
import { discardIndexOf, stageProps } from "./__fixtures__/stageProps";
import { FLIGHT_FALLBACK_MS } from "./FlightLayer";
import { CAPTION_SLOTS } from "./geometry";
import { REVEAL_MS, TableStage } from "./TableStage";
import { POND_DWELL_MS } from "./useSpotlight";

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

  it("shows the round, the tiles left and the riichi stick on the table", () => {
    renderStage();
    // Honba is in the HUD, not in the round name.
    expect(screen.getByRole("button", { name: "East 1. Open the round list" }).textContent).toBe(
      "East 1",
    );
    expect(screen.getByText("60 tiles left")).toBeTruthy();
    expect(screen.getByText("60 left").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByRole("img", { name: "Riichi" })).toHaveLength(1);
  });

  it("draws the point of view's hand outside the plane, standing", () => {
    renderStage();
    const own = screen.getByRole("group", { name: "A's hand" });
    expect(own.closest("[data-side]")).toBeNull();
    expect(within(own).getAllByRole("img")[0]?.getAttribute("src")).toMatch(/tiles\/Man1\.svg$/);
    // The bottom seat has no hand row in the plane.
    expect(screen.getAllByRole("group", { name: "A's hand" })).toHaveLength(1);
  });

  it("draws hidden hands face down when walls are off", () => {
    renderStage({ revealed: new Set<Seat>([0]) });
    const hidden = screen.getByRole("group", { name: "B's hand" });
    for (const img of within(hidden).getAllByRole("img")) {
      expect(img.getAttribute("alt")).toBe("Face-down tile");
      expect(img.getAttribute("src")).toMatch(/tiles\/Back\.svg$/);
    }
    expect(stage().hasAttribute("data-walls")).toBe(false);
  });

  it("stands hidden hands up as walls, the far one in the unrotated layer", () => {
    renderStage({ revealed: new Set<Seat>([0]), walls: true });
    expect(stage().hasAttribute("data-walls")).toBe(true);
    const right = screen.getByRole("group", { name: "B's hand, 13 tiles face down" });
    expect(within(right).getAllByRole("img")).toHaveLength(13);
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
    expect(screen.queryByRole("group", { name: /face down$/ })).toBeNull();
    expect(screen.getByRole("group", { name: "B's hand" })).toBeTruthy();
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
    const back = within(screen.getAllByRole("group", { name: "B's hand" })[1] as HTMLElement);
    expect(back.getAllByRole("img")[0]?.hasAttribute("data-k")).toBe(false);
  });

  it("shows plates as text, not buttons", () => {
    renderStage();
    for (const name of names) {
      expect(screen.queryByRole("button", { name: new RegExp(`^${name}\\b`) })).toBeNull();
    }
    const plate = stage().querySelector('[data-seat="1"]') as HTMLElement;
    expect(plate.textContent).toContain("B");
    expect(plate.textContent).toContain("24,000");
    expect(plate.textContent).toContain("Riichi");
  });

  it("calls back from the round button", () => {
    const onRoundList = vi.fn();
    renderStage({ onRoundList });
    fireEvent.click(screen.getByRole("button", { name: "East 1. Open the round list" }));
    expect(onRoundList).toHaveBeenCalledTimes(1);
    // "Show result" lives in the dock's status line, not on the felt.
    expect(screen.queryByRole("button", { name: "Show result" })).toBeNull();
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

  it("steps plates and captions aside under an overlay card", () => {
    renderStage({ overlay: <div data-gesture="ignore">card</div> });
    expect(stage().hasAttribute("data-overlay")).toBe(true);
    expect(screen.getByText("card")).toBeTruthy();
  });

  it("shows call captions as decoration", () => {
    renderStage({ captions: [{ id: 1, seat: 2, kind: "pon" }] });
    const caption = screen.getByText("Pon");
    expect(caption.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("puts a double ron's captions in the console's two free strips", () => {
    // Point of view 0: seat 1 is on the right, seat 3 on the left.
    renderStage({
      captions: [
        { id: 1, seat: 3, kind: "ron" },
        { id: 2, seat: 1, kind: "ron" },
      ],
    });
    const ys = screen.getAllByText("Ron").map((el) => Number(el.style.getPropertyValue("--Y")));
    expect(ys).toEqual([...CAPTION_SLOTS]);
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

  it("never says a pond tile was called before the call is on the table", () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    const state = boardState();
    // The round's discard index knows the end of the round: here every discard gets called later.
    const base = discardIndexOf(state);
    const discards = {
      get: (ref: DiscardRef) => {
        const info = base.get(ref);
        return info && { ...info, called: true };
      },
    };
    renderStage({ discards }, state);
    const tile = screen.getByAltText("7 Sou, discarded right after drawing, last discard");
    fireEvent.pointerMove(tile, { pointerType: "mouse", buttons: 0 });
    act(() => {
      vi.advanceTimersByTime(20 + POND_DWELL_MS);
    });
    const tip = screen.getByText(/1st discard/).parentElement as HTMLElement;
    expect(tip.textContent).toContain("tsumogiri");
    expect(tip.textContent).not.toContain("called");
    // A tile this step shows as called still says so.
    fireEvent.pointerMove(screen.getByAltText("9 Man, riichi declaration, called"), {
      pointerType: "mouse",
      buttons: 0,
    });
    act(() => {
      vi.advanceTimersByTime(20 + POND_DWELL_MS);
    });
    expect(screen.getByText(/riichi tile/).textContent).toContain("called");
  });

  it("plays the round-end reveal on the step only, not when H or C changes the table later", () => {
    const state = boardState();
    const reveal = { flight: null, reveal: [1 as Seat] };
    const props = (overrides: Partial<TableStageProps>) =>
      stageProps({ game, round, state, names }, { revealed: new Set<Seat>([0, 1]), ...overrides });
    const leavingFaces = () =>
      (stage().querySelector('[data-side="right"]') as HTMLElement).querySelectorAll(
        '[aria-hidden="true"] img[alt="Face-down tile"]',
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
    expect(right.querySelectorAll('[aria-hidden="true"] img[alt="Face-down tile"]')).toHaveLength(
      13,
    );
    act(() => {
      vi.advanceTimersByTime(REVEAL_MS);
    });
    expect(right.querySelectorAll('img[alt="Face-down tile"]')).toHaveLength(0);
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
      expect(screen.getAllByRole("group", { name: /'s discards$/ })).toHaveLength(3);
      expect(stage().textContent).not.toContain("Player 4");
      cleanup();
    }
  });

  it("shows kita as a labelled group with a ×n pill, and the plates' winds", () => {
    renderSanma(0);
    const kita = screen.getByRole("group", { name: "C's kita: 2 North tiles set aside" });
    expect(within(kita).getAllByRole("img")).toHaveLength(1);
    expect(within(kita).getByText("×2").getAttribute("aria-hidden")).toBe("true");
    const own = screen.getByRole("group", { name: "A's kita: 1 North tile set aside" });
    expect(own.closest("[data-side]")).toBeNull();
    const winds = [...stage().querySelectorAll("[data-seat]")].map(
      (plate) => plate.querySelector('[aria-hidden="true"] > span:last-child')?.textContent,
    );
    expect(winds.sort()).toEqual(["E", "S", "W"]);
  });

  it("puts opponents' kita count in their plate as text", () => {
    renderSanma(0);
    expect(stage().querySelector('[data-seat="2"]')?.textContent).toContain("North ×2");
    // The point of view sees its own kita on the table.
    expect(stage().querySelector('[data-seat="0"]')?.textContent).not.toContain("North");
  });
});
