// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusLine, type StatusLineViewProps } from "./StatusLine";

const base: StatusLineViewProps = {
  text: "A discards 5m",
  quiet: false,
  announcement: null,
  counter: "Step 4 / 30",
  legend: null,
};

const live = () => document.querySelector("[aria-live]") as HTMLElement;

afterEach(cleanup);

describe("StatusLine", () => {
  it("is the one live region, polite and atomic", () => {
    render(<StatusLine {...base} />);
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(live().getAttribute("aria-live")).toBe("polite");
    expect(live().getAttribute("aria-atomic")).toBe("true");
    expect(live().textContent).toBe("A discards 5m");
    expect(screen.getByText("Step 4 / 30")).toBeTruthy();
  });

  it("stays quiet during a burst and puts the text in again once when it ends", () => {
    const { rerender } = render(<StatusLine {...base} quiet />);
    expect(live().getAttribute("aria-live")).toBe("off");
    const before = live().firstElementChild;
    rerender(<StatusLine {...base} quiet text="B draws" />);
    expect(live().getAttribute("aria-live")).toBe("off");
    expect(live().firstElementChild).toBe(before);
    rerender(<StatusLine {...base} text="B draws" />);
    expect(live().getAttribute("aria-live")).toBe("polite");
    // A new node, so assistive technology announces the step it settled on.
    expect(live().firstElementChild).not.toBe(before);
    expect(live().textContent).toBe("B draws");
    const settled = live().firstElementChild;
    rerender(<StatusLine {...base} text="C draws" />);
    expect(live().firstElementChild).toBe(settled);
  });

  it("shows an announcement in place of the text", () => {
    render(<StatusLine {...base} announcement="Link copied" prefix="Turn 3 · " />);
    expect(live().textContent).toBe("Link copied");
  });

  it("puts the turn prefix inside the text, and the legend and back chip beside it", () => {
    render(
      <StatusLine
        {...base}
        prefix="Turn 3 · "
        legend={<span>step · click the table</span>}
        back={<button type="button">Back</button>}
      />,
    );
    expect(live().textContent).toBe("Turn 3 · A discards 5m");
    expect(screen.getByText("step · click the table")).toBeTruthy();
    expect(live().contains(screen.getByRole("button", { name: "Back" }))).toBe(false);
  });
});
