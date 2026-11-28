// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLog, RyukyokuEvent, Seat } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Locale } from "../../i18n/locales";
import { MESSAGES } from "../../i18n/messages";
import { writeStorage } from "../../storage";
import { win } from "../../test/round-builder";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { drawWaits } from "../analysis/aids";
import { playerRows } from "../controls/players";
import { roundDeltas } from "../controls/roundSummary";
import { playerNames } from "../labels";
import type { PlayerListProps, PlayerRow, SeatAid } from "../viewer/types";
import { resultStep } from "./__fixtures__/resultStep";
import { PlayerList } from "./PlayerList";

const { en } = MESSAGES;

/** A round that B deals: B is East, C South, D West and A North. */
const PLAYERS: PlayerRow[] = [
  { seat: 0, name: "A", wind: 3, score: 21000, aid: null },
  { seat: 1, name: "B", wind: 0, score: 32000, aid: null },
  { seat: 2, name: "C", wind: 1, score: 25000, aid: null },
  { seat: 3, name: "D", wind: 2, score: 22000, aid: null },
];

/** The players with an aid for one of them. */
const withAid = (seat: Seat, aid: SeatAid): PlayerRow[] =>
  PLAYERS.map((player) => (player.seat === seat ? { ...player, aid } : player));

function renderList(patch: Partial<PlayerListProps> = {}, locale?: Locale) {
  if (locale) {
    writeStorage("locale", locale);
  }
  const props: PlayerListProps = {
    players: PLAYERS,
    pov: 1,
    onPov: vi.fn(),
    showAllHands: true,
    onToggleHands: vi.fn(),
    changes: null,
    tenpai: null,
    ...patch,
  };
  render(
    <I18nProvider>
      <PlayerList {...props} />
    </I18nProvider>,
  );
  return props;
}

/**
 * The list's props at the result step of one round of a game, as the viewer computes them (the
 * waits and shanten aid left out).
 */
function resultProps(game: GameLog, index: number): Partial<PlayerListProps> {
  const { round, board } = resultStep(game, index);
  const draw = board.results.find((result): result is RyukyokuEvent => result.type === "ryukyoku");
  return {
    players: playerRows(game.playerCount, round, board, playerNames(en, game.players)),
    pov: 0,
    changes: roundDeltas(board.results),
    tenpai: draw?.tenpai
      ? { seats: draw.tenpai, waits: drawWaits(board.results, board.seats, game.playerCount) }
      : null,
  };
}

const list = (name = "Players") => screen.getByRole("region", { name });
const rows = (name?: string) => within(list(name)).getAllByRole("button");
function row(index: number, name?: string): HTMLElement {
  const found = rows(name)[index];
  if (!found) {
    throw new Error(`The list has no row ${index}`);
  }
  return found;
}

/**
 * What a row, or a part of one, shows to the eye: the text of each element that holds text, in
 * order, without the text that only screen readers get. Tiles are pictures and have no text here.
 */
function seen(element: HTMLElement): string[] {
  return [element, ...element.querySelectorAll("*")]
    .filter(
      (part) =>
        part.closest(".sr-only") === null &&
        [...part.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        ),
    )
    .map((part) => part.textContent ?? "");
}

/** What a screen reader gets from an element: its text without the parts hidden from it. */
function read(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return copy.textContent ?? "";
}

/**
 * The note under a row's name, or null when the row has none: what comes after the wind, the name,
 * the round's change (when there is one) and the score.
 */
