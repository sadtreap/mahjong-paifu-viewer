// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLog, Quad, RyukyokuReason, WinEvent } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Locale } from "../../i18n/locales";
import { MESSAGES } from "../../i18n/messages";
import type { MeldView, SeatView } from "../../replay/types";
import { writeStorage } from "../../storage";
import { ryukyoku, tiles, win } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { playerNames } from "../labels";
import type { ResultBlockProps } from "../viewer/types";
import { resultStep } from "./__fixtures__/resultStep";
import { ResultBlock } from "./ResultBlock";

const { en } = MESSAGES;

/** The block's props at the result step of one round of a game, as the viewer computes them. */
function roundProps(
  game: GameLog,
  index: number,
  extra: Partial<ResultBlockProps> = {},
): ResultBlockProps {
  const { board } = resultStep(game, index);
  return {
    results: board.results,
    seats: board.seats,
    names: playerNames(en, game.players),
    playerCount: game.playerCount,
    final: null,
    doraIndicators: board.doraIndicators,
    onNextRound: vi.fn(),
    ...extra,
  };
}

function seat(melds: MeldView[] = []): SeatView {
  return { hand: [], drawn: null, melds, kita: [], discards: [], score: 25000, riichi: false };
}

/** Hand-made props: these results, four players named A to D, no calls unless `seats` has them. */
function madeProps(
  results: ResultBlockProps["results"],
  extra: Partial<ResultBlockProps> = {},
): ResultBlockProps {
  return {
    results,
    seats: [seat(), seat(), seat(), seat()],
    names: ["A", "B", "C", "D"],
    playerCount: 4,
    final: null,
    doraIndicators: ["1z"],
    onNextRound: vi.fn(),
    ...extra,
  };
}

