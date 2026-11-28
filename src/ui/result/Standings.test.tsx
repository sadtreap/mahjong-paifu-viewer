// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Locale } from "../../i18n/locales";
import { writeStorage } from "../../storage";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { finalScores } from "./finalScores";
import { Standings, type StandingsProps } from "./Standings";

function renderStandings(patch: Partial<StandingsProps> = {}, locale?: Locale) {
  if (locale) {
    writeStorage("locale", locale);
  }
  const props: StandingsProps = {
    final: [30000, 20000, 40000, 10000],
    names: ["A", "B", "C", "D"],
    playerCount: 4,
    ...patch,
  };
  const { container } = render(
    <I18nProvider>
      <Standings {...props} />
    </I18nProvider>,
  );
  return container;
}

const table = (name = "Final standings") => screen.getByRole("table", { name });
const headers = (name?: string) =>
  within(table(name))
    .getAllByRole("columnheader")
    .map((header) => header.textContent);
/** The table's body rows as lists of cell texts, the row's header cell included. */
const rows = (name?: string) =>
  within(table(name))
    .getAllByRole("row")
    .slice(1)
    .map((row) => Array.from(row.children, (cell) => cell.textContent ?? ""));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Standings", () => {
  it("ranks the players by their final scores: place, name and score", () => {
    renderStandings();
    expect(rows()).toEqual([
      ["1st", "C", "40,000"],
      ["2nd", "A", "30,000"],
      ["3rd", "B", "20,000"],
      ["4th", "D", "10,000"],
    ]);
  });

  it("is a table named by its heading, with column headers for screen readers only", () => {
    renderStandings();
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toBe("Final standings");
    expect(table().getAttribute("aria-labelledby")).toBe(heading.id);
    expect(headers()).toEqual(["Rank", "Player", "Points"]);
    expect(table().querySelector("thead")?.className).toBe("sr-only");
    // Each row is named by its player.
    expect(
      within(table())
        .getAllByRole("rowheader")
        .map((header) => [header.textContent, header.getAttribute("scope")]),
    ).toEqual([
      ["C", "row"],
      ["A", "row"],
      ["B", "row"],
      ["D", "row"],
    ]);
  });

  it("gives a tie to the seat that started closer to East", () => {
    renderStandings({ final: [30000, 20000, 30000, 20000] });
    expect(rows()).toEqual([
      ["1st", "A", "30,000"],
      ["2nd", "C", "30,000"],
      ["3rd", "B", "20,000"],
      ["4th", "D", "20,000"],
    ]);
  });

  it("writes a score below zero with a real minus sign", () => {
    renderStandings({ final: [61200, 25000, 25000, -11200] });
    expect(rows()[3]).toEqual(["4th", "D", "−11,200"]);
  });

  it("never ranks the empty chair of a three-player game", () => {
    const sanma = sanmaCrossFormatGame();
    renderStandings({ final: finalScores(sanma), playerCount: 3, names: ["A", "B", "C", ""] });
    expect(rows()).toEqual([
      ["1st", "A", "42,100"],
      ["2nd", "C", "35,300"],
      ["3rd", "B", "27,600"],
    ]);
    cleanup();

    // Even when the empty chair's placeholder would outrank a score below zero.
    renderStandings({ final: [-5000, 60000, 50000, 0], playerCount: 3 });
    expect(rows().map((row) => row[1])).toEqual(["B", "C", "A"]);
  });

  it("shows names as the log has them", () => {
    renderStandings({ names: ["Maximilian Featherstonehaugh", "가나다라마", "Player 3", "D"] });
    expect(rows().map((row) => row[1])).toEqual([
      "Player 3",
      "Maximilian Featherstonehaugh",
      "가나다라마",
      "D",
    ]);
  });

  it("has nothing to press", () => {
    const container = renderStandings();
    expect(container.querySelector("button, a, input, [tabindex]")).toBeNull();
  });

  it("words the table in Korean and Japanese", () => {
    renderStandings({}, "ko");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("최종 순위");
    expect(headers("최종 순위")).toEqual(["순위", "플레이어", "점수"]);
    expect(rows("최종 순위")).toEqual([
      ["1위", "C", "40,000"],
      ["2위", "A", "30,000"],
      ["3위", "B", "20,000"],
      ["4위", "D", "10,000"],
    ]);
    cleanup();

    renderStandings({}, "ja");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("最終順位");
    expect(headers("最終順位")).toEqual(["順位", "プレイヤー", "持ち点"]);
    expect(rows("最終順位")).toEqual([
      ["1位", "C", "40,000"],
      ["2位", "A", "30,000"],
      ["3位", "B", "20,000"],
      ["4位", "D", "10,000"],
    ]);
  });
});