function note(element: HTMLElement): HTMLElement | null {
  const before = element.querySelector(":scope > [data-sign]") ? 4 : 3;
  return element.children.length > before ? (element.lastElementChild as HTMLElement) : null;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("PlayerList", () => {
  it("is a section named by its heading, with one button per player in the order given", () => {
    renderList();
    expect(list().tagName).toBe("SECTION");
    expect(within(list()).getByRole("heading", { level: 2 }).textContent).toBe("Players");
    expect(rows().map((player) => player.getAttribute("type"))).toEqual([
      "button",
      "button",
      "button",
      "button",
    ]);
    expect(rows().map((player) => within(player).getByText(/^[A-D]$/).textContent)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("is a scoreboard: the wind's letter, the name and the score with its digits grouped", () => {
    renderList();
    expect(rows().map(seen)).toEqual([
      ["N", "A", "21,000"],
      ["E", "B", "Point of view", "32,000"],
      ["S", "C", "25,000"],
      ["W", "D", "22,000"],
    ]);
    cleanup();

    // A score below zero has a real minus sign.
    renderList({ players: [{ seat: 0, name: "A", wind: 0, score: -1200, aid: null }], pov: 0 });
    expect(seen(row(0))).toEqual(["E", "A", "Point of view", "−1,200"]);
  });

  it("reads a row as the wind in full, the name and the score", () => {
    renderList();
    for (const name of [
      "North A 21,000",
      "East B Point of view 32,000",
      "South C 25,000",
      "West D 22,000",
    ]) {
      expect(within(list()).getByRole("button", { name })).toBeTruthy();
    }
    // The letter is for the eye, the wind's name for screen readers.
    expect(within(row(0)).getByText("N").getAttribute("aria-hidden")).toBe("true");
    expect(within(row(0)).getByText("North").className).toBe("sr-only");
  });

  it("marks the viewed player's row as pressed, and with a word", () => {
    renderList();
    expect(rows().map((player) => player.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
    // Not by the pressed look alone: the row says so, to the eye and to screen readers.
    const tags = screen.getAllByText("Point of view");
    expect(tags).toHaveLength(1);
    expect(row(1).contains(tags[0] as HTMLElement)).toBe(true);
    expect(tags[0]?.closest('[aria-hidden="true"]')).toBeNull();
    cleanup();

    renderList({ pov: 3 });
    expect(rows().map((player) => player.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "false",
      "true",
    ]);
    expect(row(3).contains(screen.getByText("Point of view"))).toBe(true);
  });

  it("marks the dealer's wind, the East seat's", () => {
    renderList();
    const dealers = [...list().querySelectorAll("[data-dealer]")];
    expect(dealers.map((badge) => badge.textContent)).toEqual(["EEast"]);
    expect(row(1).contains(dealers[0] as Element)).toBe(true);
  });

  it("views the table from the pressed row's seat", () => {
    const { onPov } = renderList();
    fireEvent.click(screen.getByRole("button", { name: /^West D/ }));
    expect(onPov).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: /^North A/ }));
    expect(onPov).toHaveBeenLastCalledWith(0);
    expect(onPov).toHaveBeenCalledTimes(2);
  });

  it("says what a press does, with the seat's key, in each row's tooltip", () => {
    renderList();
    expect(rows().map((player) => player.title)).toEqual([
      "Point of view (1)",
      "Point of view (2)",
      "Point of view (3)",
      "Point of view (4)",
    ]);
  });

  it("lists three seats in a three-player game", () => {
    const sanma = sanmaCrossFormatGame();
    renderList(resultProps(sanma, 0));
    expect(rows().map(seen)).toEqual([
      ["E", "A", "Point of view", "+6,800", "41,800"],
      ["S", "B", "−5,800", "28,200"],
      ["W", "C", "35,000"],
    ]);
    expect(list().textContent).not.toContain("Player 4");
  });

  it("switches between all hands and the viewed player's with a checkbox", () => {
    const { onToggleHands } = renderList();
    const hands = screen.getByRole("checkbox", { name: "Show all hands" }) as HTMLInputElement;
    expect(list().contains(hands)).toBe(true);
    expect(hands.checked).toBe(true);
    expect(hands.closest("label")?.title).toBe("Show all hands (H)");
    fireEvent.click(hands);
    expect(onToggleHands).toHaveBeenCalledTimes(1);
    cleanup();

    renderList({ showAllHands: false });
    expect(
      (screen.getByRole("checkbox", { name: "Show all hands" }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("puts the checkbox before the rows, where the focus meets it first", () => {
    renderList();
    const controls = [...list().querySelectorAll("input, button")];
    expect(controls.map((control) => control.tagName)).toEqual([
      "INPUT",
      "BUTTON",
      "BUTTON",
      "BUTTON",
      "BUTTON",
    ]);
  });
});

describe("PlayerList: at a round's result", () => {
  it("shows each player's signed change before the score, and nothing for no change", () => {
    renderList({ changes: [-4200, 5200, 0, 0] });
    expect(rows().map(seen)).toEqual([
      ["N", "A", "−4,200", "21,000"],
      ["E", "B", "Point of view", "+5,200", "32,000"],
      ["S", "C", "25,000"],
      ["W", "D", "22,000"],
    ]);
    expect(rows().map((player) => player.querySelector("[data-sign]")?.textContent)).toEqual([
      "−4,200",
      "+5,200",
      undefined,
      undefined,
    ]);
    expect(row(0).querySelector("[data-sign]")?.getAttribute("data-sign")).toBe("loss");
    expect(row(1).querySelector("[data-sign]")?.getAttribute("data-sign")).toBe("gain");
    // The sign is in the text, so the colour is not all that says it.
    expect(within(list()).getByRole("button", { name: "North A −4,200 21,000" })).toBeTruthy();
  });

  it("shows no change while the round is being played", () => {
    renderList();
    expect(list().querySelector("[data-sign]")).toBeNull();
  });

  it("shows the scores after a win with what the win moved", () => {
    // B paid a riichi stick before winning it back with the hand and the honba.
    renderList(resultProps(fixtureGame, 0));
    expect(rows().map(seen)).toEqual([
      ["E", "A", "Point of view", "−4,200", "20,800"],
      ["S", "B", "+5,200", "29,200"],
      ["W", "C", "25,000"],
      ["N", "D", "25,000"],
    ]);
  });

  it("shows the wins of a multiple ron as one change for each player", () => {
    // B and D both won off A.
    const wins = [win(1, 0, [-2300, 3300, 0, 0]), win(3, 0, [-8000, 0, 0, 8000])];
    renderList({ changes: roundDeltas(wins) });
    expect(rows().map((player) => player.querySelector("[data-sign]")?.textContent)).toEqual([
      "−10,300",
      "+3,300",
      undefined,
      "+8,000",
    ]);
  });
});

describe("PlayerList: at a draw", () => {
  it("says tenpai or noten on every row, with the waits of the tenpai hands", () => {
    // East 3, honba 1 of the three-player game: A and C are tenpai.
    renderList(resultProps(sanmaCrossFormatGame(), 4));
    expect(rows().map(seen)).toEqual([
      ["S", "A", "Point of view", "+1,000", "43,700", "Tenpai"],
      ["W", "B", "−2,000", "22,100", "Noten"],
      ["E", "C", "+1,000", "38,200", "Tenpai"],
    ]);
    expect(row(0).querySelectorAll("img").length).toBeGreaterThan(0);
    expect(row(1).querySelector("img")).toBeNull();
    expect(row(2).querySelectorAll("img").length).toBeGreaterThan(0);
    expect(read(note(row(0)) as HTMLElement)).toMatch(/^Tenpai Waits: /);
    expect(read(note(row(1)) as HTMLElement)).toBe("Noten");
    expect(read(note(row(2)) as HTMLElement)).toMatch(/^Tenpai Waits: /);
  });

  it("names the waits of a tenpai hand once, in words, and draws them as tiles", () => {
    renderList({
      changes: [3000, -1000, -1000, -1000],
      tenpai: { seats: [0], waits: { 0: ["3p", "6p"] } },
    });
    const tenpai = note(row(0)) as HTMLElement;
    expect(seen(tenpai)).toEqual(["Tenpai"]);
    expect(read(tenpai)).toBe("Tenpai Waits: 3 Pin and 6 Pin");
    // The tiles are for the eye: the sentence has already named them.
    const tiles = [...tenpai.querySelectorAll("img")];
    expect(tiles.map((tile) => tile.getAttribute("src"))).toEqual([
      expect.stringMatching(/Pin3\.svg$/),
      expect.stringMatching(/Pin6\.svg$/),
    ]);
    expect(tiles.every((tile) => tile.closest('[aria-hidden="true"]') !== null)).toBe(true);
    expect(
      within(list()).getByRole("button", {
        name: "North A +3,000 21,000 Tenpai Waits: 3 Pin and 6 Pin",
      }),
    ).toBeTruthy();
    expect(within(list()).getByRole("button", { name: /^South C −1,000 25,000 Noten$/ })).toBe(
      row(2),
    );
  });

  it("says only tenpai for a tenpai hand whose waits are not known", () => {
    renderList({ tenpai: { seats: [2], waits: {} } });
    const tenpai = note(row(2)) as HTMLElement;
    expect(seen(tenpai)).toEqual(["Tenpai"]);
    expect(read(tenpai)).toBe("Tenpai");
    expect(tenpai.querySelector("img")).toBeNull();
  });

  it("says noten on every row when nobody was tenpai", () => {
    renderList({ changes: [0, 0, 0, 0], tenpai: { seats: [], waits: {} } });
    expect(rows().map(seen)).toEqual([
      ["N", "A", "21,000", "Noten"],
      ["E", "B", "Point of view", "32,000", "Noten"],
      ["S", "C", "25,000", "Noten"],
      ["W", "D", "22,000", "Noten"],
    ]);
  });

  it("says tenpai or noten instead of the hand's aid", () => {
    renderList({
      players: withAid(0, { kind: "waits", tiles: ["3p"], left: 2, furiten: true }),
      tenpai: { seats: [0], waits: { 0: ["3p"] } },
    });
    expect(seen(note(row(0)) as HTMLElement)).toEqual(["Tenpai"]);
    expect(row(0).textContent).not.toContain("Furiten");
  });

  it("says neither for an abortive draw, which lists no tenpai seats", () => {
    // East 3, honba 2 of the three-player game: nine terminals.
    renderList(resultProps(sanmaCrossFormatGame(), 5));
    expect(rows().map(seen)).toEqual([
      ["S", "A", "Point of view", "43,700"],
      ["W", "B", "22,100"],
      ["E", "C", "38,200"],
    ]);
  });
});

describe("PlayerList: the waits and shanten aid", () => {
  it("shows nothing under the name without an aid", () => {
    renderList();
    expect(rows().map(note)).toEqual([null, null, null, null]);
  });

  it("puts the shanten count, tenpai or a complete hand under the name, as words", () => {
    const cases: [SeatAid, string][] = [
      [{ kind: "shanten", value: 2 }, "2-shanten"],
      [{ kind: "shanten", value: 1 }, "1-shanten"],
      [{ kind: "shanten", value: 0 }, "Tenpai"],
      [{ kind: "shanten", value: -1 }, "Complete hand"],
    ];
    for (const [aid, text] of cases) {
      renderList({ players: withAid(1, aid) });
      expect(seen(row(1))).toEqual(["E", "B", "Point of view", "32,000", text]);
      // Screen readers get the words as well.
      expect(read(note(row(1)) as HTMLElement)).toBe(text);
      expect(
        within(list()).getByRole("button", { name: `East B Point of view 32,000 ${text}` }),
      ).toBeTruthy();
      cleanup();
    }
  });

  it("shows waits as the label, the tiles and the tiles left, and reads them as a sentence", () => {
    renderList({
      players: withAid(0, { kind: "waits", tiles: ["3p", "6p"], left: 6, furiten: false }),
    });
    const waits = note(row(0)) as HTMLElement;
    expect(seen(waits)).toEqual(["Wait", "6 left"]);
    const tiles = [...waits.querySelectorAll("img")];
    expect(tiles.map((tile) => tile.getAttribute("src"))).toEqual([
      expect.stringMatching(/Pin3\.svg$/),
      expect.stringMatching(/Pin6\.svg$/),
    ]);
    // The tiles stand between the label and the count.
    expect([...waits.children].map((part) => part.querySelectorAll("img").length)).toEqual([
      0, 0, 2, 0,
    ]);
    // The eye's parts are hidden from screen readers, which get one sentence instead.
    expect(tiles.every((tile) => tile.getAttribute("alt") === "")).toBe(true);
    expect(read(waits)).toBe("Waits 3 Pin and 6 Pin, 6 left");
    expect(within(waits).getByText("Waits 3 Pin and 6 Pin, 6 left").className).toBe("sr-only");
    expect(waits.textContent).not.toContain("Furiten");
    expect(
      within(list()).getByRole("button", { name: "North A 21,000 Waits 3 Pin and 6 Pin, 6 left" }),
    ).toBeTruthy();
  });

  it("shows every wait tile of a wide wait", () => {
    renderList({
      players: withAid(2, {
        kind: "waits",
        tiles: ["1s", "4s", "7s", "2z", "3z"],
        left: 9,
        furiten: false,
      }),
    });
    expect(row(2).querySelectorAll("img")).toHaveLength(5);
    expect(read(note(row(2)) as HTMLElement)).toBe(
      "Waits 1 Sou, 4 Sou, 7 Sou, South and West, 9 left",
    );
  });

  it("marks furiten after the tiles left, in words for the eye and for screen readers", () => {
    renderList({
      players: withAid(0, { kind: "waits", tiles: ["3p"], left: 2, furiten: true }),
    });
    const waits = note(row(0)) as HTMLElement;
    expect(seen(waits)).toEqual(["Wait", "2 left", "Furiten"]);
    expect(within(waits).getByText("Furiten").getAttribute("aria-hidden")).toBe("true");
    expect(read(waits)).toBe("Waits 3 Pin, 2 left, furiten");
  });

  it("keeps the aid beside the round's change at a win", () => {
    renderList({
      players: withAid(0, { kind: "shanten", value: 1 }),
      changes: [-4200, 5200, 0, 0],
    });
    expect(seen(row(0))).toEqual(["N", "A", "−4,200", "21,000", "1-shanten"]);
  });
});

describe("PlayerList: in Korean and Japanese", () => {
  const props: Partial<PlayerListProps> = {
    players: [
      { ...PLAYERS[0], aid: { kind: "waits", tiles: ["3p", "6p"], left: 6, furiten: true } },
      { ...PLAYERS[1], aid: { kind: "shanten", value: 2 } },
      { ...PLAYERS[2], aid: { kind: "shanten", value: 0 } },
      { ...PLAYERS[3], aid: { kind: "shanten", value: -1 } },
    ] as PlayerRow[],
    changes: [-4200, 5200, 0, 0],
  };
  const draw: Partial<PlayerListProps> = { tenpai: { seats: [0], waits: { 0: ["3p", "6p"] } } };

  it("words the list in Korean", () => {
    renderList(props, "ko");
    expect(within(list("플레이어")).getByRole("heading", { level: 2 }).textContent).toBe(
      "플레이어",
    );
    expect(screen.getByRole("checkbox", { name: "모든 손패 보기" })).toBeTruthy();
    expect(rows("플레이어").map(seen)).toEqual([
      ["북", "A", "−4,200", "21,000", "대기", "6장", "후리텐"],
      ["동", "B", "시점", "+5,200", "32,000", "2샹텐"],
      ["남", "C", "25,000", "텐파이"],
      ["서", "D", "22,000", "화료형"],
    ]);
    expect(read(note(row(0, "플레이어")) as HTMLElement)).toBe("대기 3통·6통, 6장 남음, 후리텐");
    expect(row(1, "플레이어").title).toBe("시점 (2)");
    cleanup();

    renderList(draw, "ko");
    expect(rows("플레이어").map((player) => seen(note(player) as HTMLElement))).toEqual([
      ["텐파이"],
      ["노텐"],
      ["노텐"],
      ["노텐"],
    ]);
    expect(read(note(row(0, "플레이어")) as HTMLElement)).toContain("대기: 3통, 6통");
  });

  it("words the list in Japanese", () => {
    renderList(props, "ja");
    expect(within(list("プレイヤー")).getByRole("heading", { level: 2 }).textContent).toBe(
      "プレイヤー",
    );
    expect(screen.getByRole("checkbox", { name: "全員の手牌を表示" })).toBeTruthy();
    expect(rows("プレイヤー").map(seen)).toEqual([
      ["北", "A", "−4,200", "21,000", "待ち", "残り6枚", "フリテン"],
      ["東", "B", "視点", "+5,200", "32,000", "2向聴"],
      ["南", "C", "25,000", "聴牌"],
      ["西", "D", "22,000", "和了形"],
    ]);
    expect(read(note(row(0, "プレイヤー")) as HTMLElement)).toBe(
      "待ち 三筒・六筒、残り6枚、フリテン",
    );
    expect(row(1, "プレイヤー").title).toBe("視点（2）");
    cleanup();

    renderList(draw, "ja");
    expect(rows("プレイヤー").map((player) => seen(note(player) as HTMLElement))).toEqual([
      ["聴牌"],
      ["不聴"],
      ["不聴"],
      ["不聴"],
    ]);
    expect(read(note(row(0, "プレイヤー")) as HTMLElement)).toContain("待ち：三筒、六筒");
  });
});
