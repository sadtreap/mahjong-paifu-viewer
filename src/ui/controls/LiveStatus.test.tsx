// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LiveStatusProps } from "../viewer/types";
import { LiveStatus } from "./LiveStatus";

const region = () => document.querySelector("[aria-live]") as HTMLElement;

function renderStatus(props: LiveStatusProps) {
  const view = render(<LiveStatus {...props} />);
  return (next: LiveStatusProps) => view.rerender(<LiveStatus {...next} />);
}

afterEach(cleanup);

describe("LiveStatus", () => {
  it("is one polite, atomic live region that is not on screen", () => {
    renderStatus({ text: "A draws", quiet: false, announcement: null });
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(region().getAttribute("aria-live")).toBe("polite");
    expect(region().getAttribute("aria-atomic")).toBe("true");
    expect(region().className).toBe("sr-only");
    expect(region().textContent).toBe("A draws");
  });

  it("is off while quiet, then puts the settled text in again so it is read once", () => {
    const update = renderStatus({ text: "A draws", quiet: false, announcement: null });
    const before = region().firstElementChild;
    update({ text: "B draws", quiet: true, announcement: null });
    expect(region().getAttribute("aria-live")).toBe("off");
    expect(region().firstElementChild).toBe(before);
    update({ text: "C draws", quiet: false, announcement: null });
    expect(region().getAttribute("aria-live")).toBe("polite");
    expect(region().textContent).toBe("C draws");
    expect(region().firstElementChild).not.toBe(before);
  });

  it("reads an announcement in place of the text, even while quiet", () => {
    const update = renderStatus({ text: "A draws", quiet: true, announcement: null });
    expect(region().getAttribute("aria-live")).toBe("off");
    update({ text: "A draws", quiet: true, announcement: { id: 1, text: "Link copied" } });
    expect(region().getAttribute("aria-live")).toBe("polite");
    expect(region().textContent).toBe("Link copied");
    update({ text: "A draws", quiet: true, announcement: null });
    expect(region().getAttribute("aria-live")).toBe("off");
    expect(region().textContent).toBe("A draws");
  });

  it("puts a repeated announcement in anew, so the same words are read again", () => {
    const update = renderStatus({
      text: "A draws",
      quiet: false,
      announcement: { id: 1, text: "Link copied" },
    });
    const first = region().firstElementChild;
    update({ text: "A draws", quiet: false, announcement: { id: 1, text: "Link copied" } });
    expect(region().firstElementChild).toBe(first);
    update({ text: "A draws", quiet: false, announcement: { id: 2, text: "Link copied" } });
    expect(region().textContent).toBe("Link copied");
    expect(region().firstElementChild).not.toBe(first);
  });
});
