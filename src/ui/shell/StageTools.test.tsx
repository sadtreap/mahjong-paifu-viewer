// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Seat } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Breakpoint, MoreMenuSlot, PlayerRow, StageToolsProps } from "../viewer/types";
import { StageTools } from "./StageTools";

const PLAYERS: PlayerRow[] = [
  {
    seat: 0,
    name: "Alice",
    rank: null,
    rating: null,
    wind: 1,
    dealer: false,
    riichi: false,
    score: 25000,
    place: 2,
  },
  {
    seat: 1,
    name: "Bob",
    rank: null,
    rating: null,
    wind: 2,
    dealer: false,
    riichi: false,
    score: 25000,
    place: 3,
  },
  {
    seat: 2,
    name: "Carol",
    rank: null,
    rating: null,
    wind: 3,
    dealer: false,
    riichi: false,
    score: 25000,
    place: 4,
  },
  {
    seat: 3,
    name: "Dave",
    rank: null,
    rating: null,
    wind: 0,
    dealer: true,
    riichi: false,
    score: 25000,
    place: 1,
  },
];

function renderTools(overrides: Partial<StageToolsProps> = {}) {
  const props: StageToolsProps = {
    breakpoint: "wide",
    showAllHands: true,
    view: "3d",
    panelOpen: true,
    linkable: true,
    players: PLAYERS,
    pov: 0,
    onPov: vi.fn(),
    onOpenLog: vi.fn(),
    onCopyLink: vi.fn(),
    onToggleHands: vi.fn(),
    onToggleView: vi.fn(),
    onSettings: vi.fn(),
    onHelp: vi.fn(),
    onTogglePanel: vi.fn(),
    panelId: "review-panel",
    menu: (slot: MoreMenuSlot) =>
      slot.open ? (
        <div role="menu" aria-label="More menu">
          <button type="button" role="menuitem" onClick={slot.onClose}>
            Close menu
          </button>
        </div>
      ) : null,
    ...overrides,
  };
  render(
    <I18nProvider>
      <StageTools {...props} />
    </I18nProvider>,
  );
  return props;
}

function toolbar() {
  return screen.getByRole("group", { name: "Viewer tools" });
}

function buttonNames() {
  return within(toolbar())
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));
}

afterEach(cleanup);

