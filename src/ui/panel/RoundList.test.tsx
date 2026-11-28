// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Locale } from "../../i18n/locales";
import { writeStorage } from "../../storage";
import type { RoundListProps, RoundSummary } from "../viewer/types";
import { RoundList } from "./RoundList";

/** A ron, a tsumo, a draw, a double ron (the second win without points) and an unfinished round. */
const ROUNDS: RoundSummary[] = [
  {
    index: 0,
    wind: 0,
    number: 1,
    honba: 0,
    outcome: { kind: "win", wins: [{ seat: 1, from: 2, points: 18000 }] },
    deltas: [0, 18000, -18000, 0],
  },
  {
    index: 1,
    wind: 0,
    number: 1,
    honba: 1,
    outcome: { kind: "win", wins: [{ seat: 1, from: 1, points: 3900 }] },
    deltas: [-1300, 4200, -1600, -1300],
  },
  { index: 2, wind: 0, number: 2, honba: 0, outcome: { kind: "draw" }, deltas: [0, 0, 0, 0] },
  {
    index: 3,
    wind: 0,
    number: 3,
    honba: 1,
    outcome: {
      kind: "win",
      wins: [
        { seat: 0, from: 3, points: 8000 },
        { seat: 2, from: 3, points: undefined },
      ],
    },
    deltas: [8300, 0, 1000, -9300],
  },
  { index: 4, wind: 1, number: 1, honba: 0, outcome: null, deltas: [0, 0, 0, 0] },
];

function renderRounds(patch: Partial<RoundListProps> = {}, locale?: Locale) {
  if (locale) {
    writeStorage("locale", locale);
  }
  const props: RoundListProps = {
    rounds: ROUNDS,
    current: 2,
    names: ["A", "B", "C", "D"],
    pov: 1,
    onRound: vi.fn(),
    onFinal: vi.fn(),
    ...patch,
  };
  const ui = (current: number) => (
    <I18nProvider>
      <RoundList {...props} current={current} />
    </I18nProvider>
  );
  const view = render(ui(props.current));
  return { props, goTo: (current: number) => view.rerender(ui(current)) };
}

const list = (name = "Rounds") => screen.getByRole("region", { name });
const rows = (name?: string) => within(list(name)).getAllByRole("button");
function row(index: number, name?: string): HTMLElement {
  const found = rows(name)[index];
  if (!found) {
    throw new Error(`The list has no row ${index}`);
  }
  return found;
}

/** A row's parts: the round, how it ended and, when there is one, the viewed player's change. */
const parts = (element: HTMLElement) => [...element.children].map((part) => part.textContent);
/** The lines of a row's outcome, one per win, each in its pieces: the names and the words. */
const wins = (element: HTMLElement) =>
  [...(element.children[1]?.children ?? [])].map((line) =>
    [...line.children].map((piece) => piece.textContent),
  );
