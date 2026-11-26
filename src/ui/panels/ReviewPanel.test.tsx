// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLog, Round, Seat } from "../../core/model";
import { activeSeats } from "../../core/players";
import { doraFromIndicator, tileKind } from "../../core/tile";
import { I18nProvider } from "../../i18n/I18nProvider";
import { MESSAGES } from "../../i18n/messages";
import type { BoardState } from "../../replay/types";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { unseenCounts } from "../analysis/hand";
import { playerNames } from "../labels";
import type { Position } from "../navigation";
import { gameOverview } from "../timeline/timelineModel";
import { createTimelineCache } from "../timelineCache";
import { createStepIndex } from "../viewer/stepIndex";
import type { PanelMode } from "../viewer/types";
import { roundMatrix } from "./matrix";
import { movesOf } from "./moves";
import { playerRows } from "./players";
import { ResultCollapsed } from "./ResultCard";
import { ReviewPanel, type ReviewPanelViewProps } from "./ReviewPanel";
import { finalScores, scoreSeries } from "./scoreHistory";

const { en } = MESSAGES;

function panelProps(
  game: GameLog,
  position: Position,
  pov: Seat,
  extra: Partial<ReviewPanelViewProps> = {},
): ReviewPanelViewProps {
  const timelines = createTimelineCache(game.rounds, game.playerCount);
  const ix = createStepIndex(game, timelines);
  const names = playerNames(en, game.players);
  const overview = gameOverview(game, ix, en, names, "en");
  const round = game.rounds[position.round] as Round;
  const timeline = timelines.get(position.round);
  const states = timeline.ok ? timeline.steps : [];
  const state = states[position.step] as BoardState;
  return {
    mode: "column",
    open: true,
    onClose: vi.fn(),
    title: "Phoenix room",
    source: "tenhou.net/6 JSON",
    result: null,
    players: playerRows(en, game, round, state, names),
    onPov: vi.fn(),
    pov,
    povName: names[pov],
    unseen: unseenCounts(state, pov, game.playerCount),
    playerCount: game.playerCount,
    doraKinds: new Set(
      state.doraIndicators.map((i) => tileKind(doraFromIndicator(i, game.playerCount))),
    ),
    picked: null,
    onPick: vi.fn(),
    spotlight: { hover: vi.fn(), clear: vi.fn() },
    series: scoreSeries(game),
    seats: activeSeats(game.playerCount),
    names,
    matrix: roundMatrix(game, overview, timelines, ix),
    final: finalScores(game),
    currentRound: position.round,
    currentRowRef: createRef<HTMLTableRowElement>(),
    moves: movesOf(round, states, ix, position.round),
    currentStep: position.step,
    movesOpen: true,
    onMovesOpen: vi.fn(),
    movesShowRest: false,
    onMovesShowRest: vi.fn(),
    onSeek: vi.fn(),
    ...extra,
  };
}