describe("StageTools", () => {
  it.each<[Breakpoint, string[]]>([
    [
      "wide",
      [
        "Open another log",
        "Copy link to this moment",
        "Point of view: Alice",
        "Show all hands",
        "3D table",
        "Settings",
        "Keyboard, mouse and touch help",
        "Review panel",
      ],
    ],
    [
      "laptop",
      [
        "Open another log",
        "Copy link to this moment",
        "Point of view: Alice",
        "Show all hands",
        "3D table",
        "Settings",
        "Keyboard, mouse and touch help",
        "Review panel",
      ],
    ],
    [
      "tabletPortrait",
      [
        "Open another log",
        "Copy link to this moment",
        "Point of view: Alice",
        "Show all hands",
        "3D table",
        "Settings",
        "Keyboard, mouse and touch help",
      ],
    ],
    ["phonePortrait", ["Point of view: Alice", "Show all hands", "3D table", "More"]],
    [
      "phoneLandscape",
      ["Point of view: Alice", "Show all hands", "3D table", "Review panel", "More"],
    ],
  ])("shows the %s buttons", (breakpoint, names) => {
    renderTools({ breakpoint });
    expect(buttonNames()).toEqual(names);
  });

  it("marks the hands and 3D toggles as pressed and puts the key in the tooltip", () => {
    const props = renderTools({ showAllHands: false, view: "3d" });
    const hands = screen.getByRole("button", { name: "Show all hands" });
    expect(hands.getAttribute("aria-pressed")).toBe("false");
    expect(hands.getAttribute("title")).toBe("Show all hands (H)");
    const view = screen.getByRole("button", { name: "3D table" });
    expect(view.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(hands);
    fireEvent.click(view);
    expect(props.onToggleHands).toHaveBeenCalledTimes(1);
    expect(props.onToggleView).toHaveBeenCalledTimes(1);
  });

  it("ties the Review panel button to the panel", () => {
    const props = renderTools({ panelOpen: false });
    const panel = screen.getByRole("button", { name: "Review panel" });
    expect(panel.getAttribute("aria-expanded")).toBe("false");
    expect(panel.getAttribute("aria-controls")).toBe("review-panel");
    // R opens the round list (it never hides the rail), so the toggle does not advertise it.
    expect(panel.getAttribute("title")).toBe("Review panel");
    fireEvent.click(panel);
    expect(props.onTogglePanel).toHaveBeenCalledTimes(1);
  });

  it("calls the open, settings and help actions", () => {
    const props = renderTools();
    fireEvent.click(screen.getByRole("button", { name: "Open another log" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Keyboard, mouse and touch help" }));
    expect(props.onOpenLog).toHaveBeenCalledTimes(1);
    expect(props.onSettings).toHaveBeenCalledTimes(1);
    expect(props.onHelp).toHaveBeenCalledTimes(1);
  });

  it("keeps Copy link focusable but inert for a local log, and says why", () => {
    const props = renderTools({ linkable: false });
    const link = screen.getByRole("button", { name: "Copy link to this moment" });
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.hasAttribute("disabled")).toBe(false);
    expect(link.getAttribute("title")).toBe("Links work only for the sample logs and Tenhou logs");
    fireEvent.click(link);
    expect(props.onCopyLink).not.toHaveBeenCalled();
  });

  it("opens and closes the ⋯ menu it owns", async () => {
    renderTools({ breakpoint: "phonePortrait" });
    const more = screen.getByRole("button", { name: "More" });
    expect(more.getAttribute("aria-haspopup")).toBe("menu");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu", { name: "More menu" })).toBeNull();
    await act(async () => {
      fireEvent.click(more);
    });
    expect(more.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Close menu" }));
    });
    expect(screen.queryByRole("menu", { name: "More menu" })).toBeNull();
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("passes the ⋯ button as the menu's anchor", async () => {
    let anchor: HTMLButtonElement | null = null;
    renderTools({
      breakpoint: "phoneLandscape",
      menu: (slot) => {
        anchor = slot.anchorRef.current;
        return null;
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "More" }));
    });
    expect(anchor).toBe(screen.getByRole("button", { name: "More" }));
  });
});

describe("StageTools point-of-view menu", () => {
  async function openSeats(overrides: Partial<StageToolsProps> = {}) {
    const props = renderTools(overrides);
    const button = screen.getByRole("button", { name: /^Point of view/ });
    await act(async () => {
      fireEvent.click(button);
    });
    return { props, button, menu: screen.getByRole("menu", { name: "View from" }) };
  }

  it("shows the current seat's wind and lists the playing seats with the current one checked", async () => {
    const { button, menu } = await openSeats({ pov: 3 });
    expect(button.getAttribute("aria-label")).toBe("Point of view: Dave");
    expect(button.textContent).toBe("E");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("title")).toBe("Point of view (1–4, V)");
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Alice, South",
      "Bob, West",
      "Carol, North",
      "Dave, East, dealer",
    ]);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "false",
      "true",
    ]);
    expect(document.activeElement).toBe(items[3]);
  });

  it("lists three seats in a three-player game", async () => {
    const { button, menu } = await openSeats({ players: PLAYERS.slice(0, 3) });
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(3);
    expect(button.getAttribute("title")).toBe("Point of view (1–3, V)");
  });

  it("picks a seat, closes and gives the focus back to the button", async () => {
    const { props, button, menu } = await openSeats();
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Carol, North" }));
    });
    expect(props.onPov).toHaveBeenCalledWith(2 satisfies Seat);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("moves with the arrow keys, Home and End, and keeps them from the viewer", async () => {
    const windowKeys = vi.fn();
    window.addEventListener("keydown", windowKeys);
    try {
      const { menu } = await openSeats();
      const items = within(menu).getAllByRole("menuitemradio");
      fireEvent.keyDown(document.activeElement ?? menu, { key: "ArrowDown" });
      expect(document.activeElement).toBe(items[1]);
      fireEvent.keyDown(document.activeElement ?? menu, { key: "ArrowUp" });
      fireEvent.keyDown(document.activeElement ?? menu, { key: "ArrowUp" });
      expect(document.activeElement).toBe(items[3]);
      fireEvent.keyDown(document.activeElement ?? menu, { key: "Home" });
      expect(document.activeElement).toBe(items[0]);
      fireEvent.keyDown(document.activeElement ?? menu, { key: "End" });
      expect(document.activeElement).toBe(items[3]);
      expect(windowKeys).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowKeys);
    }
  });

  it("closes with Esc (focus back on the button) and with a press outside", async () => {
    const { button } = await openSeats();
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);

    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByRole("menu")).toBeTruthy();
    // The press outside only closes the menu: it does not reach what is under it (the table).
    const under = vi.fn();
    document.body.addEventListener("pointerdown", under);
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    document.body.removeEventListener("pointerdown", under);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(under).not.toHaveBeenCalled();
  });

  it("marks the dealer's wind", () => {
    renderTools({ pov: 3 });
    const badge = screen.getByRole("button", { name: "Point of view: Dave" }).querySelector("span");
    expect(badge?.className).toMatch(/dealer/);
  });
});
