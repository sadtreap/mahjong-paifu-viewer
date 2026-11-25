import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  detectFormat,
  LogParseError,
  loadLog,
  MAX_LOG_SIZE,
  MAX_ROUND_DRAWS,
  MAX_ROUND_EVENTS,
  parseLogText,
} from "./index";

describe("detectFormat", () => {
  it("detects mjlog XML", () => {
    expect(detectFormat('<mjloggm ver="2.3"><GO type="169"/></mjloggm>')).toBe("mjlog");
    expect(detectFormat("<html></html>")).toBeNull();
  });

  it("detects tenhou.net/6 JSON", () => {
    expect(detectFormat('{"title":["",""],"name":["a","b","c","d"],"log":[]}')).toBe("tenhou-json");
  });

  it("detects mjai JSON Lines and JSON arrays", () => {
    expect(detectFormat('{"type":"start_game"}\n{"type":"end_game"}')).toBe("mjai");
    expect(detectFormat('{"type":"start_game"}')).toBe("mjai");
    expect(detectFormat('[{"type":"start_game"},{"type":"end_game"}]')).toBe("mjai");
  });

  it("rejects other text", () => {
    expect(detectFormat("hello")).toBeNull();
    expect(detectFormat('{"foo":1}')).toBeNull();
  });
});

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof LogParseError ? error.code : "other";
  }
  return undefined;
}

describe("parseLogText", () => {
  it("reports empty, unrecognized and URL-only input", () => {
    expect(errorCode(() => parseLogText("  \n "))).toBe("empty");
    expect(errorCode(() => parseLogText("not a log"))).toBe("unrecognized");
    expect(
      errorCode(() => parseLogText("https://tenhou.net/0/?log=2000010100gm-0089-0000-0123abcd")),
    ).toBe("urlOnly");
  });
});

