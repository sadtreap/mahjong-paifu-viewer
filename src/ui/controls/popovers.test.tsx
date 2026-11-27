// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quad, Seat } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { writeStorage } from "../../storage";
import { SettingsProvider } from "../settings/SettingsProvider";
import { SETTINGS_STORAGE_NAME } from "../settings/settings";
import type { PlayerRow, RoundSummary } from "../viewer/types";
import { AppMenu } from "./AppMenu";
import { PovMenu } from "./PovMenu";
import { RoundList } from "./RoundList";
import { placeBelow } from "./usePopover";

const PLAYERS: PlayerRow[] = [
  { seat: 0, name: "A", wind: 3, score: 21000 },
  { seat: 1, name: "B", wind: 0, score: 32000 },
  { seat: 2, name: "C", wind: 1, score: 25000 },
  { seat: 3, name: "D", wind: 2, score: 22000 },
];

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

const onPov = vi.fn();
const actions = { open: vi.fn(), copy: vi.fn(), settings: vi.fn(), help: vi.fn() };
const onRound = vi.fn();
const onFinal = vi.fn();

function Pov({ players = PLAYERS, pov = 1 }: { players?: PlayerRow[]; pov?: Seat }) {
  const [open, setOpen] = useState(false);
  return <PovMenu players={players} pov={pov} onPov={onPov} open={open} onOpenChange={setOpen} />;
}