function renderBlock(props: ResultBlockProps, locale?: Locale) {
  if (locale) {
    writeStorage("locale", locale);
  }
  const view = render(
    <I18nProvider>
      <ResultBlock {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
}

const block = (name = "Round result") => screen.getByRole("region", { name });
/** The wins, one article each, in order. */
const wins = () => within(block()).getAllByRole("article");
/** The headings under the block's own, in order: who won and how, the draw, the standings. */
const titles = (name?: string) =>
  within(block(name))
    .getAllByRole("heading", { level: 3 })
    .map((title) => title.textContent);
/** A win's value in its parts, in order: the points, then how the hand counts. */
const value = (article: HTMLElement) =>
  [...(article.querySelector(":scope > p")?.children ?? [])].map((part) => part.textContent);
const handLine = () => block().style.getPropertyValue("--hand-line");

/** The table's body rows as lists of cell texts, the row's header cell included. */
function tableRows(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => Array.from(row.children, (cell) => cell.textContent ?? ""));
}

const haneman: Partial<WinEvent> = {
  tile: "3s",
  hand: tiles("234m234p22345s3s"),
  han: 6,
  limit: "haneman",
  points: 18000,
  yaku: [
    { key: "menzenTsumo", han: 1 },
    { key: "pinfu", han: 1 },
    { key: "tanyao", han: 1 },
    { key: "sanshokuDoujun", han: 2 },
    { key: "dora", han: 1 },
  ],
};

const pon: MeldView = { type: "pon", tiles: ["5z", "5z"], from: 3, calledTile: "5z" };
const chi: MeldView = { type: "chi", tiles: ["2s", "3s"], from: 0, calledTile: "1s" };
/** C wins off D with a pon of haku beside the hand. */
const called = () => win(2, 3, [0, 0, 1000, -1000], { tile: "3p", hand: tiles("11555m403p") });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ResultBlock: a win", () => {
  it("shows a ron: who won off whom, the value, the hand, the indicators and the yaku", () => {
    renderBlock(roundProps(fixtureGame, 0));
    expect(titles()).toEqual(["B Ron off A"]);
    const [ron, ...rest] = wins() as [HTMLElement, ...HTMLElement[]];
    expect(rest).toHaveLength(0);
    expect(within(block()).getByRole("article", { name: "B Ron off A" })).toBe(ron);
    expect(value(ron)).toEqual(["3,900 points", "2 han · 40 fu"]);
    const hand = within(ron).getByRole("group", { name: "Winning hand" });
    expect(within(hand).getAllByRole("img")).toHaveLength(14);
    expect(within(hand).getByRole("img", { name: "Winning tile: 1 Pin" })).toBeTruthy();
    const dora = within(ron).getByRole("group", { name: "Dora indicators" });
    expect(within(dora).getByRole("img", { name: "3 Man" })).toBeTruthy();
    const ura = within(ron).getByRole("group", { name: "Ura Dora indicators" });
    expect(within(ura).getByRole("img", { name: "5 Sou" })).toBeTruthy();
    const yaku = within(ron).getByRole("list", { name: "Yaku" });
    expect(within(yaku).getAllByRole("listitem")).toHaveLength(2);
    expect(yaku.textContent).toContain("Riichi");
  });

  it("puts the winner's name first in the win's heading and the points first in its value", () => {
    renderBlock(roundProps(fixtureGame, 0));
    const [ron] = wins() as [HTMLElement];
    const title = within(ron).getByRole("heading", { level: 3 });
    expect([...title.children].map((part) => part.textContent)).toEqual(["B", "Ron off A"]);
    // The points are the large number: marked up as the part that matters.
    expect(within(ron).getByText("3,900 points").tagName).toBe("STRONG");
    expect(within(ron).getByText("2 han · 40 fu").tagName).toBe("SPAN");
  });

  it("shows a tsumo with a limit hand: the limit's name instead of the fu", () => {
    renderBlock(madeProps([win(0, 0, [18000, -6000, -6000, -6000], { ...haneman, fu: 20 })]));
    expect(titles()).toEqual(["A Tsumo"]);
    const [tsumo] = wins() as [HTMLElement];
    expect(value(tsumo)).toEqual(["18,000 points", "6 han · Haneman"]);
    expect(within(tsumo).queryByRole("group", { name: "Ura Dora indicators" })).toBeNull();
    expect(within(tsumo).getByRole("list", { name: "Yaku" }).children).toHaveLength(5);
  });

  it("names the player liable for the hand (pao)", () => {
    const yakuman = win(2, 1, [0, -16000, 32000, -16000], {
      limit: "yakuman",
      points: 32000,
      yaku: [{ key: "daisangen", han: 13, yakuman: true }],
      pao: 3,
    });
    renderBlock(madeProps([yakuman]));
    expect(titles()).toEqual(["C Ron off B"]);
    const [ron] = wins() as [HTMLElement];
    expect(value(ron)).toEqual(["32,000 points", "Yakuman"]);
    expect(within(ron).getByText("Liability (pao): D")).toBeTruthy();
    expect(within(ron).getByRole("listitem").textContent).toBe("DaisangenYakuman");
  });

  it("shows only the part of the value the log has", () => {
    const base = [-1000, 1000, 0, 0] as Quad<number>;
    renderBlock(madeProps([win(1, 0, base, { tile: "7z", points: 1000 })]));
    expect(value(wins()[0] as HTMLElement)).toEqual(["1,000 points"]);
    cleanup();

    renderBlock(madeProps([win(1, 0, base, { tile: "7z", han: 1, fu: 30 })]));
    expect(value(wins()[0] as HTMLElement)).toEqual(["1 han · 30 fu"]);
    cleanup();

    // Neither: no empty line.
    renderBlock(madeProps([win(1, 0, base, { tile: "7z" })]));
    expect((wins()[0] as HTMLElement).querySelector("p")).toBeNull();
  });

  it("shows the winner's calls with the hand, not another player's", () => {
    const props = madeProps([called()]);
    props.seats = [seat(), seat([chi]), seat([pon]), seat()];
    renderBlock(props);
    const hand = within(block()).getByRole("group", { name: "Winning hand" });
    expect(within(hand).getAllByRole("img")).toHaveLength(8 + 3);
    expect(within(hand).getByRole("group", { name: "Pon: Haku, Haku, Haku" })).toBeTruthy();
    expect(within(hand).queryByRole("group", { name: /^Chi/ })).toBeNull();
  });

  it("reads the concealed tiles, then the winning tile, then the calls", () => {
    const props = madeProps([called()]);
    props.seats[2] = seat([pon]);
    renderBlock(props);
    const hand = within(block()).getByRole("group", { name: "Winning hand" });
    const images = within(hand).getAllByRole("img");
    expect(images.map((image) => image.getAttribute("alt"))).toEqual([
      "1 Man",
      "1 Man",
      "5 Man",
      "5 Man",
      "5 Man",
      "4 Pin",
      "5 Pin (red)",
      "Winning tile: 3 Pin",
      "Haku",
      "Haku",
      "Haku",
    ]);
    const meld = within(hand).getByRole("group", { name: "Pon: Haku, Haku, Haku" });
    expect(meld.contains(images[8] as HTMLElement)).toBe(true);
  });

  it("gives the tile size the width of the hand's concealed tiles with the winning tile", () => {
    const props = madeProps([called()]);
    props.seats[2] = seat([pon]);
    renderBlock(props);
    // Seven tiles, the winning tile after its gap and the margin before the calls.
    expect(Number(handLine())).toBeCloseTo(8.8);
    cleanup();

    // A closed hand: thirteen tiles and the winning tile after its gap.
    renderBlock(roundProps(fixtureGame, 0));
    expect(Number(handLine())).toBeCloseTo(14.35);
  });

  it("shows only the winning tile, and no yaku list, when the log has neither hand nor yaku", () => {
    renderBlock(madeProps([win(1, 0, [-1000, 1000, 0, 0], { tile: "7z" })]));
    expect(titles()).toEqual(["B Ron off A"]);
    expect(within(block()).queryByRole("group", { name: "Winning hand" })).toBeNull();
    const tile = within(block()).getByRole("group", { name: "Winning tile" });
    expect(within(tile).getByRole("img", { name: "Chun" })).toBeTruthy();
    expect(within(block()).queryByRole("list")).toBeNull();
    // No hand to size the tiles by: the stylesheet's own width stands.
    expect(handLine()).toBe("");
  });

  it("leaves the indicator line out when the log has no indicators", () => {
    renderBlock(
      madeProps([win(0, 0, [3000, -1000, -1000, -1000], haneman)], { doraIndicators: [] }),
    );
    expect(within(block()).getByRole("group", { name: "Winning hand" })).toBeTruthy();
    expect(within(block()).queryByRole("group", { name: "Dora indicators" })).toBeNull();
    expect(within(block()).queryByRole("group", { name: "Ura Dora indicators" })).toBeNull();
  });

  it("shows names as the log has them, long ones and numbered ones alike", () => {
    const names: Quad<string> = ["Maximilian Featherstonehaugh", "가나다라마", "Player 3", "D"];
    renderBlock(madeProps([win(1, 0, [-1000, 1000, 0, 0], { tile: "7z" })], { names }));
    expect(titles()).toEqual(["가나다라마 Ron off Maximilian Featherstonehaugh"]);
  });
});

