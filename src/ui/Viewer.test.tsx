// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GameLog } from "../core/model";
import { I18nProvider } from "../i18n/I18nProvider";
import { game, round } from "./__fixtures__/game";
import type { Position } from "./navigation";
import { Viewer } from "./Viewer";

/** The fixture game with a second round, so round jumps have somewhere to go. */
const twoRounds: GameLog = {
  ...game,
  rounds: [round, { ...round, number: 2, dealer: 1, honba: 0 }],
};

function renderViewer(start: Position | null = null) {
  return render(
    <I18nProvider>
      <Viewer game={twoRounds} start={start} />
    </I18nProvider>,
  );
}

const counter = () => screen.getByText(/^Step \d+ \/ \d+$/).textContent;
const roundIndex = () => (screen.getByLabelText("Round") as HTMLSelectElement).value;
const slider = () => screen.getByRole("slider", { name: "Step" });

/** Presses a key on an element (the window by default); false when a handler prevented it. */
async function press(key: string, target: Element | Window = window): Promise<boolean> {
  let allowed = true;
  await act(async () => {
    allowed = fireEvent.keyDown(target, { key });
  });
  return allowed;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Viewer shortcuts", () => {
  it("does nothing on next round at the end of the game, like the disabled button", async () => {
    renderViewer({ round: 1, step: 999 });
    const atEnd = counter();
    expect(screen.getByRole("heading", { name: "Final standings" })).toBeTruthy();

    await press("ArrowDown");
    expect(roundIndex()).toBe("1");
    expect(counter()).toBe(atEnd);
    expect(screen.getByRole("heading", { name: "Final standings" })).toBeTruthy();
  });

  it("does nothing on previous round in the first round", async () => {
    renderViewer({ round: 0, step: 3 });
    await press("ArrowUp");
    expect(roundIndex()).toBe("0");
    expect(counter()).toMatch(/^Step 4 \//);
  });

  it("leaves the arrow and paging keys to the focused step slider", async () => {
    renderViewer({ round: 1, step: 2 });
    const before = counter();
    act(() => slider().focus());
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]) {
      // Not prevented, so the browser's own slider handling (within the round) applies.
      expect(await press(key, slider())).toBe(true);
    }
    expect(roundIndex()).toBe("1");
    expect(counter()).toBe(before);
  });

  it("leaves Page Up and Page Down to page scrolling", async () => {
    renderViewer({ round: 0, step: 2 });
    expect(await press("PageDown", document.body)).toBe(true);
    expect(await press("PageUp", document.body)).toBe(true);
    expect(roundIndex()).toBe("0");
    expect(counter()).toMatch(/^Step 3 \//);
  });

  it("still changes rounds with the up and down arrows", async () => {
    renderViewer({ round: 0, step: 2 });
    expect(await press("ArrowDown", document.body)).toBe(false);
    expect(roundIndex()).toBe("1");
    expect(counter()).toMatch(/^Step 1 \//);
  });
});

describe("Viewer focus and announcements", () => {
  it("keeps a playback button focusable when it reaches its limit", async () => {
    renderViewer({ round: 0, step: 2 });
    const last = screen.getByRole("button", { name: "Last step" });
    act(() => last.focus());
    await act(async () => {
      fireEvent.click(last);
    });
    expect(last.isConnected).toBe(true);
    expect(last.hasAttribute("disabled")).toBe(false);
    expect(last.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(last);

    // Activating it again changes nothing.
    const atEnd = counter();
    await act(async () => {
      fireEvent.click(last);
    });
    expect(counter()).toBe(atEnd);
  });

  it("announces each step once and names the round when a round starts", async () => {
    renderViewer({ round: 0, step: 2 });
    const output = screen.getByText(/^Step \d+ \/ \d+$/);
    expect(output.tagName).toBe("OUTPUT");
    expect(output.getAttribute("aria-live")).toBe("off");

    await press("ArrowDown", document.body);
    expect(screen.getByText("East 2: starting hands dealt")).toBeTruthy();
  });
});
