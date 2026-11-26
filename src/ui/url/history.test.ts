import { describe, expect, it } from "vitest";
import type { MoveKind } from "../viewer/types";
import { historyMode, JUMP_MERGE_MS, parseHistoryState, toHistoryState } from "./history";

describe("history state", () => {
  it("round-trips through parseHistoryState", () => {
    const plain = toHistoryState({ round: 2, step: 17 }, 1);
    expect(plain).toEqual({ v: 1, round: 2, step: 17, pov: 1 });
    expect(parseHistoryState(plain)).toEqual(plain);

    const entry = toHistoryState({ round: 0, step: 0 }, 3, { sid: "abc", n: 4 });
    expect(entry).toEqual({ v: 1, round: 0, step: 0, pov: 3, sid: "abc", n: 4 });
    expect(parseHistoryState(structuredClone(entry))).toEqual(entry);
  });

  it("rejects states written by anything else", () => {
    expect(parseHistoryState(null)).toBeNull();
    expect(parseHistoryState(undefined)).toBeNull();
    expect(parseHistoryState("v1")).toBeNull();
    expect(parseHistoryState({ round: 1, step: 1, pov: 0 })).toBeNull();
    expect(parseHistoryState({ v: 2, round: 1, step: 1, pov: 0 })).toBeNull();
    expect(parseHistoryState({ v: 1, round: -1, step: 1, pov: 0 })).toBeNull();
    expect(parseHistoryState({ v: 1, round: 1, step: 1.5, pov: 0 })).toBeNull();
    expect(parseHistoryState({ v: 1, round: 1, step: 1, pov: 4 })).toBeNull();
    expect(parseHistoryState({ v: 1, round: "1", step: 1, pov: 0 })).toBeNull();
  });

  it("drops a malformed entry tag but keeps the position", () => {
    expect(parseHistoryState({ v: 1, round: 1, step: 2, pov: 0, sid: 5, n: 1 })).toEqual({
      v: 1,
      round: 1,
      step: 2,
      pov: 0,
    });
    expect(parseHistoryState({ v: 1, round: 1, step: 2, pov: 0, sid: "s", n: -1 })).toEqual({
      v: 1,
      round: 1,
      step: 2,
      pov: 0,
    });
  });
});

describe("historyMode", () => {
  it("pushes a jump and a change of the point of view", () => {
    expect(historyMode("jump", Number.POSITIVE_INFINITY)).toBe("push");
    expect(historyMode("jump", JUMP_MERGE_MS)).toBe("push");
    expect(historyMode("pov", 5000)).toBe("push");
  });

  it("replaces the entry of a jump made less than a second earlier", () => {
    expect(historyMode("jump", 0)).toBe("replace");
    expect(historyMode("jump", JUMP_MERGE_MS - 1)).toBe("replace");
    expect(historyMode("pov", 300)).toBe("replace");
  });

  it("replaces for steps, holds, scrubs and autoplay", () => {
    const kinds: MoveKind[] = ["step", "repeat", "scrub", "autoplay"];
    for (const kind of kinds) {
      expect(historyMode(kind, 0)).toBe("replace");
      expect(historyMode(kind, Number.POSITIVE_INFINITY)).toBe("replace");
    }
  });

  it("writes nothing for history moves and the initial position", () => {
    expect(historyMode("history", Number.POSITIVE_INFINITY)).toBe("none");
    expect(historyMode("init", 0)).toBe("none");
  });
});
