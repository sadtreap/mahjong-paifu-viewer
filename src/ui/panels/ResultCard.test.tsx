// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLog, Quad, Round } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { MESSAGES } from "../../i18n/messages";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState } from "../../replay/types";
import { makeGame, makeRound, win } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { drawWaits, riichiLines } from "../analysis/aids";
import { playerNames } from "../labels";
import { withRevealedHands } from "../reveal";
import { ResultCard, type ResultCardViewProps, ResultCollapsed } from "./ResultCard";

const { en } = MESSAGES;

function cardProps(
  game: GameLog,
  index: number,
  extra: Partial<ResultCardViewProps> = {},
): ResultCardViewProps {
  const round = game.rounds[index] as Round;
  const states = buildTimeline(round, game.playerCount);
  const last = states[states.length - 1] as BoardState;
  const seats = withRevealedHands(last.seats, last.results);
  return {
    results: last.results,
    seats,
    names: playerNames(en, game.players),
    playerCount: game.playerCount,
    final: null,
    startScores: round.scores,
    riichiLines: riichiLines(round, states, game.playerCount),
    drawWaits: drawWaits(last.results, seats, game.playerCount),
    mode: "docked",
    onHide: vi.fn(),
    onNextRound: vi.fn(),
    ...extra,
  };
}

function renderCard(props: ResultCardViewProps) {
  const view = render(
    <I18nProvider>
      <ResultCard {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ResultCard: a win", () => {
  it("shows the winner, value, hand, ura, riichi line, yaku and before → after", () => {
    renderCard(cardProps(fixtureGame, 0, { doraIndicators: ["3m"] }));
    const card = screen.getByRole("region", { name: "Round result" });
    const article = within(card).getByRole("article");
    expect(within(article).getByRole("heading", { level: 3 }).textContent).toBe("BRon off A");
    expect(within(article).getByText("2 han · 40 fu · 3,900 points")).toBeTruthy();
    const hand = within(article).getByRole("group", { name: "Winning hand" });
    expect(within(hand).getByRole("img", { name: "Winning tile: 1 Pin" })).toBeTruthy();
    expect(within(article).getByText("Ura dora indicators")).toBeTruthy();
    expect(within(article).getByText("Dora indicators")).toBeTruthy();
    expect(within(article).getByText("Riichi turn 1")).toBeTruthy();
    expect(within(article).getByRole("list", { name: "Yaku" }).textContent).toContain("Riichi");
    // B paid its riichi stick (24,000) and collects 5,200; A pays 4,200.
    expect(within(article).getByText("24,000 → 29,200")).toBeTruthy();
    expect(within(article).getByText("25,000 → 20,800")).toBeTruthy();
    expect(within(article).getByText("+5,200")).toBeTruthy();
  });

  it("shows the winner's kita with the hand in a three-player game", () => {
    renderCard(cardProps(sanmaCrossFormatGame(), 1));
    const hand = screen.getByRole("group", { name: "Winning hand" });
    expect(
      within(hand).getByRole("group", { name: "C's kita: 1 North tile set aside" }),
    ).toBeTruthy();
    // Three playing seats in the delta table.
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1 + 3);
    expect(document.body.textContent).not.toContain("Player 4");
  });

  it("lists the other riichi players' lines", () => {
    // East 1 of the sanma game: B declared riichi, A won.
    renderCard(cardProps(sanmaCrossFormatGame(), 0));
    expect(screen.getByText("B: riichi turn 2")).toBeTruthy();
    expect(screen.getByRole("group", { name: /^waited / })).toBeTruthy();
  });

  it("stacks the wins of a double ron and chains their before → after", () => {
    const round = makeRound({
      events: [
        { type: "draw", seat: 0, tile: "1z" },
        { type: "discard", seat: 0, tile: "1z", tsumogiri: true, riichi: false },
        win(1, 0, [-2000, 2000, 0, 0], { han: 1, fu: 30, points: 2000 }),
        win(2, 0, [-3900, 0, 3900, 0], { han: 3, fu: 30, points: 3900 }),
      ],
    });
    renderCard(cardProps(makeGame([round]), 0));
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(within(articles[0] as HTMLElement).getByText("25,000 → 23,000")).toBeTruthy();
    expect(within(articles[1] as HTMLElement).getByText("23,000 → 19,100")).toBeTruthy();
  });
});

