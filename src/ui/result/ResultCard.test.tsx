// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLog, Quad, Round, RyukyokuEvent, WinEvent } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { MESSAGES } from "../../i18n/messages";
import { buildTimeline } from "../../replay/timeline";
import type { BoardState, MeldView, SeatView } from "../../replay/types";
import { ryukyoku, tiles, win } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { drawWaits } from "../analysis/aids";
import { playerNames } from "../labels";
import { withRevealedHands } from "../reveal";
import type { ResultCardProps } from "../viewer/types";
import { ResultCard } from "./ResultCard";

const { en } = MESSAGES;

/** The card's props at the result step of one round of a game, as the viewer computes them. */
function roundProps(
  game: GameLog,
  index: number,
  extra: Partial<ResultCardProps> = {},
): ResultCardProps {
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
    drawWaits: drawWaits(last.results, seats, game.playerCount),
    doraIndicators: last.doraIndicators,
    onHide: vi.fn(),
    onNextRound: vi.fn(),
    ...extra,
  };
}

function seat(score: number, melds: MeldView[] = []): SeatView {
  return { hand: [], drawn: null, melds, kita: [], discards: [], score, riichi: false };
}

/** Hand-made props: these results, the scores after them, four players named A to D. */
function madeProps(
  results: ResultCardProps["results"],
  scores: Quad<number>,
  extra: Partial<ResultCardProps> = {},
): ResultCardProps {
  return {
    results,
    seats: scores.map((score) => seat(score)) as Quad<SeatView>,
    names: ["A", "B", "C", "D"],
    playerCount: 4,
    final: null,
    drawWaits: {},
    doraIndicators: ["1z"],
    onHide: vi.fn(),
    onNextRound: vi.fn(),
    ...extra,
  };
}

function renderCard(props: ResultCardProps) {
  const ui = () => (
    <I18nProvider>
      <ResultCard {...props} />
    </I18nProvider>
  );
  const view = render(ui());
  return { ...view, props, renderAgain: () => view.rerender(ui()) };
}