function Menu({ linkable = true }: { linkable?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <AppMenu
      linkable={linkable}
      onOpenLog={actions.open}
      onCopyLink={actions.copy}
      onSettings={actions.settings}
      onHelp={actions.help}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function Rounds({
  current = 2,
  pov = 1,
  names = ["A", "B", "C", "D"],
}: {
  current?: number;
  pov?: Seat;
  names?: Quad<string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <RoundList
      rounds={ROUNDS}
      current={current}
      names={names}
      pov={pov}
      onRound={onRound}
      onFinal={onFinal}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function show(popover: ReactNode) {
  return render(
    <I18nProvider>
      <SettingsProvider>
        {popover}
        <button type="button">After</button>
      </SettingsProvider>
    </I18nProvider>,
  );
}

interface Case {
  name: string;
  popover: ReactNode;
  opener: RegExp;
  panel: () => HTMLElement;
  /** Accessible names of the items, in order, and which one the popover opens on. */
  items: string[];
  first: number;
}

/** The popover's items: the buttons in its panel, whatever their role. */
const itemsOf = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>("button")];
const nameOf = (item: Element | null) => item?.getAttribute("aria-label") ?? item?.textContent;
const names = (panel: HTMLElement) => itemsOf(panel).map(nameOf);

const CASES: Case[] = [
  {
    name: "point-of-view menu",
    popover: <Pov />,
    opener: /^Point of view:/,
    panel: () => screen.getByRole("menu", { name: "Point of view" }),
    items: [
      "North, A, 21,000 (−11,000)",
      "East, B, 32,000",
      "South, C, 25,000 (−7,000)",
      "West, D, 22,000 (−10,000)",
    ],
    first: 1,
  },
  {
    name: "app menu",
    popover: <Menu />,
    opener: /^Menu$/,
    panel: () => screen.getByRole("menu", { name: "Menu" }),
    items: ["Open another log", "Copy link to this moment", "Settings", "Controls"],
    first: 0,
  },
  {
    name: "round list",
    popover: <Rounds />,
    opener: /round list$/,
    panel: () => screen.getByRole("group", { name: "Rounds" }),
    items: [
      "East 1B ron off C · 18,000B +18,000",
      "East 1, 1 honbaB tsumo · 3,900B +4,200",
      "East 2Draw",
      "East 3, 1 honbaA ron off D · 8,000C ron off D",
      "South 1",
      "Final standings",
    ],
    first: 2,
  },
];

const opener = (c: Case) => screen.getByRole("button", { name: c.opener });
const active = () => document.activeElement as HTMLElement | null;
const key = (name: string, target: Element | null = active()) =>
  fireEvent.keyDown(target as Element, { key: name });

function open(c: Case) {
  show(c.popover);
  fireEvent.click(opener(c));
  return c.panel();
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe.each(CASES)("popover contract: $name", (c) => {
  it("is closed until its button is pressed, and the button says so", () => {
    show(c.popover);
    const button = opener(c);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.hasAttribute("aria-controls")).toBe(false);
    expect(document.querySelector('[data-gesture="ignore"]')).toBeNull();

    fireEvent.click(button);
    const panel = c.panel();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("data-gesture")).toBe("ignore");
    expect(names(panel)).toEqual(c.items);

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[data-gesture="ignore"]')).toBeNull();
  });

  it("opens on the checked or current item, or on the first", () => {
    const panel = open(c);
    expect(active()?.closest('[data-gesture="ignore"]')).toBe(panel);
    expect(names(panel).indexOf(nameOf(active()))).toBe(c.first);
  });

  it("moves with Up, Down, Home and End, around the ends, and keeps those keys", () => {
    const panel = open(c);
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    const items = itemsOf(panel);
    const last = items.length - 1;
    expect(key("Home")).toBe(false);
    expect(active()).toBe(items[0]);
    key("ArrowUp");
    expect(active()).toBe(items[last]);
    key("ArrowDown");
    expect(active()).toBe(items[0]);
    key("ArrowDown");
    expect(active()).toBe(items[1]);
    key("End");
    expect(active()).toBe(items[last]);
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("closes on Esc, which goes no further, and gives the focus back to its button", () => {
    open(c);
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    expect(key("Escape")).toBe(false);
    expect(opener(c).getAttribute("aria-expanded")).toBe("false");
    expect(active()).toBe(opener(c));
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("closes on Tab and lets the focus move on from its button", () => {
    open(c);
    // Not prevented: the browser moves the focus on from the button.
    expect(key("Tab")).toBe(true);
    expect(opener(c).getAttribute("aria-expanded")).toBe("false");
    expect(active()).toBe(opener(c));
  });

  it("closes on a press outside, which goes no further", () => {
    open(c);
    const outside = screen.getByRole("button", { name: "After" });
    const onOutsidePress = vi.fn();
    const onOutsideClick = vi.fn();
    outside.addEventListener("pointerdown", onOutsidePress);
    outside.addEventListener("click", onOutsideClick);
    fireEvent.pointerDown(outside, { button: 0, isPrimary: true });
    expect(opener(c).getAttribute("aria-expanded")).toBe("false");
    expect(onOutsidePress).not.toHaveBeenCalled();
    expect(active()).not.toBe(opener(c));
    // Nor does the click that ends the press: the button under it is not pressed.
    fireEvent.click(outside, { detail: 1 });
    expect(onOutsideClick).not.toHaveBeenCalled();
    // The next press is a press like any other.
    fireEvent.pointerDown(outside, { button: 0, isPrimary: true });
    fireEvent.click(outside, { detail: 1 });
    expect(onOutsideClick).toHaveBeenCalledTimes(1);
  });

  it("stays open on a press inside it", () => {
    const panel = open(c);
    fireEvent.pointerDown(itemsOf(panel)[0] as Element);
    expect(opener(c).getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on a choice and gives the focus back to its button", () => {
    const panel = open(c);
    act(() => {
      itemsOf(panel)[0]?.click();
    });
    expect(opener(c).getAttribute("aria-expanded")).toBe("false");
    expect(active()).toBe(opener(c));
  });
});

describe("placeBelow", () => {
  /** Places a panel of a width under an opener whose box ends at `right`, `bottom`. */
  function place(panelWidth: number, right: number, bottom: number) {
    const panel = document.createElement("div");
    const button = document.createElement("button");
    Object.defineProperty(panel, "offsetWidth", { value: panelWidth });
    button.getBoundingClientRect = () => new DOMRect(right - 44, bottom - 44, 44, 44);
    placeBelow(panel, button);
    return panel.style;
  }

  it("keeps the panel under its opener and on the screen", () => {
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: 390,
      configurable: true,
    });
    vi.stubGlobal("innerHeight", 664);
    try {
      // Right edges together, just under the opener, down to the screen's bottom edge.
      const narrow = place(200, 342, 44);
      expect([narrow.top, narrow.right, narrow.maxHeight]).toEqual(["50px", "48px", "606px"]);
      // A panel wider than the room to the opener's left moves right, off the screen's left edge.
      expect(place(374, 342, 44).right).toBe("8px");
      expect(place(360, 342, 44).right).toBe("22px");
      // An opener at the very edge still leaves the margin.
      expect(place(200, 390, 44).right).toBe("8px");
    } finally {
      Reflect.deleteProperty(document.documentElement, "clientWidth");
      vi.unstubAllGlobals();
    }
  });
});

describe("PovMenu", () => {
  it("names its button after the viewed player's wind and name, with the keys in the tooltip", () => {
    show(<Pov />);
    const button = screen.getByRole("button", { name: "Point of view: East, B" });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.title).toBe("Point of view (1–4, V, Shift+V)");
    expect(button.textContent).toBe("EB");
  });

  it("says what its rows are for, to the eye, and marks the dealer's wind", () => {
    show(<Pov />);
    fireEvent.click(screen.getByRole("button", { name: /^Point of view:/ }));
    const menu = screen.getByRole("menu", { name: "Point of view" });
    const heading = within(menu).getByText("Point of view");
    expect(heading.getAttribute("aria-hidden")).toBe("true");
    // East is the dealer's wind: B's row, and the button while B is viewed.
    const dealer = [...menu.querySelectorAll("[data-dealer]")].map((badge) => badge.textContent);
    expect(dealer).toEqual(["E"]);
    expect(
      screen.getByRole("button", { name: /^Point of view:/ }).querySelector("[data-dealer]"),
    ).not.toBeNull();
  });

  it("is a scoreboard: wind, name, score and the difference from the viewed player", () => {
    show(<Pov />);
    fireEvent.click(screen.getByRole("button", { name: /^Point of view:/ }));
    const rows = screen.getAllByRole("menuitemradio");
    expect(rows.map((row) => row.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
    expect([...(rows[0] as HTMLElement).children].map((cell) => cell.textContent)).toEqual([
      "N",
      "A",
      "21,000",
      "−11,000",
    ]);
    // The viewed player has no difference.
    expect([...(rows[1] as HTMLElement).children].map((cell) => cell.textContent)).toEqual([
      "E",
      "B",
      "32,000",
      "",
    ]);
  });

  it("views from the chosen seat", () => {
    show(<Pov />);
    fireEvent.click(screen.getByRole("button", { name: /^Point of view:/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^West, D/ }));
    expect(onPov).toHaveBeenCalledWith(3);
  });

  it("lists three seats in a three-player game", () => {
    show(<Pov players={PLAYERS.slice(0, 3)} />);
    const button = screen.getByRole("button", { name: /^Point of view:/ });
    expect(button.title).toBe("Point of view (1–3, V, Shift+V)");
    fireEvent.click(button);
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
  });
});

describe("AppMenu", () => {
  it("lists Copy link only for a log that has an address", () => {
    show(<Menu linkable={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Open another log",
      "Settings",
      "Controls",
    ]);
  });

  it("runs the chosen action with the focus already back on the Menu button", () => {
    show(<Menu />);
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    for (const [name, action] of [
      ["Open another log", actions.open],
      ["Copy link to this moment", actions.copy],
      ["Settings", actions.settings],
      ["Controls", actions.help],
    ] as const) {
      action.mockImplementation(() => {
        expect(document.activeElement).toBe(button);
      });
      fireEvent.click(button);
      fireEvent.click(screen.getByRole("menuitem", { name }));
      expect(action).toHaveBeenCalledTimes(1);
    }
  });
});

describe("RoundList", () => {
  const openList = () => {
    fireEvent.click(screen.getByRole("button", { name: /round list$/ }));
    return screen.getByRole("group", { name: "Rounds" });
  };

  it("marks the round on the table and shows the viewed player's change in each round", () => {
    show(<Rounds />);
    const rows = within(openList()).getAllByRole("button");
    expect(rows.map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "true",
      null,
      null,
      null,
    ]);
    const change = (row: HTMLElement | undefined) => row?.querySelector("[data-sign]");
    // The change is the viewed player's: the header says so to the eye, the row to a screen reader.
    const header = within(screen.getByRole("group", { name: "Rounds" })).getByText("Change for B");
    expect(header.getAttribute("aria-hidden")).toBe("true");
    expect(change(rows[0])?.textContent).toBe("B +18,000");
    expect(change(rows[0])?.getAttribute("data-sign")).toBe("gain");
    // Nothing for a round that changed nothing for the viewed player.
    expect(change(rows[2])).toBeNull();
    expect(change(rows[3])).toBeNull();
    cleanup();

    show(<Rounds pov={3} />);
    const loss = within(openList()).getAllByRole("button")[3]?.querySelector("[data-sign]");
    expect(loss?.textContent).toBe("D −9,300");
    expect(screen.getByText("Change for D")).toBeTruthy();
    expect(loss?.getAttribute("data-sign")).toBe("loss");
  });

  it("keeps short names whole and lets only long ones be cut", () => {
    show(<Rounds names={["Al", "Maximilian Featherstonehaugh", "가나다라", "가나다라마"]} />);
    const rows = within(openList()).getAllByRole("button");
    const whole = (row: HTMLElement | undefined, name: string) =>
      within(row as HTMLElement)
        .getAllByText(name)
        .every((element) => element.hasAttribute("data-short"));
    // Eight Latin letters or four CJK characters wide at most.
    expect(whole(rows[0], "Maximilian Featherstonehaugh")).toBe(false);
    expect(whole(rows[0], "가나다라")).toBe(true);
    expect(whole(rows[3], "Al")).toBe(true);
    expect(whole(rows[3], "가나다라마")).toBe(false);
  });

  it("jumps to the chosen round's start, or to the end of the game", () => {
    show(<Rounds />);
    fireEvent.click(within(openList()).getByRole("button", { name: /^East 3/ }));
    expect(onRound).toHaveBeenCalledWith(3);
    fireEvent.click(within(openList()).getByRole("button", { name: "Final standings" }));
    expect(onFinal).toHaveBeenCalledTimes(1);
  });

  it("closes on the round-list key, like Esc, unless single-key shortcuts are off", () => {
    show(<Rounds />);
    openList();
    expect(key("r")).toBe(false);
    expect(screen.queryByRole("group", { name: "Rounds" })).toBeNull();
    expect(active()).toBe(screen.getByRole("button", { name: /round list$/ }));
    cleanup();

    writeStorage(SETTINGS_STORAGE_NAME, JSON.stringify({ version: 2, charKeys: false }));
    show(<Rounds />);
    openList();
    expect(key("r")).toBe(true);
    expect(screen.getByRole("group", { name: "Rounds" })).toBeTruthy();
  });
});
