import { describe, expect, it, vi } from "vitest";
import { copyLink } from "./clipboard";

describe("copyLink", () => {
  it("writes the link to the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyLink("https://example.com/?sample=sanma", { writeText })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://example.com/?sample=sanma");
  });

  it("has nothing to copy for a local log", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyLink(null, { writeText })).toBe("unavailable");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("reports a missing or refused clipboard", async () => {
    expect(await copyLink("x", undefined)).toBe("failed");
    const writeText = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    expect(await copyLink("x", { writeText })).toBe("failed");
  });
});