describe("ResultBlock: a draw", () => {
  it("names the draw in a heading, with no win, hand or table under it", () => {
    // East 3, honba 1 of the three-player game: an exhaustive draw.
    renderBlock(roundProps(sanmaCrossFormatGame(), 4));
    expect(titles()).toEqual(["Exhaustive draw"]);
    expect(within(block()).queryByRole("article")).toBeNull();
    expect(within(block()).queryByRole("group")).toBeNull();
    expect(within(block()).queryByRole("img")).toBeNull();
    // Who was tenpai and how the points moved is in the player list.
    expect(within(block()).queryByRole("table")).toBeNull();
    expect(block().textContent).not.toMatch(/Tenpai|Noten/);
    expect(handLine()).toBe("");
    expect(within(block()).getAllByRole("button")).toHaveLength(1);
  });

  it("names an abortive draw", () => {
    // East 3, honba 2 of the three-player game: nine terminals.
    renderBlock(roundProps(sanmaCrossFormatGame(), 5));
    expect(titles()).toEqual([en.ryukyoku.kyuushuKyuuhai]);
    expect(within(block()).getAllByRole("button")).toHaveLength(1);
  });

  it("has a name for every kind of draw", () => {
    for (const reason of Object.keys(en.ryukyoku) as RyukyokuReason[]) {
      renderBlock(madeProps([ryukyoku(reason)]));
      expect(titles(), reason).toEqual([en.ryukyoku[reason]]);
      cleanup();
    }
  });
});

