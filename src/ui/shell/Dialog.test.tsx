// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog } from "./Dialog";

/** A page with two openers of one dialog, the way the panel's actions and the keys open one. */
function Harness({ focusBody = false }: { focusBody?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        First opener
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Second opener
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Title"
        closeLabel="Close"
        focusBody={focusBody}
      >
        <button type="button">Inside</button>
      </Dialog>
    </>
  );
}

async function openFrom(name: string) {
  const opener = screen.getByRole("button", { name });
  opener.focus();
  await act(async () => {
    fireEvent.click(opener);
  });
  return { opener, dialog: screen.getByRole("dialog", { name: "Title" }) };
}

afterEach(cleanup);

describe("Dialog", () => {
  it("renders nothing inside while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Inside" })).toBeNull();
  });

  it("opens as a modal dialog named by its title, with a visible close button", async () => {
    render(<Harness />);
    const { dialog } = await openFrom("First opener");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("Title");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close.title).toBe("Close");
    expect(close.querySelector("svg")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Inside" })).toBeTruthy();
  });

  it.each([
    ["the close button", (dialog: HTMLElement) => fireEvent.click(closeButton(dialog))],
    ["Esc", (dialog: HTMLElement) => fireEvent.keyDown(closeButton(dialog), { key: "Escape" })],
    ["a press on the backdrop", pressBackdrop],
    ["the browser's own cancel", (dialog: HTMLElement) => fireEvent(dialog, new Event("cancel"))],
  ])("closes with %s and returns the focus to the opener", async (_name, close) => {
    render(<Harness />);
    const { opener, dialog } = await openFrom("Second opener");
    await act(async () => {
      close(dialog);
    });
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("stays open on a press inside", async () => {
    render(<Harness />);
    const { dialog } = await openFrom("First opener");
    await act(async () => {
      for (const inside of [
        within(dialog).getByRole("heading", { level: 2 }),
        within(dialog).getByRole("button", { name: "Inside" }),
      ]) {
        fireEvent.pointerDown(inside);
        fireEvent.click(inside);
      }
    });
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("stays open when a drag that began inside ends on the backdrop", async () => {
    render(<Harness />);
    const { dialog } = await openFrom("First opener");
    await act(async () => {
      fireEvent.pointerDown(within(dialog).getByRole("heading", { level: 2 }));
      // The browser sends the click of such a drag to the dialog, the common ancestor.
      fireEvent.click(dialog);
    });
    expect(dialog.hasAttribute("open")).toBe(true);
    await act(async () => {
      pressBackdrop(dialog);
    });
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("keeps Esc from the page behind it", async () => {
    render(<Harness />);
    const { dialog } = await openFrom("First opener");
    let seen = 0;
    const count = () => {
      seen++;
    };
    window.addEventListener("keydown", count);
    await act(async () => {
      fireEvent.keyDown(closeButton(dialog), { key: "Escape" });
    });
    window.removeEventListener("keydown", count);
    expect(seen).toBe(0);
  });

  it("returns the focus to whichever control opened it this time", async () => {
    render(<Harness />);
    for (const name of ["First opener", "Second opener"]) {
      const { opener, dialog } = await openFrom(name);
      await act(async () => {
        fireEvent.click(closeButton(dialog));
      });
      expect(document.activeElement).toBe(opener);
    }
  });

  it("makes its body focusable only when asked to, and adds no landmark", async () => {
    render(<Harness focusBody />);
    const { dialog } = await openFrom("First opener");
    const body = within(dialog).getByRole("button", { name: "Inside" })
      .parentElement as HTMLElement;
    expect(body.tabIndex).toBe(0);
    expect(within(dialog).queryByRole("region")).toBeNull();
    expect(within(dialog).queryByRole("banner")).toBeNull();
    cleanup();

    render(<Harness />);
    const plain = await openFrom("First opener");
    expect(plain.dialog.querySelector('[tabindex="0"]')).toBeNull();
  });
});

/** A press and release on the backdrop, which the browser reports on the dialog itself. */
function pressBackdrop(dialog: HTMLElement) {
  fireEvent.pointerDown(dialog);
  fireEvent.click(dialog);
}

function closeButton(dialog: HTMLElement) {
  return within(dialog).getByRole("button", { name: "Close" });
}
