// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLog, Round, Seat } from "../../core/model";
import { I18nProvider } from "../../i18n/I18nProvider";
import { MESSAGES } from "../../i18n/messages";
import { buildTimeline } from "../../replay/timeline";
import { sanmaCrossFormatGame } from "../../test/sanma-game";
import { game as fixtureGame } from "../__fixtures__/game";
import { playerNames } from "../labels";
import type { Position } from "../navigation";
import { createTimelineCache } from "../timelineCache";
import { createStepIndex } from "../viewer/stepIndex";
import type { TimelineProps } from "../viewer/types";
import { narrowLabel } from "./GameBand";
import { Timeline } from "./Timeline";
import { gameOverview, laneOrder, povMarks, roundMarks } from "./timelineModel";

const { en } = MESSAGES;

function props(game: GameLog, position: Position, pov: Seat, extra: Partial<TimelineProps> = {}) {
  const timelines = createTimelineCache(game.rounds, game.playerCount);
  const ix = createStepIndex(game, timelines);
  const names = playerNames(en, game.players);
  const overview = gameOverview(game, ix, en, names, "en");
  const round = game.rounds[position.round] as Round;
  const all: TimelineProps = {
    overview,
    position,
    marks: roundMarks(round, buildTimeline(round, game.playerCount), ix, position.round),
    povMarks: povMarks(game, overview, pov),
    laneOrder: laneOrder(pov, game.playerCount),
    pov,
    names,
    describe: (step) => `step ${step} text`,
    turnOf: (step) => step + 100,
    pin: null,
    onPinJump: vi.fn(),
    onSeek: vi.fn(),
    onScrubEnd: vi.fn(),
    ...extra,
  };
  return all;
}

