// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Toast } from "./Toast";

afterEach(cleanup);

describe("Toast", () => {
  it("shows its text to the eye only, and nothing without a text", () => {
    const { container, rerender } = render(<Toast text="Link copied" />);
    const toast = container.firstElementChild;
    expect(toast?.textContent).toBe("Link copied");
    expect(toast?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("[aria-live], [role]")).toBeNull();
    rerender(<Toast text={null} />);
    expect(container.firstElementChild).toBeNull();
  });
});