describe("ResultBlock: a multiple ron", () => {
  const first = win(1, 0, [-2300, 3300, 0, 0], {
    tile: "3p",
    hand: tiles("123m3p456s3p"),
    han: 1,
    fu: 30,
    points: 2000,
    yaku: [{ key: "hatsu", han: 1 }],
  });
  const second = win(3, 0, [-8000, 0, 0, 8000], {
    tile: "3p",
    hand: tiles("234m12p22345678s3p"),
    uraIndicators: ["9m"],
    han: 5,
    limit: "mangan",
    points: 8000,
    yaku: [
      { key: "riichi", han: 1 },
      { key: "pinfu", han: 1 },
      { key: "tanyao", han: 1 },
      { key: "dora", han: 2 },
    ],
  });

  it("stacks the wins, each with its own heading, value, hand and yaku", () => {
    const hatsu: MeldView = { type: "pon", tiles: ["6z", "6z"], from: 2, calledTile: "6z" };
    const props = madeProps([first, second]);
    props.seats = [seat(), seat([hatsu]), seat(), seat()];
    renderBlock(props);
    expect(titles()).toEqual(["B Ron off A", "D Ron off A"]);
    const [b, d, ...rest] = wins();
    expect(rest).toHaveLength(0);
    const winB = within(b as HTMLElement);
    const winD = within(d as HTMLElement);
    expect(winB.getByRole("heading", { level: 3 }).textContent).toBe("B Ron off A");
    expect(value(b as HTMLElement)).toEqual(["2,000 points", "1 han · 30 fu"]);
    expect(winB.getByRole("group", { name: /^Pon/ })).toBeTruthy();
    expect(winB.getAllByRole("listitem")).toHaveLength(1);
    expect(winB.queryByRole("group", { name: "Ura Dora indicators" })).toBeNull();
    expect(winD.getByRole("heading", { level: 3 }).textContent).toBe("D Ron off A");
    expect(value(d as HTMLElement)).toEqual(["8,000 points", "5 han · Mangan"]);
    expect(winD.queryByRole("group", { name: /^Pon/ })).toBeNull();
    expect(winD.getAllByRole("listitem")).toHaveLength(4);
    expect(winD.getByRole("group", { name: "Ura Dora indicators" })).toBeTruthy();
    // Both show the round's dora indicators.
    expect(within(block()).getAllByRole("group", { name: "Dora indicators" })).toHaveLength(2);
  });

  it("sizes the tiles of every hand by the widest one", () => {
    renderBlock(madeProps([first, second]));
    // D's thirteen tiles and the winning tile; B's hand of eight is narrower.
    expect(Number(handLine())).toBeCloseTo(14.35);
  });

  it("has one way on, whatever the number of wins", () => {
    renderBlock(madeProps([first, second]));
    expect(within(block()).getAllByRole("button")).toHaveLength(1);
  });
});