const card = () => screen.getByRole("region", { name: "Round result" });
const title = () => within(card()).getByRole("heading", { level: 2 }).textContent;

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

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ResultCard: a win", () => {
  it("shows a ron: who won off whom, the value, the hand, the indicators and the yaku", () => {
    renderCard(roundProps(fixtureGame, 0));
    expect(title()).toBe("B · Ron off A");
    expect(within(card()).getByText("2 han · 40 fu · 3,900 points")).toBeTruthy();
    const hand = within(card()).getByRole("group", { name: "Winning hand" });
    expect(within(hand).getAllByRole("img")).toHaveLength(14);
    expect(within(hand).getByRole("img", { name: "Winning tile: 1 Pin" })).toBeTruthy();
    const dora = within(card()).getByRole("group", { name: "Dora indicators" });
    expect(within(dora).getByRole("img", { name: "3 Man" })).toBeTruthy();
    const ura = within(card()).getByRole("group", { name: "Ura Dora indicators" });
    expect(within(ura).getByRole("img", { name: "5 Sou" })).toBeTruthy();
    const yaku = within(card()).getByRole("list", { name: "Yaku" });
    expect(within(yaku).getAllByRole("listitem")).toHaveLength(2);
    expect(yaku.textContent).toContain("Riichi");
  });

  it("lists each player's new score and signed change, and nothing for no change", () => {
    renderCard(roundProps(fixtureGame, 0));
    const table = within(card()).getByRole("table", { name: "Point changes" });
    // B paid a riichi stick before winning it back with the hand and the honba.
    expect(tableRows(table)).toEqual([
      ["A", "20,800", "−4,200"],
      ["B", "29,200", "+5,200"],
      ["C", "25,000", ""],
      ["D", "25,000", ""],
    ]);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    expect(card().textContent).not.toContain("→");
  });

  it("shows a tsumo with a limit hand: the limit's name instead of the fu", () => {
    renderCard(
      madeProps(
        [win(0, 0, [18000, -6000, -6000, -6000], { ...haneman, fu: 20 })],
        [43000, 19000, 19000, 19000],
      ),
    );
    expect(title()).toBe("A · Tsumo");
    const value = within(card()).getByText(/18,000 points/).textContent;
    expect(value).toContain("Haneman");
    expect(value).not.toContain("fu");
    expect(within(card()).queryByRole("group", { name: "Ura Dora indicators" })).toBeNull();
    const table = within(card()).getByRole("table", { name: "Point changes" });
    expect(tableRows(table).map((row) => row[2])).toEqual([
      "+18,000",
      "−6,000",
      "−6,000",
      "−6,000",
    ]);
  });

  it("names the player liable for the hand (pao)", () => {
    const yakuman = win(2, 1, [0, -16000, 32000, -16000], {
      limit: "yakuman",
      points: 32000,
      yaku: [{ key: "daisangen", han: 13, yakuman: true }],
      pao: 3,
    });
    renderCard(madeProps([yakuman], [25000, 9000, 57000, 9000]));
    expect(title()).toBe("C · Ron off B");
    expect(within(card()).getByText("Yakuman · 32,000 points")).toBeTruthy();
    expect(within(card()).getByText("Liability (pao): D")).toBeTruthy();
  });

  it("shows the winner's calls with the hand, not another player's", () => {
    const pon: MeldView = { type: "pon", tiles: ["5z", "5z"], from: 3, calledTile: "5z" };
    const chi: MeldView = { type: "chi", tiles: ["2s", "3s"], from: 0, calledTile: "1s" };
    const props = madeProps(
      [win(2, 3, [0, 0, 1000, -1000], { tile: "3p", hand: tiles("11555m403p") })],
      [25000, 25000, 26000, 24000],
    );
    props.seats = [seat(25000), seat(25000, [chi]), seat(26000, [pon]), seat(24000)];
    renderCard(props);
    const hand = within(card()).getByRole("group", { name: "Winning hand" });
    expect(within(hand).getAllByRole("img")).toHaveLength(8 + 3);
    expect(within(hand).getByRole("group", { name: "Pon: Haku, Haku, Haku" })).toBeTruthy();
    expect(within(hand).queryByRole("group", { name: /^Chi/ })).toBeNull();
  });

  it("reads the concealed tiles, then the winning tile, then the calls", () => {
    const pon: MeldView = { type: "pon", tiles: ["5z", "5z"], from: 3, calledTile: "5z" };
    const props = madeProps(
      [win(2, 3, [0, 0, 1000, -1000], { tile: "3p", hand: tiles("11555m403p") })],
      [25000, 25000, 26000, 24000],
    );
    props.seats[2] = seat(26000, [pon]);
    renderCard(props);
    const hand = within(card()).getByRole("group", { name: "Winning hand" });
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

  it("gives the hand's widths to the tile size: the hand with the winning tile, and with the calls", () => {
    const pon: MeldView = { type: "pon", tiles: ["5z", "5z"], from: 3, calledTile: "5z" };
    const props = madeProps(
      [win(2, 3, [0, 0, 1000, -1000], { tile: "3p", hand: tiles("11555m403p") })],
      [25000, 25000, 26000, 24000],
    );
    props.seats[2] = seat(26000, [pon]);
    renderCard(props);
    // Seven tiles, the winning tile after its gap and the margin; then the pon after its gap.
    expect(Number(card().style.getPropertyValue("--hand-line"))).toBeCloseTo(8.8);
    expect(Number(card().style.getPropertyValue("--hand-all"))).toBeCloseTo(8.8 + 0.3 + 2 + 4 / 3);
  });

  it("shows only the winning tile, and no yaku list, when the log has neither hand nor yaku", () => {
    renderCard(
      madeProps([win(1, 0, [-1000, 1000, 0, 0], { tile: "7z" })], [24000, 26000, 25000, 25000]),
    );
    expect(within(card()).queryByRole("group", { name: "Winning hand" })).toBeNull();
    const tile = within(card()).getByRole("group", { name: "Winning tile" });
    expect(within(tile).getByRole("img", { name: "Chun" })).toBeTruthy();
    expect(within(card()).queryByRole("list")).toBeNull();
  });
});