describe("size limits", () => {
  it("lets every real log through", () => {
    // The largest real round seen has 156 events and 70 draws (75 logs, 399 rounds); real files
    // are tens of kilobytes.
    expect(MAX_ROUND_EVENTS).toBeGreaterThanOrEqual(2 * 156);
    expect(MAX_ROUND_DRAWS).toBeGreaterThanOrEqual(70);
    expect(MAX_LOG_SIZE).toBeGreaterThanOrEqual(1024 * 1024);
  });

  it("rejects text longer than any real log", () => {
    expect(errorCode(() => parseLogText(" ".repeat(MAX_LOG_SIZE + 1)))).toBe("tooLarge");
    expect(errorCode(() => parseLogText(" ".repeat(MAX_LOG_SIZE)))).toBe("empty");
  });

  /** An mjai round of `draws` tsumogiri turns, then `doras` dora events and an exhaustive draw. */
  function mjaiRound(draws: number, doras = 0): string {
    const tehai = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"];
    const lines: object[] = [
      { type: "start_game", names: ["A", "B", "C", "D"] },
      {
        type: "start_kyoku",
        bakaze: "E",
        dora_marker: "1s",
        kyoku: 1,
        honba: 0,
        kyotaku: 0,
        oya: 0,
        scores: [25000, 25000, 25000, 25000],
        tehais: [tehai, tehai, tehai, tehai],
      },
    ];
    for (let turn = 0; turn < draws; turn++) {
      lines.push({ type: "tsumo", actor: turn % 4, pai: "9s" });
      lines.push({ type: "dahai", actor: turn % 4, pai: "9s", tsumogiri: true });
    }
    for (let dora = 0; dora < doras; dora++) {
      lines.push({ type: "dora", dora_marker: "2s" });
    }
    lines.push({ type: "ryukyoku", deltas: [0, 0, 0, 0] }, { type: "end_kyoku" });
    return lines.map((line) => JSON.stringify(line)).join("\n");
  }

  /** An mjlog round of `draws` tsumogiri turns. */
  function mjlogRound(draws: number): string {
    const hands = [0, 1, 2, 3]
      .map((seat) => `hai${seat}="${Array.from({ length: 13 }, (_, i) => i * 4 + seat).join(",")}"`)
      .join(" ");
    const turns = Array.from({ length: draws }, (_, turn) => {
      const seat = turn % 4;
      const id = 52 + (turn % 80);
      return `<${"TUVW"[seat]}${id}/><${"DEFG"[seat]}${id}/>`;
    }).join("");
    return `<mjloggm ver="2.3"><GO type="169"/><INIT seed="0,0,0,1,2,135" ten="250,250,250,250" oya="0" ${hands}/>${turns}<RYUUKYOKU ba="0,0" sc="250,0,250,0,250,0,250,0"/></mjloggm>`;
  }

  /** A tenhou.net/6 round in which every seat draws and throws `perSeat` tiles. */
  function tenhouRound(perSeat: number): string {
    const hand = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24];
    const seat = () => [hand, Array(perSeat).fill(39), Array(perSeat).fill(60)];
    const round = [
      [0, 0, 0],
      [25000, 25000, 25000, 25000],
      [31],
      [],
      ...seat(),
      ...seat(),
      ...seat(),
      ...seat(),
      ["流局", [0, 0, 0, 0]],
    ];
    return JSON.stringify({ name: ["A", "B", "C", "D"], rule: { disp: "般南喰赤" }, log: [round] });
  }

  it("rejects a round with more draws than a wall has, in every format", () => {
    expect(parseLogText(mjaiRound(MAX_ROUND_DRAWS)).rounds[0]?.events).toHaveLength(
      2 * MAX_ROUND_DRAWS + 1,
    );
    expect(errorCode(() => parseLogText(mjaiRound(MAX_ROUND_DRAWS + 1)))).toBe("invalid");
    expect(parseLogText(mjlogRound(68)).format).toBe("mjlog");
    expect(errorCode(() => parseLogText(mjlogRound(MAX_ROUND_DRAWS + 1)))).toBe("invalid");
    expect(parseLogText(tenhouRound(17)).format).toBe("tenhou-json");
    expect(errorCode(() => parseLogText(tenhouRound(20)))).toBe("invalid");
  });

  it("rejects a round with more events than any real game", () => {
    const doras = MAX_ROUND_EVENTS - 2 * 70 - 1;
    expect(parseLogText(mjaiRound(70, doras)).rounds[0]?.events).toHaveLength(MAX_ROUND_EVENTS);
    expect(errorCode(() => parseLogText(mjaiRound(70, doras + 1)))).toBe("invalid");
  });

  it("parses a 5000-turn round quickly before rejecting it", () => {
    const text = mjaiRound(5000);
    const start = performance.now();
    expect(errorCode(() => parseLogText(text))).toBe("invalid");
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("loadLog", () => {
  it("decompresses gzip input before detecting the format", async () => {
    const bytes = gzipSync(Buffer.from("not a log", "utf-8"));
    await expect(loadLog(new Uint8Array(bytes))).rejects.toMatchObject({ code: "unrecognized" });
  });

  it("reports corrupt gzip data", async () => {
    await expect(loadLog(new Uint8Array([0x1f, 0x8b, 0, 1, 2, 3]))).rejects.toMatchObject({
      code: "decompress",
    });
  });

  it("stops decompressing past the size limit", async () => {
    // About 16 KB of gzip that would expand to just over the limit.
    const bomb = gzipSync(Buffer.alloc(MAX_LOG_SIZE + 1, " "));
    expect(bomb.byteLength).toBeLessThan(64 * 1024);
    await expect(loadLog(new Uint8Array(bomb))).rejects.toMatchObject({ code: "tooLarge" });
    const atLimit = gzipSync(Buffer.alloc(MAX_LOG_SIZE, " "));
    await expect(loadLog(new Uint8Array(atLimit))).rejects.toMatchObject({ code: "empty" });
  });

  it("rejects input larger than the size limit before reading it", async () => {
    const bytes = new Uint8Array(MAX_LOG_SIZE + 1).fill(0x20);
    await expect(loadLog(bytes)).rejects.toMatchObject({ code: "tooLarge" });
    await expect(loadLog(bytes.buffer)).rejects.toMatchObject({ code: "tooLarge" });
    await expect(loadLog(" ".repeat(MAX_LOG_SIZE + 1))).rejects.toMatchObject({
      code: "tooLarge",
    });
  });
});
