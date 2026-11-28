// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Locale } from "../../i18n/locales";
import { MESSAGES } from "../../i18n/messages";
import { writeStorage } from "../../storage";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { playerRows } from "../controls/players";
import { gameOverview, roundDeltas } from "../controls/roundSummary";
import { playerNames, roundLabel } from "../labels";
import { resultStep } from "./__fixtures__/resultStep";
import { Panel } from "./Panel";
import { PanelActions } from "./PanelActions";
import { PlayerList } from "./PlayerList";
import { ResultBlock } from "./ResultBlock";
import { RoundHeader } from "./RoundHeader";
import { RoundList } from "./RoundList";

const { en } = MESSAGES;
const nothing = () => {};

function renderPanel(children: ReactNode, locale?: Locale) {
  if (locale) {
    writeStorage("locale", locale);
  }
  return render(
    <I18nProvider>
      <Panel>{children}</Panel>
    </I18nProvider>,
  );
}

/** The panel's sections as the viewer puts them together, at the result of the game's first round. */
function sections() {
  const game = sanmaCrossFormatGame();
  const { round, board } = resultStep(game, 0);
  const names = playerNames(en, game.players);
  return (
    <>
      <RoundHeader
        roundName={roundLabel(en, round)}
        turn={7}
        wallRemaining={board.wallRemaining}
        deposits={board.riichiSticks}
        limits={{ gameStart: false, gameEnd: false, lastRound: false }}
        onNav={() => true}
      />
      <ResultBlock
        results={board.results}
        seats={board.seats}
        names={names}
        playerCount={game.playerCount}
        final={null}
        doraIndicators={board.doraIndicators}
        onNextRound={nothing}
      />
      <PlayerList
        players={playerRows(game.playerCount, round, board, names)}
        pov={0}
        onPov={nothing}
        showAllHands
        onToggleHands={nothing}
        changes={roundDeltas(board.results)}
        tenpai={null}
      />
      <RoundList
        rounds={gameOverview(game)}
        current={0}
        names={names}
        pov={0}
        onRound={nothing}
        onFinal={nothing}
      />
      <PanelActions
        linkable
        onOpenLog={nothing}
        onCopyLink={nothing}
        onSettings={nothing}
        onHelp={nothing}
      />
    </>
  );
}

const panel = (name = "Game") => screen.getByRole("complementary", { name });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Panel", () => {
  it("is a named landmark around its sections, in the order given", () => {
    const { container } = renderPanel(
      <>
        <section aria-label="One" />
        <section aria-label="Two" />
      </>,
    );
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(panel());
    expect(panel().tagName).toBe("ASIDE");
    expect([...panel().children].map((child) => child.getAttribute("aria-label"))).toEqual([
      "One",
      "Two",
    ]);
  });

  it("is named in Korean and Japanese", () => {
    renderPanel(null, "ko");
    expect(panel("대국 정보")).toBeTruthy();
    cleanup();
    renderPanel(null, "ja");
    expect(panel("対局情報")).toBeTruthy();
  });

  it("gives the sections one heading each, at one level, under the page's own", () => {
    renderPanel(sections());
    const headings = (level: number) =>
      within(panel())
        .queryAllByRole("heading", { level })
        .map((heading) => heading.textContent);
    expect(headings(1)).toEqual([]);
    expect(headings(2)).toEqual(["East 1", "Round result", "Players", "Rounds"]);
    // Only the result has headings of its own, one level down.
    const lower = within(panel()).getAllByRole("heading", { level: 3 });
    expect(lower.map((heading) => heading.textContent)).toEqual(["A Ron off B"]);
    expect(lower.every((heading) => heading.closest("[data-result]") !== null)).toBe(true);
  });

  it("names each of its regions differently, and the group of the app's actions", () => {
    renderPanel(sections());
    expect(within(panel()).getAllByRole("region")).toHaveLength(3);
    for (const name of ["Round result", "Players", "Rounds"]) {
      expect(within(panel()).getAllByRole("region", { name }), name).toHaveLength(1);
    }
    expect(within(panel()).getByRole("group", { name: "Menu" })).toBeTruthy();
  });
});