describe("ResultBlock: the last round", () => {
  it("shows the final standings by rank under the win, and no next round", () => {
    const sanma = sanmaCrossFormatGame();
    renderBlock(roundProps(sanma, 6, { final: sanma.finalScores as Quad<number> }));
    expect(titles()).toEqual(["B Tsumo", "Final standings"]);
    const tables = within(block()).getAllByRole("table");
    expect(tables).toHaveLength(1);
    const table = within(block()).getByRole("table", { name: "Final standings" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Rank", "Player", "Points"]);
    expect(tableRows(table)).toEqual([
      ["1st", "A", "42,100"],
      ["2nd", "C", "35,300"],
      ["3rd", "B", "27,600"],
    ]);
    // The standings come after the win they follow.
    const [tsumo] = wins() as [HTMLElement];
    expect(tsumo.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tsumo.contains(table)).toBe(false);
    expect(within(block()).queryByRole("button")).toBeNull();
  });

  it("ranks the players after a last round that ended in a draw", () => {
    renderBlock(madeProps([ryukyoku("suufonRenda")], { final: [30000, 20000, 40000, 10000] }));
    expect(titles()).toEqual([en.ryukyoku.suufonRenda, "Final standings"]);
    const table = within(block()).getByRole("table", { name: "Final standings" });
    expect(tableRows(table)).toEqual([
      ["1st", "C", "40,000"],
      ["2nd", "A", "30,000"],
      ["3rd", "B", "20,000"],
      ["4th", "D", "10,000"],
    ]);
    expect(within(block()).queryByRole("button")).toBeNull();
  });

  it("shows no standings before the last round", () => {
    renderBlock(roundProps(fixtureGame, 0));
    expect(within(block()).queryByRole("table")).toBeNull();
    expect(within(block()).queryByRole("heading", { name: "Final standings" })).toBeNull();
  });
});

describe("ResultBlock: a three-player game", () => {
  it("shows the winner's kita with the hand and never the empty chair", () => {
    // East 1: the dealer set one North aside, called pon twice and won off B.
    renderBlock(roundProps(sanmaCrossFormatGame(), 0));
    expect(titles()).toEqual(["A Ron off B"]);
    expect(value(wins()[0] as HTMLElement)).toEqual(["5,800 points", "3 han · 30 fu"]);
    const hand = within(block()).getByRole("group", { name: "Winning hand" });
    const kita = within(hand).getByRole("group", { name: "Kita: 1 North tile set aside" });
    expect(kita.querySelectorAll("img")).toHaveLength(1);
    expect(within(hand).getAllByRole("group", { name: /^Pon/ })).toHaveLength(2);
    expect(block().textContent).not.toContain("Player 4");
  });
});

describe("ResultBlock: the section and its button", () => {
  it("is one section named by its heading", () => {
    const { container } = renderBlock(roundProps(fixtureGame, 0));
    expect(container.children).toHaveLength(1);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toBe(block());
    expect(root.tagName).toBe("SECTION");
    expect(root.hasAttribute("data-result")).toBe(true);
    expect(within(root).getByRole("heading", { level: 2 }).textContent).toBe("Round result");
    // Under it, one level down: the wins, the draw, the standings.
    expect(within(root).queryByRole("heading", { level: 1 })).toBeNull();
    expect(within(root).queryByRole("heading", { level: 4 })).toBeNull();
  });

  it("goes on to the next round from the primary button beside its heading", () => {
    const { props } = renderBlock(roundProps(fixtureGame, 0));
    const next = within(block()).getByRole("button", { name: "Next round" });
    expect(next.getAttribute("type")).toBe("button");
    expect(next.getAttribute("data-variant")).toBe("primary");
    expect(next.title).toBe("Next round (↓)");
    // Beside the heading, before the wins: the first thing the focus meets in the block.
    expect(next.previousElementSibling).toBe(within(block()).getByRole("heading", { level: 2 }));
    expect(
      next.compareDocumentPosition(wins()[0] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(next);
    expect(props.onNextRound).toHaveBeenCalledTimes(1);
  });

  it("does not take the focus when it appears", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    renderBlock(roundProps(fixtureGame, 0));
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});

describe("ResultBlock: in Korean and Japanese", () => {
  it("words a win and the way on in Korean", () => {
    renderBlock(roundProps(fixtureGame, 0), "ko");
    const result = block("국 결과");
    expect(titles("국 결과")).toEqual(["B 론 (A 방총)"]);
    expect(value(within(result).getByRole("article"))).toEqual(["3,900점", "2판 · 40부"]);
    expect(within(result).getByRole("group", { name: "화료 손패" })).toBeTruthy();
    expect(within(result).getByRole("img", { name: "화료패: 1통" })).toBeTruthy();
    expect(within(result).getByRole("group", { name: "도라 표시패" })).toBeTruthy();
    expect(within(result).getByRole("group", { name: "뒷도라 표시패" })).toBeTruthy();
    expect(within(result).getByRole("list", { name: "역" }).textContent).toContain("리치");
    expect(within(result).getByRole("button", { name: "다음 국" }).title).toBe("다음 국 (↓)");
  });

  it("words a win and the way on in Japanese", () => {
    renderBlock(roundProps(fixtureGame, 0), "ja");
    const result = block("局の結果");
    expect(titles("局の結果")).toEqual(["B ロン（A 放銃）"]);
    expect(value(within(result).getByRole("article"))).toEqual(["3,900点", "2飜 · 40符"]);
    expect(within(result).getByRole("group", { name: "和了形" })).toBeTruthy();
    expect(within(result).getByRole("img", { name: /^和了牌.+一筒$/ })).toBeTruthy();
    expect(within(result).getByRole("group", { name: "ドラ表示牌" })).toBeTruthy();
    expect(within(result).getByRole("group", { name: "裏ドラ表示牌" })).toBeTruthy();
    expect(within(result).getByRole("list", { name: "役" }).textContent).toContain("立直");
    expect(within(result).getByRole("button", { name: "次の局" }).title).toBe("次の局（↓）");
  });

  it("words a tsumo, a draw and the standings in Korean and Japanese", () => {
    const tsumo = win(0, 0, [18000, -6000, -6000, -6000], haneman);
    const final: Quad<number> = [30000, 20000, 40000, 10000];

    renderBlock(madeProps([tsumo]), "ko");
    expect(titles("국 결과")).toEqual(["A 쯔모"]);
    expect(value(within(block("국 결과")).getByRole("article"))).toEqual([
      "18,000점",
      "6판 · 하네만",
    ]);
    cleanup();
    renderBlock(madeProps([ryukyoku("exhaustive")], { final }), "ko");
    expect(titles("국 결과")).toEqual(["황패 유국", "최종 순위"]);
    cleanup();

    renderBlock(madeProps([tsumo]), "ja");
    expect(titles("局の結果")).toEqual(["A ツモ"]);
    expect(value(within(block("局の結果")).getByRole("article"))).toEqual([
      "18,000点",
      "6飜 · 跳満",
    ]);
    cleanup();
    renderBlock(madeProps([ryukyoku("exhaustive")], { final }), "ja");
    expect(titles("局の結果")).toEqual(["荒牌流局", "最終順位"]);
  });
});
