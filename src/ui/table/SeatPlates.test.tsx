// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { PlateAid, PlateInfo } from "../viewer/types";
import { initialOf, SeatPlates } from "./SeatPlates";

function plate(overrides: Partial<PlateInfo> = {}): PlateInfo {
  return {
    seat: 1,
    side: "right",
    name: "Bartholomew",
    wind: 0,
    dealer: true,
    score: 37500,
    riichi: false,
    aid: null,
    kita: 0,
    ...overrides,
  };
}

function renderPlates(plates: PlateInfo[], pov: PlateInfo["seat"] = 0) {
  return render(
    <I18nProvider>
      <SeatPlates plates={plates} active={1} pov={pov} />
    </I18nProvider>,
  );
}

const plateOf = (seat: number) => document.querySelector(`[data-seat="${seat}"]`) as HTMLElement;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("SeatPlates", () => {
  it("shows the name, score, initial, wind and screen-reader facts", () => {
    renderPlates([plate({ riichi: true })]);
    const el = plateOf(1);
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("role")).toBeNull();
    expect(screen.getByText("Bartholomew")).toBeTruthy();
    expect(screen.getByText("37,500")).toBeTruthy();
    const disc = el.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(disc.textContent).toBe("BE");
    for (const fact of ["East", "Dealer", "Riichi"]) {
      expect(screen.getByText(fact).className).toBe("sr-only");
    }
  });

  it("shows the shanten, tenpai and complete-hand rows", () => {
    const cases: [PlateAid, string][] = [
      [{ kind: "shanten", value: 2 }, "2-shanten"],
      [{ kind: "shanten", value: 0 }, "Tenpai"],
      [{ kind: "shanten", value: -1 }, "Complete hand"],
    ];
    for (const [aid, text] of cases) {
      renderPlates([plate({ seat: 0, side: "bottom", aid })]);
      expect(screen.getByText(text)).toBeTruthy();
      cleanup();
    }
  });

  it("shows waits with the tiles left and a screen-reader sentence", () => {
    renderPlates([plate({ aid: { kind: "waits", tiles: ["3p", "6p"], left: 6, furiten: false } })]);
    const el = plateOf(1);
    expect(el.querySelectorAll("img")).toHaveLength(2);
    expect([...el.querySelectorAll("img")].every((img) => img.getAttribute("alt") === "")).toBe(
      true,
    );
    const label = screen.getByText("Wait");
    expect(label.getAttribute("aria-hidden")).toBe("true");
    expect(label.textContent).toBe("Wait ·");
    // No leading separator: wrapped to a line of its own, a count must not start with "·" (the
    // phones' "Wait · 6" takes it from the label's end).
    const count = screen.getByText("6 left").parentElement as HTMLElement;
    expect(count.getAttribute("aria-hidden")).toBe("true");
    expect([...count.children].map((child) => child.textContent)).toEqual(["6 left", "6"]);
    expect(screen.getByText("Waits 3 Pin and 6 Pin, 6 left").className).toBe("sr-only");
    expect(el.textContent).not.toContain("Furiten");
  });

  it("replaces the count with a furiten chip and folds long waits into +n", () => {
    renderPlates([
      plate({
        aid: { kind: "waits", tiles: ["1s", "4s", "7s", "2z"], left: 9, furiten: true },
      }),
    ]);
    const el = plateOf(1);
    expect(el.querySelectorAll("img")).toHaveLength(3);
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByText("Furiten")).toBeTruthy();
    expect(screen.queryByText("9 left")).toBeNull();
    expect(screen.getByText(/, furiten$/).className).toBe("sr-only");
    // The aid row is marked, so a phone chip shows the furiten label in place of "Wait".
    const row = screen.getByText("Furiten").parentElement as HTMLElement;
    expect(row.className).toMatch(/xfu/);
    cleanup();
    renderPlates([plate({ aid: { kind: "waits", tiles: ["3p"], left: 2, furiten: false } })]);
    expect((screen.getByText("Wait").parentElement as HTMLElement).className).not.toMatch(/xfu/);
  });

  it("shows opponents' kita as text, not the point of view's", () => {
    renderPlates([plate({ kita: 2 }), plate({ seat: 0, side: "bottom", kita: 1 })], 0);
    expect(plateOf(1).textContent).toContain("North ×2");
    expect(plateOf(0).textContent).not.toContain("North");
  });

  it("takes the first code point of a name for the disc", () => {
    expect(initialOf("  bob")).toBe("b");
    expect(initialOf("𠮷田")).toBe("𠮷");
    expect(initialOf("")).toBe("");
  });
});