describe("ResultCard: a draw", () => {
  it("lists the playing seats with each tenpai hand's waits", () => {
    // East 3, honba 1: A and C tenpai.
    renderCard(cardProps(sanmaCrossFormatGame(), 4));
    const article = screen.getByRole("article");
    expect(within(article).getByRole("heading").textContent).toBe("Exhaustive draw");
    const rows = within(article).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByRole("group", { name: /^Waits / })).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByRole("group")).toBeNull();
    expect(rows[1]?.textContent).toContain("Noten");
    expect(within(rows[2] as HTMLElement).getByRole("group", { name: /^Waits / })).toBeTruthy();
  });
});

describe("ResultCard: actions and modes", () => {
  it("hides and goes to the next round", () => {
    const { props } = renderCard(cardProps(fixtureGame, 0));
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(props.onHide).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Next round" }));
    expect(props.onNextRound).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Final standings" })).toBeNull();
  });

  it("shows the final standings at the game end, without Next round", () => {
    const sanma = sanmaCrossFormatGame();
    const final = sanma.finalScores as Quad<number>;
    renderCard(cardProps(sanma, 6, { final }));
    const standings = screen.getByRole("region", { name: "Final standings" });
    expect(
      within(standings)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["1stA42,100", "2ndC35,300", "3rdB27,600"]);
    expect(screen.queryByRole("button", { name: "Next round" })).toBeNull();
  });

  it("is docked in the page theme or floats over the stage, ignored by stage gestures", () => {
    const docked = renderCard(cardProps(fixtureGame, 0));
    const card = docked.container.querySelector("[data-result-card]");
    expect(card?.getAttribute("data-result-card")).toBe("docked");
    expect(card?.getAttribute("data-gesture")).toBe("ignore");
    // Docked: the card itself, no overlay layer around it.
    expect(card?.parentElement).toBe(docked.container);
    cleanup();
    const overlay = renderCard(cardProps(fixtureGame, 0, { mode: "overlay" }));
    const floating = overlay.container.querySelector('[data-result-card="overlay"]');
    const layer = floating?.parentElement;
    expect(layer).not.toBe(overlay.container);
    expect(layer?.className).not.toBe(card?.className);
  });

  it("marks an overlay card with more below its fold, until it is scrolled to the end", () => {
    const { container } = renderCard(cardProps(fixtureGame, 0, { mode: "overlay" }));
    const card = container.querySelector('[data-result-card="overlay"]') as HTMLElement;
    expect(card.hasAttribute("data-more")).toBe(false);
    let top = 0;
    Object.defineProperty(card, "scrollHeight", { configurable: true, get: () => 454 });
    Object.defineProperty(card, "clientHeight", { configurable: true, get: () => 303 });
    Object.defineProperty(card, "scrollTop", { configurable: true, get: () => top });
    fireEvent.scroll(card);
    expect(card.hasAttribute("data-more")).toBe(true);
    top = 151;
    fireEvent.scroll(card);
    expect(card.hasAttribute("data-more")).toBe(false);
  });

  it("does not take the focus when it opens", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    renderCard(cardProps(fixtureGame, 0, { mode: "overlay" }));
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});

describe("ResultCollapsed", () => {
  it("shows the summary and a button that shows the card again", () => {
    const onShow = vi.fn();
    render(
      <I18nProvider>
        <ResultCollapsed summary="B wins by ron off A" onShow={onShow} />
      </I18nProvider>,
    );
    expect(screen.getByText("B wins by ron off A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show result" }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });
});
