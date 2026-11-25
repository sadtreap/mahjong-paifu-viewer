import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadLog } from "../formats/index";
import { checkGame } from "../replay/check";
import { isSampleId, parseSampleQuery, SAMPLE_IDS, type SampleId, sampleUrl } from "./samples";

const PUBLIC_DIR = new URL("../../public/", import.meta.url);

function readSample(id: SampleId): Uint8Array {
  return readFileSync(fileURLToPath(new URL(sampleUrl(id, ""), PUBLIC_DIR)));
}

describe("sample ids and URLs", () => {
  it("knows the bundled samples", () => {
    expect(SAMPLE_IDS).toEqual(["tenhou-json"]);
    expect(isSampleId("tenhou-json")).toBe(true);
    expect(isSampleId("TENHOU-JSON")).toBe(false);
    expect(isSampleId("mjlog")).toBe(false);
    expect(isSampleId("toString")).toBe(false);
  });

  it("serves samples from the samples folder under the base URL", () => {
    expect(sampleUrl("tenhou-json", "./")).toBe("./samples/ranked_game.json");
    expect(sampleUrl("tenhou-json", "/mahjong-paifu-viewer/")).toBe(
      "/mahjong-paifu-viewer/samples/ranked_game.json",
    );
  });
});

describe("parseSampleQuery", () => {
  it("needs a known sample id", () => {
    expect(parseSampleQuery("")).toBeNull();
    expect(parseSampleQuery("?round=2")).toBeNull();
    expect(parseSampleQuery("?sample=")).toBeNull();
    expect(parseSampleQuery("?sample=unknown&round=2")).toBeNull();
  });

  it("opens at the first step by default", () => {
    expect(parseSampleQuery("?sample=tenhou-json")).toEqual({
      id: "tenhou-json",
      start: { round: 0, step: 0 },
    });
  });

  it("turns the 1-based round and step into indexes", () => {
    expect(parseSampleQuery("?sample=tenhou-json&round=3&step=12")).toEqual({
      id: "tenhou-json",
      start: { round: 2, step: 11 },
    });
    expect(parseSampleQuery("step=5&sample=tenhou-json")?.start).toEqual({ round: 0, step: 4 });
  });

  it("keeps out-of-range numbers for clamping and ignores values that are not whole numbers", () => {
    expect(parseSampleQuery("?sample=tenhou-json&round=0&step=999")?.start).toEqual({
      round: -1,
      step: 998,
    });
    expect(parseSampleQuery("?sample=tenhou-json&round=-2&step=+3")?.start).toEqual({
      round: -3,
      step: 2,
    });
    for (const value of ["", "abc", "1.5", "2x", "1e3", "0x10", "99999999999"]) {
      expect(parseSampleQuery(`?sample=tenhou-json&round=${value}&step=${value}`)?.start).toEqual({
        round: 0,
        step: 0,
      });
    }
  });
});

describe("bundled sample files", () => {
  it.each(SAMPLE_IDS)("%s loads and replays without issues", async (id) => {
    const game = await loadLog(readSample(id));
    expect(game.players.map((player) => player.name)).toEqual(["A", "B", "C", "D"]);
    expect(checkGame(game)).toEqual([]);
  });

  it("keeps Tenhou log ids out of the samples", () => {
    for (const id of SAMPLE_IDS) {
      const text = new TextDecoder().decode(readSample(id));
      expect(text).not.toMatch(/\d{10}gm-[0-9a-f]{4}-\d{4,5}-[0-9a-f]{8}/);
      expect(text).not.toMatch(/"ref"/);
    }
  });

  it("is the same file as the tenhou.net/6 fixture of the ranked game", () => {
    const fixture = new URL(
      "../formats/tenhou-json/__fixtures__/convlog/ranked_game.json",
      import.meta.url,
    );
    expect(readSample("tenhou-json")).toEqual(readFileSync(fileURLToPath(fixture)));
  });
});