describe("ResultCard: a draw", () => {
  it("says tenpai or noten for each player, with the waits of the tenpai hands", () => {
    // East 3, honba 1 of the three-player game: A and C are tenpai.
    renderCard(roundProps(sanmaCrossFormatGame(), 4));
    expect(title()).toBe("Exhaustive draw");
    const table = within(card()).getByRole("table", { name: "Point changes" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Player", "Tenpai", "Points", "Change"]);
    const [a, b, c, ...rest] = within(table).getAllByRole("row").slice(1) as HTMLElement[];
    expect(rest).toHaveLength(0);
    expect(a?.textContent).toBe("ATenpai43,700+1,000");
    expect(b?.textContent).toBe("BNoten22,100−2,000");
    expect(c?.textContent).toBe("CTenpai38,200+1,000");
    expect(within(a as HTMLElement).getByRole("group", { name: /^Waits: / })).toBeTruthy();
    expect(within(b as HTMLElement).queryByRole("group")).toBeNull();
    expect(within(c as HTMLElement).getByRole("group", { name: /^Waits: / })).toBeTruthy();
    expect(within(card()).queryByRole("group", { name: "Winning hand" })).toBeNull();
  });

  it("names the waits of a tenpai hand", () => {
    const draw = ryukyoku("exhaustive", [3000, -1000, -1000, -1000], { tenpai: [0] });
    renderCard(madeProps([draw], [28000, 24000, 24000, 24000], { drawWaits: { 0: ["3p", "6p"] } }));
    const waits = within(card()).getByRole("group", { name: "Waits: 3 Pin and 6 Pin" });
    expect(waits.querySelectorAll("img")).toHaveLength(2);
  });

  it("keeps the table when nobody was tenpai and no points moved", () => {
    const draw = ryukyoku("exhaustive", [0, 0, 0, 0], { tenpai: [] });
    renderCard(madeProps([draw], [25000, 25000, 25000, 25000]));
    const table = within(card()).getByRole("table", { name: "Point changes" });
    expect(tableRows(table)).toEqual([
      ["A", "Noten", "25,000", ""],
      ["B", "Noten", "25,000", ""],
      ["C", "Noten", "25,000", ""],
      ["D", "Noten", "25,000", ""],
    ]);
  });

  it("shows only its kind and the buttons for an abortive draw", () => {
    // East 3, honba 2 of the three-player game: nine terminals.
    renderCard(roundProps(sanmaCrossFormatGame(), 5));
    expect(title()).toBe(en.ryukyoku.kyuushuKyuuhai);
    expect(within(card()).queryByRole("table")).toBeNull();
    expect(within(card()).getAllByRole("button")).toHaveLength(2);
  });
});

describe("ResultCard: a multiple ron", () => {
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

  it("stacks the wins under the discarder's name, each with its own hand and yaku", () => {
    const pon: MeldView = { type: "pon", tiles: ["6z", "6z"], from: 2, calledTile: "6z" };
    const props = madeProps([first, second], [14700, 28300, 25000, 32000]);
    props.seats = [seat(14700), seat(28300, [pon]), seat(25000), seat(32000)];
    renderCard(props);
    expect(title()).toBe("Ron off A");
    const [b, d, ...rest] = within(card()).getAllByRole("article");
    expect(rest).toHaveLength(0);
    const winB = within(b as HTMLElement);
    const winD = within(d as HTMLElement);
    expect(winB.getByRole("heading", { level: 3 }).textContent).toBe("B");
    expect(winB.getByText("1 han · 30 fu · 2,000 points")).toBeTruthy();
    expect(winB.getByRole("group", { name: /^Pon/ })).toBeTruthy();
    expect(winB.getAllByRole("listitem")).toHaveLength(1);
    expect(winB.queryByRole("group", { name: "Ura Dora indicators" })).toBeNull();
    expect(winD.getByRole("heading", { level: 3 }).textContent).toBe("D");
    expect(winD.getByText(/Mangan · 8,000 points/)).toBeTruthy();
    expect(winD.queryByRole("group", { name: /^Pon/ })).toBeNull();
    expect(winD.getAllByRole("listitem")).toHaveLength(4);
    expect(winD.getByRole("group", { name: "Ura Dora indicators" })).toBeTruthy();
    // One tile size for both hands, from the wider one: D's thirteen tiles and the winning tile.
    expect(Number(card().style.getPropertyValue("--hand-line"))).toBeCloseTo(14.35);
    expect(Number(card().style.getPropertyValue("--hand-all"))).toBeCloseTo(14.35);
  });

  it("adds the wins up in one table of scores", () => {
    renderCard(madeProps([first, second], [14700, 28300, 25000, 32000]));
    const tables = within(card()).getAllByRole("table");
    expect(tables).toHaveLength(1);
    expect(tableRows(tables[0] as HTMLElement)).toEqual([
      ["A", "14,700", "−10,300"],
      ["B", "28,300", "+3,300"],
      ["C", "25,000", ""],
      ["D", "32,000", "+8,000"],
    ]);
  });
});

describe("ResultCard: the last round", () => {
  it("shows the final standings by rank, with this round's changes, and no next round", () => {
    const sanma = sanmaCrossFormatGame();
    renderCard(roundProps(sanma, 6, { final: sanma.finalScores as Quad<number> }));
    expect(title()).toBe("B · Tsumo");
    expect(within(card()).getByRole("heading", { level: 3, name: "Final standings" })).toBeTruthy();
    const tables = within(card()).getAllByRole("table");
    expect(tables).toHaveLength(1);
    const table = within(card()).getByRole("table", { name: "Final standings" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Rank", "Player", "Points", "Change"]);
    expect(tableRows(table)).toEqual([
      ["1st", "A", "42,100", "−1,600"],
      ["2nd", "C", "35,300", "−2,900"],
      ["3rd", "B", "27,600", "+5,500"],
    ]);
    expect(within(card()).queryByRole("button", { name: "Next round" })).toBeNull();
    expect(within(card()).getByRole("button", { name: "Show table" })).toBeTruthy();
  });

  it("ranks the players after a last round that changed no score", () => {
    const draw: RyukyokuEvent = ryukyoku("suufonRenda");
    renderCard(
      madeProps([draw], [30000, 20000, 40000, 10000], { final: [30000, 20000, 40000, 10000] }),
    );
    const table = within(card()).getByRole("table", { name: "Final standings" });
    expect(tableRows(table)).toEqual([
      ["1st", "C", "40,000", ""],
      ["2nd", "A", "30,000", ""],
      ["3rd", "B", "20,000", ""],
      ["4th", "D", "10,000", ""],
    ]);
  });
});

describe("ResultCard: a three-player game", () => {
  it("shows the winner's kita with the hand and lists three players", () => {
    // East 1: the dealer set one North aside, called pon twice and won off B.
    renderCard(roundProps(sanmaCrossFormatGame(), 0));
    expect(title()).toBe("A · Ron off B");
    const hand = within(card()).getByRole("group", { name: "Winning hand" });
    const kita = within(hand).getByRole("group", { name: "Kita: 1 North tile set aside" });
    expect(kita.querySelectorAll("img")).toHaveLength(1);
    expect(within(hand).getAllByRole("group", { name: /^Pon/ })).toHaveLength(2);
    const table = within(card()).getByRole("table", { name: "Point changes" });
    expect(tableRows(table)).toEqual([
      ["A", "41,800", "+6,800"],
      ["B", "28,200", "−5,800"],
      ["C", "35,000", ""],
    ]);
    expect(card().textContent).not.toContain("Player 4");
  });
});

describe("ResultCard: the box and its buttons", () => {
  it("is one labelled element that stage gestures ignore", () => {
    const { container } = renderCard(roundProps(fixtureGame, 0));
    expect(container.children).toHaveLength(1);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toBe(card());
    expect(root.tagName).toBe("SECTION");
    expect(root.hasAttribute("data-result-card")).toBe(true);
    expect(root.getAttribute("data-gesture")).toBe("ignore");
  });

  it("shows the table and goes to the next round", () => {
    const { props } = renderCard(roundProps(fixtureGame, 0));
    fireEvent.click(within(card()).getByRole("button", { name: "Show table" }));
    expect(props.onHide).toHaveBeenCalledTimes(1);
    expect(props.onNextRound).not.toHaveBeenCalled();
    const next = within(card()).getByRole("button", { name: "Next round" });
    expect(next.getAttribute("data-variant")).toBe("primary");
    fireEvent.click(next);
    expect(props.onNextRound).toHaveBeenCalledTimes(1);
    expect(within(card()).queryByRole("heading", { name: "Final standings" })).toBeNull();
  });

  it("does not take the focus when it appears", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    renderCard(roundProps(fixtureGame, 0));
    expect(document.activeElement).toBe(button);
    button.remove();
  });

  /** Renders a ron and returns its body with a way to give the body's content a height in a 200px box. */
  function renderWithBody() {
    const { renderAgain } = renderCard(roundProps(fixtureGame, 0));
    const body = within(card()).getByRole("table").closest("section > div") as HTMLElement;
    let content = 200;
    Object.defineProperty(body, "scrollHeight", { configurable: true, get: () => content });
    Object.defineProperty(body, "clientHeight", { configurable: true, get: () => 200 });
    const setContent = (height: number) => {
      content = height;
      renderAgain();
    };
    return { body, setContent };
  }

  it("makes its body focusable and labelled only while the body scrolls", () => {
    const { body, setContent } = renderWithBody();
    expect(body.hasAttribute("tabindex")).toBe(false);
    expect(body.hasAttribute("role")).toBe(false);

    setContent(400);
    expect(within(card()).getByRole("group", { name: "B · Ron off A" })).toBe(body);
    expect(body.tabIndex).toBe(0);

    setContent(200);
    expect(body.hasAttribute("tabindex")).toBe(false);
    expect(body.hasAttribute("role")).toBe(false);
  });

  it("marks a body with more below it until it is scrolled to its end", () => {
    const { body, setContent } = renderWithBody();
    expect(card().hasAttribute("data-more")).toBe(false);
    setContent(400);
    expect(card().hasAttribute("data-more")).toBe(true);
    body.scrollTop = 200;
    fireEvent.scroll(body);
    expect(card().hasAttribute("data-more")).toBe(false);
    body.scrollTop = 120;
    fireEvent.scroll(body);
    expect(card().hasAttribute("data-more")).toBe(true);
  });

  it("keeps the scroll keys of its focused body from the shortcuts on the window", () => {
    const seen: string[] = [];
    const onKeyDown = (event: KeyboardEvent) => seen.push(event.key);
    window.addEventListener("keydown", onKeyDown);
    try {
      const { body, setContent } = renderWithBody();
      setContent(400);
      for (const key of ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]) {
        fireEvent.keyDown(body, { key });
      }
      expect(seen).toEqual([]);
      // Other keys, and the same keys on the card's buttons, stay shortcuts.
      fireEvent.keyDown(body, { key: "ArrowRight" });
      fireEvent.keyDown(body, { key: "Escape" });
      fireEvent.keyDown(within(card()).getByRole("button", { name: "Show table" }), {
        key: "ArrowDown",
      });
      expect(seen).toEqual(["ArrowRight", "Escape", "ArrowDown"]);
    } finally {
      window.removeEventListener("keydown", onKeyDown);
    }
  });
});
