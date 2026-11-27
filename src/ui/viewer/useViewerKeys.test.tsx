// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyCommand } from "./commands";
import { useViewerKeys, type ViewerKeysOptions } from "./useViewerKeys";

function Keys(props: ViewerKeysOptions) {
  useViewerKeys(props);
  return (
    <>
      <button type="button">button</button>
      <input aria-label="text" />
      <select aria-label="select">
        <option>a</option>
      </select>
      <input type="range" aria-label="range" />
      <div role="slider" tabIndex={0} aria-label="custom" aria-valuenow={1} />
      <input type="radio" aria-label="radio" />
      <dialog open>
        <button type="button">inside</button>
      </dialog>
    </>
  );
}

function setup(options: Partial<ViewerKeysOptions> = {}) {
  const onCommand = vi.fn<ViewerKeysOptions["onCommand"]>(() => undefined);
  render(<Keys charKeys onCommand={onCommand} {...options} />);
  return onCommand;
}

/** Presses a key on a target; false when the handler prevented its default action. */
const press = (target: Element | Window, key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key, ...init });

afterEach(cleanup);

describe("useViewerKeys", () => {
  it("runs the command of a key pressed on the page and prevents its default", () => {
    const onCommand = setup();
    expect(press(document.body, "ArrowRight")).toBe(false);
    expect(onCommand).toHaveBeenCalledWith(
      { type: "nav", command: { kind: "step", dir: 1 } },
      { repeat: false },
    );
  });

  it("passes on the key's auto-repeat", () => {
    const onCommand = setup();
    press(window, "ArrowRight", { repeat: true });
    expect(onCommand).toHaveBeenLastCalledWith(expect.anything(), { repeat: true });
  });

  it("leaves keys to text fields, select boxes and open dialogs", () => {
    const onCommand = setup();
    expect(press(screen.getByLabelText("text"), "ArrowRight")).toBe(true);
    expect(press(screen.getByLabelText("text"), "h")).toBe(true);
    expect(press(screen.getByLabelText("select"), "ArrowDown")).toBe(true);
    expect(press(screen.getByText("inside"), "ArrowRight")).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("leaves the arrows, Home, End and paging to sliders and radio buttons, but not other keys", () => {
    const onCommand = setup();
    for (const label of ["range", "custom", "radio"]) {
      for (const key of ["ArrowRight", "ArrowUp", "Home", "End"]) {
        expect(press(screen.getByLabelText(label), key)).toBe(true);
      }
    }
    expect(onCommand).not.toHaveBeenCalled();
    expect(press(screen.getByLabelText("range"), "h")).toBe(false);
    expect(onCommand).toHaveBeenCalledWith({ type: "toggleHands" }, { repeat: false });
  });

  it("lets Space press a focused button instead of toggling autoplay", () => {
    const onCommand = setup();
    expect(press(screen.getByText("button"), " ", { code: "Space" })).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();
    expect(press(document.body, " ", { code: "Space" })).toBe(false);
    expect(onCommand).toHaveBeenCalledWith({ type: "togglePlay" }, { repeat: false });
    // Arrows on a focused button still step.
    expect(press(screen.getByText("button"), "ArrowLeft")).toBe(false);
  });

  it("ignores modifiers, IME composition and keys already handled", () => {
    const onCommand = setup();
    expect(press(document.body, "ArrowLeft", { altKey: true })).toBe(true);
    expect(press(document.body, "h", { isComposing: true })).toBe(true);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.body.dispatchEvent(event);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("keeps the key's default when the command did not apply", () => {
    const onCommand = vi.fn<(command: KeyCommand) => boolean | undefined>(() => false);
    setup({ onCommand });
    expect(press(document.body, "Escape")).toBe(true);
    expect(onCommand).toHaveBeenCalledWith({ type: "escape" }, { repeat: false });
  });

  it("drops the single-key shortcuts when they are off", () => {
    const onCommand = setup({ charKeys: false });
    expect(press(document.body, "h")).toBe(true);
    expect(press(document.body, "1", { code: "Digit1" })).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();
    press(document.body, "End");
    expect(onCommand).toHaveBeenCalledWith(
      { type: "nav", command: { kind: "roundEnd" } },
      { repeat: false },
    );
  });
});
