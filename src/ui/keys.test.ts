import { describe, expect, it } from "vitest";
import { keyAction } from "./keys";

const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) =>
  keyAction({ key, ctrlKey: false, metaKey: false, altKey: false, ...modifiers });

describe("keyAction", () => {
  it("maps the documented shortcuts", () => {
    expect(press("ArrowLeft")).toBe("prevStep");
    expect(press("ArrowRight")).toBe("nextStep");
    expect(press("ArrowUp")).toBe("prevRound");
    expect(press("ArrowDown")).toBe("nextRound");
    expect(press("Home")).toBe("firstStep");
    expect(press("End")).toBe("lastStep");
  });

  it("leaves the paging keys to page scrolling", () => {
    expect(press("PageUp")).toBeNull();
    expect(press("PageDown")).toBeNull();
  });

  it("ignores other keys and modified presses", () => {
    expect(press("a")).toBeNull();
    expect(press("ArrowLeft", { altKey: true })).toBeNull();
    expect(press("ArrowRight", { metaKey: true })).toBeNull();
    expect(press("Home", { ctrlKey: true })).toBeNull();
  });
});