function renderTimeline(all: TimelineProps) {
  const view = render(
    <I18nProvider>
      <Timeline {...all} />
    </I18nProvider>,
  );
  return { ...view, all };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Timeline", () => {
  const sanma = sanmaCrossFormatGame();

  it("draws one band-1 segment per round, hidden from assistive technology", () => {
    const { container } = renderTimeline(props(sanma, { round: 2, step: 3 }, 0));
    const segments = container.querySelectorAll("[data-round]");
    expect(segments).toHaveLength(sanma.rounds.length);
    expect(segments[0]?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(segments[0]?.getAttribute("title")).toBe(
      "E1 · A wins by ron off B · 3 han · 30 fu · 5,800 points",
    );
    expect(segments[3]?.textContent).toContain("E3");
  });

  it("marks the POV's wins and deal-ins on band 1", () => {
    const won = renderTimeline(props(sanma, { round: 0, step: 0 }, 0));
    expect(won.container.querySelector('[data-round="0"]')?.textContent).toContain("★");
    cleanup();
    const dealtIn = renderTimeline(props(sanma, { round: 0, step: 0 }, 1));
    expect(dealtIn.container.querySelector('[data-round="0"]')?.textContent).toContain("▼");
    expect(dealtIn.container.querySelector('[data-round="1"]')?.textContent).not.toMatch(/[★▼]/);
  });

  it("gives the step slider its range and value text", () => {
    renderTimeline(props(fixtureGame, { round: 0, step: 4 }, 0));
    const slider = screen.getByRole("slider", { name: "Step in this round" });
    expect(slider.getAttribute("min")).toBe("1");
    expect(slider.getAttribute("max")).toBe("12");
    expect((slider as HTMLInputElement).value).toBe("5");
    expect(slider.getAttribute("aria-valuetext")).toBe("Step 5 of 12, turn 104: step 4 text");
  });

  it("scrubs with the slider and ends the scrub on release", () => {
    const { all } = renderTimeline(props(fixtureGame, { round: 0, step: 4 }, 0));
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "9" } });
    expect(all.onSeek).toHaveBeenCalledWith({ round: 0, step: 8 }, "scrub");
    expect(all.onScrubEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(all.onScrubEnd).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(slider);
    expect(all.onScrubEnd).toHaveBeenCalledTimes(1);
  });

  it("moves 10 steps with PageUp and PageDown on the slider", () => {
    const { all } = renderTimeline(props(fixtureGame, { round: 0, step: 4 }, 0));
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(all.onSeek).toHaveBeenLastCalledWith({ round: 0, step: 11 }, "scrub");
    fireEvent.keyDown(slider, { key: "PageDown" });
    expect(all.onSeek).toHaveBeenLastCalledWith({ round: 0, step: 0 }, "scrub");
    fireEvent.keyUp(slider, { key: "PageDown" });
    expect(all.onScrubEnd).toHaveBeenCalledTimes(1);
  });

  it("jumps to a round's start or result from band 1, and scrubs when dragged", () => {
    const { container, all } = renderTimeline(props(sanma, { round: 0, step: 0 }, 0));
    const segments = Array.from(container.querySelectorAll<HTMLElement>("[data-round]"));
    segments.forEach((segment, index) => {
      vi.spyOn(segment, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: index * 100, y: 0, width: 98, height: 18 }),
      );
    });
    const third = segments[2] as HTMLElement;
    fireEvent.pointerDown(third, { button: 0, clientX: 210, pointerId: 1 });
    expect(all.onSeek).toHaveBeenLastCalledWith({ round: 2, step: 0 }, "jump");
    // A drag past the slop scrubs: x 249 is halfway through round 2.
    fireEvent.pointerMove(third, { clientX: 249, pointerId: 1 });
    const steps = all.overview.rounds[2]?.steps ?? 0;
    expect(all.onSeek).toHaveBeenLastCalledWith(
      { round: 2, step: Math.round(0.5 * (steps - 1)) },
      "scrub",
    );
    fireEvent.pointerUp(third, { pointerId: 1 });
    expect(all.onScrubEnd).toHaveBeenCalledTimes(1);
    const marker = segments[1]?.querySelector("[data-marker]") as HTMLElement;
    fireEvent.pointerDown(marker, { button: 0, clientX: 195, pointerId: 2 });
    expect(all.onSeek).toHaveBeenLastCalledWith(
      { round: 1, step: (all.overview.rounds[1]?.steps ?? 0) - 1 },
      "jump",
    );
    fireEvent.pointerUp(marker, { pointerId: 2 });
    expect(all.onScrubEnd).toHaveBeenCalledTimes(1);
  });

  it("draws three lanes in a three-player game, POV first", () => {
    const { container } = renderTimeline(props(sanma, { round: 0, step: 5 }, 1));
    const band = container.querySelector("[data-lanes]");
    expect(band?.getAttribute("data-lanes")).toBe("3");
    const labels = Array.from(container.querySelectorAll("[data-lanes] [title]")).map((label) =>
      label.getAttribute("title"),
    );
    expect(labels).toEqual(["B", "C", "A"]);
    expect(container.textContent).not.toContain("Player 4");
  });

  it("shows the pond-tooltip pin in its owner's lane and jumps with it", () => {
    const { all } = renderTimeline(
      props(fixtureGame, { round: 0, step: 6 }, 0, {
        pin: { ref: { seat: 2, index: 0 }, step: 6, label: "Go to C's 1st discard" },
      }),
    );
    const pin = screen.getByRole("button", { name: "Go to C's 1st discard" });
    // Lanes from POV 0: A, B, C, D, so C is lane 2.
    expect(pin.style.getPropertyValue("--lane")).toBe("2");
    fireEvent.click(pin);
    expect(all.onPinJump).toHaveBeenCalledTimes(1);
  });

  it("has no pin without a pinned discard", () => {
    renderTimeline(props(fixtureGame, { round: 0, step: 6 }, 0));
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("narrowLabel", () => {
  it("keeps a round name, drops a honba round's name (it would repeat its neighbour)", () => {
    expect(narrowLabel("E3")).toBe("E3");
    expect(narrowLabel("E3-1")).toBe("");
    expect(narrowLabel("동3-12")).toBe("");
    expect(narrowLabel("東4")).toBe("東4");
  });
});