const change = (element: HTMLElement) => element.querySelector("[data-sign]");

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("RoundList", () => {
  it("is a section named by its heading, with a row per round and a last one for the standings", () => {
    renderRounds();
    expect(list().tagName).toBe("SECTION");
    expect(within(list()).getByRole("heading", { level: 2 }).textContent).toBe("Rounds");
    // The outcome says who won and off whom, not for how much: the points are in the result.
    expect(rows().map(parts)).toEqual([
      ["East 1", "B ron off C", "B +18,000"],
      ["East 1, 1 honba", "B tsumo", "B +4,200"],
      ["East 2", "Draw"],
      ["East 3, 1 honba", "A ron off DC ron off D"],
      // A round the log does not finish has no outcome.
      ["South 1", ""],
      [],
    ]);
    expect(row(5).textContent).toBe("Final standings");
    expect(rows().map((round) => round.getAttribute("data-round"))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      null,
    ]);
  });

  it("reads a row as the round, how it ended and whose change it shows", () => {
    renderRounds();
    for (const name of [
      "East 1 B ron off C B +18,000",
      "East 1, 1 honba B tsumo B +4,200",
      "East 2 Draw",
      "East 3, 1 honba A ron off D C ron off D",
      "South 1",
      "Final standings",
    ]) {
      expect(within(list()).getByRole("button", { name })).toBeTruthy();
    }
  });

  it("marks the round on the table", () => {
    const { goTo } = renderRounds();
    const current = () => rows().map((round) => round.getAttribute("aria-current"));
    expect(current()).toEqual([null, null, "true", null, null, null]);
    goTo(4);
    expect(current()).toEqual([null, null, null, null, "true", null]);
  });

  it("shows the viewed player's change in each round, and says whose it is", () => {
    renderRounds();
    // The heading's line says so to the eye, each row to a screen reader.
    const whose = within(list()).getByText("Change for B");
    expect(whose.getAttribute("aria-hidden")).toBe("true");
    expect(change(row(0))?.textContent).toBe("B +18,000");
    expect(within(row(0)).getAllByText("B")[1]?.className).toBe("sr-only");
    expect(change(row(0))?.getAttribute("data-sign")).toBe("gain");
    // Nothing for a round that changed nothing for the viewed player.
    expect(change(row(2))).toBeNull();
    expect(change(row(3))).toBeNull();
    expect(change(row(4))).toBeNull();
    cleanup();

    renderRounds({ pov: 3 });
    expect(screen.getByText("Change for D")).toBeTruthy();
    expect(rows().map((round) => change(round)?.textContent)).toEqual([
      undefined,
      "D −1,300",
      undefined,
      "D −9,300",
      undefined,
      undefined,
    ]);
    expect(change(row(3))?.getAttribute("data-sign")).toBe("loss");
  });

  it("stacks the wins of a multiple ron, one line for each", () => {
    renderRounds();
    expect(wins(row(3))).toEqual([
      ["A", " ron off ", "D"],
      ["C", " ron off ", "D"],
    ]);
    expect(wins(row(0))).toEqual([["B", " ron off ", "C"]]);
    expect(wins(row(1))).toEqual([["B", " tsumo"]]);
    // A draw is a word, not a line of names.
    expect(wins(row(2))).toEqual([]);
  });

  it("keeps short names whole and lets only long ones be cut", () => {
    renderRounds({ names: ["Al", "Maximilian Featherstonehaugh", "가나다라", "가나다라마"] });
    /** Whether the name is marked as never cut short, wherever the row's outcome has it. */
    const whole = (element: HTMLElement, name: string) => {
      const pieces = [...(element.children[1]?.querySelectorAll("span > span") ?? [])].filter(
        (piece) => piece.textContent === name,
      );
      expect(pieces.length).toBeGreaterThan(0);
      return pieces.every((piece) => piece.hasAttribute("data-short"));
    };
    // Eight Latin letters or four CJK characters wide at most.
    expect(whole(row(0), "Maximilian Featherstonehaugh")).toBe(false);
    expect(whole(row(0), "가나다라")).toBe(true);
    expect(whole(row(3), "Al")).toBe(true);
    expect(whole(row(3), "가나다라마")).toBe(false);
    // The words between the names are never names.
    expect(within(row(0)).getByText("ron off").hasAttribute("data-short")).toBe(false);
    // The whole name is still there to read, and in the heading's line.
    expect(
      within(list()).getByRole("button", {
        name: /^East 1 Maximilian Featherstonehaugh ron off 가나다라 Maximilian Featherstonehaugh \+18,000$/,
      }),
    ).toBe(row(0));
    expect(screen.getByText("Change for Maximilian Featherstonehaugh")).toBeTruthy();
  });

  it("jumps to the chosen round's start, or to the end of the game", () => {
    const { props } = renderRounds();
    fireEvent.click(within(list()).getByRole("button", { name: /^East 3/ }));
    expect(props.onRound).toHaveBeenCalledTimes(1);
    expect(props.onRound).toHaveBeenCalledWith(3);
    expect(props.onFinal).not.toHaveBeenCalled();
    // The round on the table can be chosen too: it goes back to that round's start.
    fireEvent.click(within(list()).getByRole("button", { name: /^East 2/ }));
    expect(props.onRound).toHaveBeenLastCalledWith(2);
    fireEvent.click(within(list()).getByRole("button", { name: "Final standings" }));
    expect(props.onFinal).toHaveBeenCalledTimes(1);
    expect(props.onRound).toHaveBeenCalledTimes(2);
  });

  it("words the rows in Korean, the names in elements of their own", () => {
    renderRounds({}, "ko");
    expect(within(list("국 목록")).getByText("B의 점수 변화")).toBeTruthy();
    expect(rows("국 목록").map(parts)).toEqual([
      ["동 1국", "B 론 (C 방총)", "B +18,000"],
      ["동 1국 1본장", "B 쯔모", "B +4,200"],
      ["동 2국", "유국"],
      ["동 3국 1본장", "A 론 (D 방총)C 론 (D 방총)"],
      ["남 1국", ""],
      [],
    ]);
    expect(row(5, "국 목록").textContent).toBe("최종 순위");
    expect(wins(row(0, "국 목록"))).toEqual([["B", " 론 (", "C", " 방총)"]]);
  });

  it("words the rows in Japanese, the names in elements of their own", () => {
    renderRounds({}, "ja");
    expect(within(list("局の一覧")).getByText("Bの収支")).toBeTruthy();
    expect(rows("局の一覧").map(parts)).toEqual([
      ["東1局", "BがCからロン", "B +18,000"],
      ["東1局 1本場", "B ツモ", "B +4,200"],
      ["東2局", "流局"],
      ["東3局 1本場", "AがDからロンCがDからロン"],
      ["南1局", ""],
      [],
    ]);
    expect(row(5, "局の一覧").textContent).toBe("最終順位");
    const [ron] = wins(row(0, "局の一覧"));
    expect(ron).toEqual(["B", "が", "C", "からロン"]);
    const pieces = [...(row(0, "局の一覧").children[1]?.firstElementChild?.children ?? [])];
    expect(pieces.map((piece) => piece.hasAttribute("data-short"))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});

describe("RoundList: keeping the round on the table in view", () => {
  const ROW = 40;
  const TOP = 300;

  type LayoutProperty = "scrollHeight" | "clientHeight" | "offsetHeight" | "offsetTop";

  /** Replaces a layout getter of every element, on whichever prototype happy-dom defines it. */
  function stub(name: LayoutProperty, value: (element: HTMLElement) => number) {
    let owner: object | null = HTMLElement.prototype;
    while (owner !== null && !Object.hasOwn(owner, name)) {
      owner = Object.getPrototypeOf(owner);
    }
    if (owner === null) {
      throw new Error(`Elements have no ${name}`);
    }
    vi.spyOn(owner as HTMLElement, name, "get").mockImplementation(function (this: HTMLElement) {
      return value(this);
    });
  }

  /**
   * happy-dom lays nothing out, so the list gets a layout by hand: it starts 300px down its offset
   * parent and is `height` tall inside; its heading and every row are 40px tall, one under another.
   */
  function layOut(height: number) {
    const isList = (element: Element | null) => element?.tagName === "SECTION";
    stub("scrollHeight", (element) => (isList(element) ? element.children.length * ROW : 0));
    stub("clientHeight", (element) => (isList(element) ? height : 0));
    stub("offsetHeight", (element) => (isList(element) ? height : ROW));
    stub("offsetTop", (element) => {
      if (isList(element)) {
        return TOP;
      }
      const parent = element.parentElement;
      return parent && isList(parent) ? TOP + [...parent.children].indexOf(element) * ROW : 0;
    });
  }

  it("scrolls the list just far enough to show the row, under the heading that stays on top", () => {
    // The heading and two rows fit; the list holds the heading, five rounds and the last row.
    layOut(3 * ROW);
    const { goTo } = renderRounds({ current: 0 });
    expect(list().scrollTop).toBe(0);
    // South 1 is the sixth line: its bottom edge comes to the list's bottom edge.
    goTo(4);
    expect(list().scrollTop).toBe(3 * ROW);
    // East 1, 1 honba is above what shows: it comes right under the heading.
    goTo(1);
    expect(list().scrollTop).toBe(ROW);
    // East 2 is already in view under it: nothing moves.
    goTo(2);
    expect(list().scrollTop).toBe(ROW);
    goTo(0);
    expect(list().scrollTop).toBe(0);
  });

  it("shows the row of the round the viewer opens on", () => {
    layOut(3 * ROW);
    renderRounds({ current: 4 });
    expect(list().scrollTop).toBe(3 * ROW);
  });

  it("leaves a list that shows every row alone", () => {
    layOut(7 * ROW);
    const scrolled = vi.spyOn(Element.prototype, "scrollTop", "set");
    const { goTo } = renderRounds({ current: 0 });
    goTo(4);
    expect(scrolled).not.toHaveBeenCalled();
  });

  it("never scrolls the page", () => {
    layOut(3 * ROW);
    const intoView = vi.spyOn(Element.prototype, "scrollIntoView");
    const scrollTo = vi.spyOn(window, "scrollTo");
    const scrollBy = vi.spyOn(window, "scrollBy");
    const { goTo } = renderRounds({ current: 0 });
    goTo(4);
    goTo(1);
    expect(intoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("does not take the focus when the round changes", () => {
    layOut(3 * ROW);
    const { goTo } = renderRounds({ current: 0 });
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    goTo(4);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
