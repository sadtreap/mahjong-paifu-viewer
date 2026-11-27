// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { ScrubberProps } from "../viewer/types";
import { Scrubber } from "./Scrubber";

function renderScrubber(extra: Partial<ScrubberProps> = {}) {
  const props: ScrubberProps = {
    round: 2,
    steps: 12,
    step: 4,
    describe: (step) => `step ${step} text`,
    turnOf: (step) => step + 100,
    onSeek: vi.fn(),
    ...extra,
  };
  render(
    <I18nProvider>
      <Scrubber {...props} />
    </I18nProvider>,
  );
  return { props, slider: screen.getByRole("slider") as HTMLInputElement };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Scrubber", () => {
  it("is a native range over the round's steps, named and described for assistive tech", () => {
    const { slider } = renderScrubber();
    expect(screen.getByRole("slider", { name: "Step in this round" })).toBe(slider);
    expect(slider.tagName).toBe("INPUT");
    expect(slider.type).toBe("range");
    expect(slider.getAttribute("min")).toBe("1");
    expect(slider.getAttribute("max")).toBe("12");
    expect(slider.value).toBe("5");
    expect(slider.getAttribute("aria-valuetext")).toBe("Step 5 of 12, turn 104: step 4 text");
  });

  it("reports every change as a scrub in the current round", () => {
    const { props, slider } = renderScrubber();
    fireEvent.change(slider, { target: { value: "9" } });
    expect(props.onSeek).toHaveBeenCalledWith({ round: 2, step: 8 }, "scrub");
  });

  it("moves ten steps with PageUp and PageDown, stopping at the round's ends", () => {
    const { props, slider } = renderScrubber({ steps: 30, step: 14 });
    expect(fireEvent.keyDown(slider, { key: "PageUp" })).toBe(false);
    expect(props.onSeek).toHaveBeenLastCalledWith({ round: 2, step: 24 }, "scrub");
    expect(fireEvent.keyDown(slider, { key: "PageDown" })).toBe(false);
    expect(props.onSeek).toHaveBeenLastCalledWith({ round: 2, step: 4 }, "scrub");
    cleanup();

    const near = renderScrubber({ steps: 12, step: 4 });
    fireEvent.keyDown(near.slider, { key: "PageUp" });
    expect(near.props.onSeek).toHaveBeenLastCalledWith({ round: 2, step: 11 }, "scrub");
    fireEvent.keyDown(near.slider, { key: "PageDown" });
    expect(near.props.onSeek).toHaveBeenLastCalledWith({ round: 2, step: 0 }, "scrub");
  });

  it("does not report a page key at the end it already stands on", () => {
    const { props, slider } = renderScrubber({ steps: 12, step: 11 });
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(props.onSeek).not.toHaveBeenCalled();
  });

  it("leaves the arrows, Home and End to the range itself", () => {
    const { props, slider } = renderScrubber();
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
      // Not prevented: the browser moves the range and fires a change.
      expect(fireEvent.keyDown(slider, { key }), key).toBe(true);
    }
    expect(props.onSeek).not.toHaveBeenCalled();
  });

  it("keeps a position outside the round inside the range", () => {
    expect(renderScrubber({ steps: 12, step: 40 }).slider.value).toBe("12");
    cleanup();
    const failed = renderScrubber({ steps: 1, step: 0 });
    expect(failed.slider.getAttribute("max")).toBe("1");
    expect(failed.slider.value).toBe("1");
  });
});
