// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Locale } from "../../i18n/locales";
import { MESSAGES } from "../../i18n/messages";
import { writeStorage } from "../../storage";
import { roundLabel } from "../labels";
import type { NavLimits, RoundHeaderProps } from "../viewer/types";
import { RoundHeader } from "./RoundHeader";

const MIDDLE: NavLimits = { gameStart: false, gameEnd: false, lastRound: false };

function renderHeader(patch: Partial<RoundHeaderProps> = {}, locale?: Locale) {
  if (locale) {
    writeStorage("locale", locale);
  }
  const props: RoundHeaderProps = {
    roundName: "East 2, 1 honba",
    turn: 8,
    wallRemaining: 41,
    deposits: 0,
    limits: MIDDLE,
    onNav: vi.fn(() => true),
    ...patch,
  };
  const { container } = render(
    <I18nProvider>
      <RoundHeader {...props} />
    </I18nProvider>,
  );
  return { props, header: container.firstElementChild as HTMLElement };
}

const button = (name: string) => screen.getByRole("button", { name });
const heading = () => screen.getByRole("heading", { level: 2 });
/** The line under the round's name, or null when the header has none. */
const facts = (header: HTMLElement) => header.querySelector("p")?.textContent ?? null;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("RoundHeader", () => {
  it("names the round in a heading, with the two round buttons after it", () => {
    const { header } = renderHeader();
    expect(header.tagName).toBe("HEADER");
    expect(heading().textContent).toBe("East 2, 1 honba");
    // The document order is the focus order: the name, the way back, the way on.
    const order = [...header.querySelectorAll("h2, button")].map(
      (element) => element.getAttribute("aria-label") ?? element.textContent,
    );
    expect(order).toEqual(["East 2, 1 honba", "Previous round", "Next round"]);
  });

  it("says the turn and the tiles left under the name, and the deposits only when there are any", () => {
    expect(facts(renderHeader().header)).toBe("Turn 8 · 41 tiles left");
    cleanup();
    expect(facts(renderHeader({ deposits: 2 }).header)).toBe("Turn 8 · 41 tiles left · 2 deposits");
    cleanup();
    expect(facts(renderHeader({ deposits: 1 }).header)).toBe("Turn 8 · 41 tiles left · 1 deposit");
    cleanup();
    // An empty wall is still a wall: the round was replayed.
    expect(facts(renderHeader({ turn: 18, wallRemaining: 0 }).header)).toBe(
      "Turn 18 · 0 tiles left",
    );
  });

  it("shows the name alone for a round that could not be replayed", () => {
    const { header } = renderHeader({ roundName: "South 3", turn: 0, wallRemaining: null });
    expect(heading().textContent).toBe("South 3");
    expect(facts(header)).toBeNull();
    // The other rounds can still be reached from it.
    expect(button("Previous round").getAttribute("aria-disabled")).toBe("false");
    expect(button("Next round").getAttribute("aria-disabled")).toBe("false");
  });

  it("names its icon buttons, with the key in the tooltip", () => {
    renderHeader();
    const previous = button("Previous round");
    const next = button("Next round");
    expect(previous.title).toBe("Previous round (↑)");
    expect(next.title).toBe("Next round (↓)");
    for (const jump of [previous, next]) {
      expect(jump.getAttribute("type")).toBe("button");
      expect(jump.hasAttribute("data-icon")).toBe(true);
      // The icon is decoration: the name comes from the label.
      expect(jump.textContent).toBe("");
      expect(jump.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("sends each button's command as a fresh user input", () => {
    const { props } = renderHeader();
    fireEvent.click(button("Previous round"));
    fireEvent.click(button("Next round"));
    expect(vi.mocked(props.onNav).mock.calls).toEqual([
      [{ kind: "roundStartOrPrev" }, "user"],
      [{ kind: "nextRound" }, "user"],
    ]);
  });

  it("keeps the focus on Previous round at the game's start and does nothing", () => {
    const { props } = renderHeader({ limits: { ...MIDDLE, gameStart: true } });
    const previous = button("Previous round");
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    expect(previous.hasAttribute("disabled")).toBe(false);
    expect(button("Next round").getAttribute("aria-disabled")).toBe("false");
    act(() => previous.focus());
    fireEvent.click(previous);
    expect(props.onNav).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(previous);
    // The other way is open.
    fireEvent.click(button("Next round"));
    expect(props.onNav).toHaveBeenCalledTimes(1);
  });

  it("keeps the focus on Next round in the last round and does nothing", () => {
    // The game's last step: nothing is left to step to, but the way back is open.
    const { props } = renderHeader({
      limits: { gameStart: false, gameEnd: true, lastRound: true },
    });
    const next = button("Next round");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(button("Previous round").getAttribute("aria-disabled")).toBe("false");
    act(() => next.focus());
    fireEvent.click(next);
    expect(props.onNav).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
    fireEvent.click(button("Previous round"));
    expect(props.onNav).toHaveBeenCalledTimes(1);
    expect(props.onNav).toHaveBeenLastCalledWith({ kind: "roundStartOrPrev" }, "user");
  });

  it("words the line and the buttons in Korean and Japanese", () => {
    const round = { wind: 0, number: 2, honba: 1 } as const;
    const { ko, ja } = MESSAGES;

    const korean = renderHeader({ roundName: roundLabel(ko, round), deposits: 2 }, "ko");
    expect(heading().textContent).toBe("동 2국 1본장");
    expect(facts(korean.header)).toBe("8순 · 남은 패 41장 · 공탁 2");
    expect(button("이전 국").title).toBe("이전 국 (↑)");
    expect(button("다음 국").title).toBe("다음 국 (↓)");
    cleanup();

    const japanese = renderHeader({ roundName: roundLabel(ja, round), deposits: 2 }, "ja");
    expect(heading().textContent).toBe("東2局 1本場");
    expect(facts(japanese.header)).toBe("8巡目 · 残り41枚 · 供託 2");
    expect(button("前の局").title).toBe("前の局（↑）");
    expect(button("次の局").title).toBe("次の局（↓）");
  });
});
