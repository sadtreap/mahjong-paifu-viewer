import { describe, expect, it, vi } from "vitest";
import { copyLink } from "./clipboard";

describe("copyLink", () => {
  it("writes the link to the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyLink("https://example.com/?sample=sanma", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://example.com/?sample=sanma");
  });

  it("reports a missing or refused clipboard", async () => {
    expect(await copyLink("x", undefined)).toBe(false);
    const writeText = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    expect(await copyLink("x", { writeText })).toBe(false);
  });
});
