// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createSpotlight, SPOTLIGHT_ROOT_ATTR, spotlightCss } from "./spotlight";

afterEach(() => {
  for (const style of document.head.querySelectorAll("style[data-spotlight]")) {
    style.remove();
  }
});

describe("spotlightCss", () => {
  it("is empty without a kind", () => {
    expect(spotlightCss(null)).toBe("");
    expect(spotlightCss(-1)).toBe("");
    expect(spotlightCss(34)).toBe("");
  });

  it("outlines that kind's tiles on the table, with a forced-colours rule", () => {
    const css = spotlightCss(9);
    expect(css).toContain(`[${SPOTLIGHT_ROOT_ATTR}] [data-k="9"]{outline:`);
    expect(css).toContain("var(--spot)");
    expect(css).toMatch(
      /@media \(forced-colors:active\)\{[^{]*\[data-k="9"\]\{outline:3px solid Highlight\}/,
    );
    expect(css).not.toMatch(/filter|opacity/);
  });
});

describe("createSpotlight", () => {
  const styles = () => [...document.head.querySelectorAll("style[data-spotlight]")];

  it("adds nothing until something is outlined", () => {
    const spotlight = createSpotlight(document);
    spotlight.clear();
    spotlight.setSticky(null);
    expect(styles()).toHaveLength(0);
  });

  it("writes one rule, falls back to the sticky pick and clears", () => {
    const spotlight = createSpotlight(document);
    spotlight.hover(4);
    expect(styles()).toHaveLength(1);
    expect(styles()[0]?.textContent).toContain('[data-k="4"]');
    spotlight.setSticky(30);
    expect(spotlight.current()).toBe(4);
    spotlight.clear();
    expect(spotlight.current()).toBe(30);
    expect(styles()[0]?.textContent).toContain('[data-k="30"]');
    spotlight.setSticky(null);
    expect(styles()[0]?.textContent).toBe("");
    expect(styles()).toHaveLength(1);
  });

  it("removes its element on dispose and puts it back on the next change", () => {
    const spotlight = createSpotlight(document);
    spotlight.hover(1);
    spotlight.dispose();
    expect(styles()).toHaveLength(0);
    spotlight.hover(2);
    expect(styles()).toHaveLength(1);
    expect(styles()[0]?.textContent).toContain('[data-k="2"]');
  });
});