function renderPanel(props: ReviewPanelViewProps) {
  const view = render(
    <I18nProvider>
      <ReviewPanel {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
}

const sectionNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("section[aria-label]")).map((section) =>
    section.getAttribute("aria-label"),
  );

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ReviewPanel layout", () => {
  it("lists players before the unseen grid in the column, after it inline", () => {
    const column = renderPanel(panelProps(fixtureGame, { round: 0, step: 5 }, 0));
    expect(sectionNames(column.container)).toEqual(["Players", "Unseen from A", "Rounds"]);
    expect(screen.getByRole("complementary", { name: "Game review" })).toBeTruthy();
    cleanup();
    const inline = renderPanel(
      panelProps(fixtureGame, { round: 0, step: 5 }, 0, { mode: "inline" }),
    );
    expect(sectionNames(inline.container)).toEqual([
      "Game review",
      "Unseen from A",
      "Players",
      "Rounds",
    ]);
    // No close button inline.
    expect(screen.queryByRole("button", { name: "Hide review panel" })).toBeNull();
  });

  it("renders nothing as a closed column and closes from the header", () => {
    const closed = renderPanel(panelProps(fixtureGame, { round: 0, step: 0 }, 0, { open: false }));
    expect(closed.container.textContent).toBe("");
    cleanup();
    const { props } = renderPanel(panelProps(fixtureGame, { round: 0, step: 0 }, 0));
    fireEvent.click(screen.getByRole("button", { name: "Hide review panel" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("is a modal side sheet in sheet mode", () => {
    const { props, container } = renderPanel(
      panelProps(fixtureGame, { round: 0, step: 0 }, 0, { mode: "sheet" as PanelMode }),
    );
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.getAttribute("aria-label")).toBe("Game review");
    expect(dialog.getAttribute("data-gesture")).toBe("ignore");
    expect(within(dialog).getByRole("heading", { name: "Phoenix room" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide review panel" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("gives a docked result card the unseen grid's place in the column only", () => {
    const card = <section aria-label="Result card">card</section>;
    const column = renderPanel(
      panelProps(fixtureGame, { round: 0, step: 11 }, 0, { result: card }),
    );
    expect(sectionNames(column.container)).toEqual(["Result card", "Players", "Rounds"]);
    cleanup();
    const collapsed = renderPanel(
      panelProps(fixtureGame, { round: 0, step: 11 }, 0, {
        result: <ResultCollapsed summary="B wins" onShow={vi.fn()} />,
      }),
    );
    expect(sectionNames(collapsed.container)).toContain("Unseen from A");
    expect(screen.getByRole("button", { name: "Show result" })).toBeTruthy();
  });
});

describe("Players", () => {
  it("presses the POV's row and views from a seat on click", () => {
    const { props } = renderPanel(panelProps(fixtureGame, { round: 0, step: 5 }, 2));
    const rows = within(screen.getByRole("region", { name: "Players" })).getAllByRole("button");
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(rows[0]?.textContent).toContain("R1913");
    expect(rows[0]?.textContent).toContain("4 dan");
    expect(rows[0]?.getAttribute("title")).toBe("View from A");
    // B's riichi stick is part of its button's name.
    expect(within(rows[1] as HTMLElement).getByRole("img", { name: "Riichi" })).toBeTruthy();
    fireEvent.click(rows[3] as HTMLElement);
    expect(props.onPov).toHaveBeenCalledWith(3);
  });

  it("has three rows in a three-player game", () => {
    renderPanel(panelProps(sanmaCrossFormatGame(), { round: 0, step: 0 }, 1));
    const rows = within(screen.getByRole("region", { name: "Players" })).getAllByRole("button");
    expect(rows).toHaveLength(3);
    expect(document.body.textContent).not.toContain("Player 4");
  });
});

describe("Unseen grid", () => {
  it("labels each kind with its count and pins a kind on click", () => {
    const { props, rerender } = renderPanel(panelProps(fixtureGame, { round: 0, step: 0 }, 0));
    const grid = screen.getByRole("region", { name: "Unseen from A" });
    const cells = within(grid).getAllByRole("button");
    expect(cells).toHaveLength(34);
    // A holds 1m, 2m, 3m; the dora indicator 3m is visible too.
    const threeMan = within(grid).getByRole("button", { name: "3 Man: 2 unseen" });
    expect(threeMan.getAttribute("data-n")).toBe("2");
    expect(within(grid).getByRole("button", { name: "4 Man: 4 unseen, dora" })).toBeTruthy();
    expect(within(grid).getByText(/^\d+ tiles$/)).toBeTruthy();
    fireEvent.click(threeMan);
    expect(props.onPick).toHaveBeenCalledWith(2);
    rerender(
      <I18nProvider>
        <ReviewPanel {...props} picked={2} />
      </I18nProvider>,
    );
    const pressed = within(screen.getByRole("region", { name: "Unseen from A" })).getByRole(
      "button",
      { name: "3 Man: 2 unseen" },
    );
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pressed);
    expect(props.onPick).toHaveBeenLastCalledWith(null);
  });

  it("spotlights a kind while a mouse points at it, not on touch", () => {
    const { props } = renderPanel(panelProps(fixtureGame, { round: 0, step: 0 }, 0));
    const cell = screen.getByRole("button", { name: "East: 4 unseen" });
    fireEvent.pointerEnter(cell, { pointerType: "touch" });
    expect(props.spotlight.hover).not.toHaveBeenCalled();
    fireEvent.pointerEnter(cell, { pointerType: "mouse" });
    expect(props.spotlight.hover).toHaveBeenLastCalledWith(27);
    fireEvent.pointerLeave(cell, { pointerType: "mouse" });
    expect(props.spotlight.hover).toHaveBeenLastCalledWith(null);
  });

  it("has 27 kinds in a three-player game", () => {
    renderPanel(panelProps(sanmaCrossFormatGame(), { round: 0, step: 0 }, 0));
    const cells = within(screen.getByRole("region", { name: "Unseen from A" })).getAllByRole(
      "button",
    );
    expect(cells).toHaveLength(27);
    expect(screen.queryByRole("button", { name: /^2 Man/ })).toBeNull();
  });
});

describe("Round matrix", () => {
  it("labels each cell and jumps to its target", () => {
    const { props } = renderPanel(panelProps(fixtureGame, { round: 0, step: 3 }, 0));
    const win = screen.getByRole("button", {
      name: "E1-1, B: +5,200, won by ron, riichi. Go to the win",
    });
    fireEvent.click(win);
    expect(props.onSeek).toHaveBeenCalledWith({ round: 0, step: 11 });
    fireEvent.click(
      screen.getByRole("button", {
        name: "E1-1, A: -4,200, dealt in. Go to the discard that dealt in",
      }),
    );
    expect(props.onSeek).toHaveBeenLastCalledWith({ round: 0, step: 9 });
    fireEvent.click(screen.getByRole("button", { name: "Go to E1-1" }));
    expect(props.onSeek).toHaveBeenLastCalledWith({ round: 0, step: 0 });
    const current = screen.getByRole("button", { name: "Go to E1-1" }).closest("tr");
    expect(current?.getAttribute("aria-current")).toBe("true");
    expect((props.currentRowRef as { current: unknown }).current).toBe(current);
  });

  it("uses the full round names in the labels when given", () => {
    renderPanel(
      panelProps(fixtureGame, { round: 0, step: 0 }, 0, { roundNames: ["East 1, 1 honba"] }),
    );
    expect(screen.getByRole("button", { name: "Go to East 1, 1 honba" })).toBeTruthy();
  });

  it("has a column per playing seat", () => {
    renderPanel(panelProps(sanmaCrossFormatGame(), { round: 2, step: 0 }, 0));
    const table = screen.getByRole("table", { name: "Rounds" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 7 + 1);
    expect(table.querySelector('tr[aria-current="true"]')?.textContent).toContain("E2");
  });
});

describe("Moves", () => {
  it("lists the moves up to the current step and hides the rest", () => {
    const { props } = renderPanel(panelProps(fixtureGame, { round: 0, step: 5 }, 0));
    const list = screen.getByRole("list", { name: "Moves in this round" });
    const rows = within(list).getAllByRole("listitem");
    // Steps 1-5 minus B's draw (step 3): the POV sees only its own draws.
    expect(rows).toHaveLength(4);
    expect(rows[rows.length - 1]?.getAttribute("aria-current")).toBe("step");
    expect(within(list).getByRole("button", { name: "Turn 1, C: 9 Man, Pon" })).toBeTruthy();
    // B's riichi discard was called at step 5, which has happened.
    expect(
      within(list).getByRole("button", { name: "Turn 1, B: 9 Man, riichi, called" }),
    ).toBeTruthy();
    expect(screen.getByText("5 later moves hidden")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show the rest of this round" }));
    expect(props.onMovesShowRest).toHaveBeenCalledWith(true);
  });

  it("does not tell that a discard is called before the call", () => {
    renderPanel(panelProps(fixtureGame, { round: 0, step: 4 }, 0));
    expect(screen.getByRole("button", { name: "Turn 1, B: 9 Man, riichi" })).toBeTruthy();
  });

  it("shows the whole round with the rest switched on, and goes to a row's decision step", () => {
    const { props } = renderPanel(
      panelProps(fixtureGame, { round: 0, step: 5 }, 0, { movesShowRest: true }),
    );
    const list = screen.getByRole("list", { name: "Moves in this round" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(9);
    fireEvent.click(within(list).getByRole("button", { name: "Turn 2, A: 1 Pin, tsumogiri" }));
    expect(props.onSeek).toHaveBeenCalledWith({ round: 0, step: 9 });
    expect(screen.queryByText(/later moves hidden/)).toBeNull();
  });

  it("filters the rows by the unseen grid's pick", () => {
    renderPanel(panelProps(fixtureGame, { round: 0, step: 11 }, 0, { picked: tileKind("9m") }));
    const list = screen.getByRole("list", { name: "Moves in this round" });
    const visible = within(list)
      .getAllByRole("listitem", { hidden: true })
      .filter((item) => !item.hidden);
    expect(visible).toHaveLength(2);
    expect(screen.getByText("9 Man (2)")).toBeTruthy();
  });

  it("reports the section opening and closing", () => {
    const { props, container } = renderPanel(
      panelProps(fixtureGame, { round: 0, step: 0 }, 0, { movesOpen: false }),
    );
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(props.onMovesOpen).toHaveBeenCalledWith(true);
  });
});
