import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadLog } from "../formats/index";
import { checkGame } from "../replay/check";
import {
  isSampleId,
  SAMPLE_IDS,
  SAMPLE_PLAYER_COUNTS,
  type SampleId,
  sampleUrl,
  WELCOME_SAMPLE,
} from "./samples";

const PUBLIC_DIR = new URL("../../public/", import.meta.url);

function readSample(id: SampleId): Uint8Array {
  return readFileSync(fileURLToPath(new URL(sampleUrl(id, ""), PUBLIC_DIR)));
}

describe("sample ids and URLs", () => {
  it("knows the bundled samples", () => {
    expect(SAMPLE_IDS).toEqual(["tenhou-json", "sanma"]);
    expect(isSampleId("tenhou-json")).toBe(true);
    expect(isSampleId("sanma")).toBe(true);
    expect(isSampleId("TENHOU-JSON")).toBe(false);
    expect(isSampleId("mjlog")).toBe(false);
    expect(isSampleId("toString")).toBe(false);
  });

  it("serves samples from the samples folder under the base URL", () => {
    expect(sampleUrl("tenhou-json", "./")).toBe("./samples/ranked_game.json");
    expect(sampleUrl("tenhou-json", "/mahjong-paifu-viewer/")).toBe(
      "/mahjong-paifu-viewer/samples/ranked_game.json",
    );
    expect(sampleUrl("sanma", "./")).toBe("./samples/sanma.json");
  });
});

describe("bundled sample files", () => {
  it.each(SAMPLE_IDS)("%s loads and replays without issues", async (id) => {
    const game = await loadLog(readSample(id));
    const names = game.playerCount === 3 ? ["A", "B", "C", ""] : ["A", "B", "C", "D"];
    expect(game.players.map((player) => player.name)).toEqual(names);
    expect(checkGame(game)).toEqual([]);
  });

  it.each(SAMPLE_IDS)("%s has the player count its button names", async (id) => {
    const game = await loadLog(readSample(id));
    expect(game.playerCount).toBe(SAMPLE_PLAYER_COUNTS[id]);
  });

  it("opens the four-player sample under the welcome card", () => {
    expect(SAMPLE_PLAYER_COUNTS[WELCOME_SAMPLE]).toBe(4);
  });

  it("keeps Tenhou log ids out of the samples", () => {
    for (const id of SAMPLE_IDS) {
      const text = new TextDecoder().decode(readSample(id));
      expect(text).not.toMatch(/\d{10}gm-[0-9a-f]{4}-\d{4,5}-[0-9a-f]{8}/);
      expect(text).not.toMatch(/"ref"/);
    }
  });

  it("has a three-player game with kita, pon, riichi, ron, tsumo and an exhaustive draw", async () => {
    const game = await loadLog(readSample("sanma"));
    expect(game.playerCount).toBe(3);
    expect(game.rules.description).toBe("三般東喰赤");
    const events = game.rounds.flatMap((round) => round.events);
    const types = new Set(events.map((event) => event.type));
    for (const type of ["kita", "pon", "riichiAccepted", "win", "ryukyoku"]) {
      expect(types, type).toContain(type);
    }
    const wins = events.filter((event) => event.type === "win");
    expect(wins.some((win) => win.seat === win.from)).toBe(true);
    expect(wins.some((win) => win.seat !== win.from)).toBe(true);
    expect(events.filter((event) => event.type === "ryukyoku").map((draw) => draw.reason)).toEqual([
      "exhaustive",
    ]);
    // Wins whose ドラ han include Norths set aside by the winner.
    const kitaDoraWins = game.rounds.filter((round) =>
      round.events.some(
        (event) =>
          event.type === "win" &&
          round.events.some((other) => other.type === "kita" && other.seat === event.seat),
      ),
    );
    expect(kitaDoraWins.length).toBeGreaterThan(0);
  });

  it("keeps the three-player sample's results, scored by hand under Tenhou's rules", async () => {
    // Worked out independently of the parsers and test writers, so a bug they share cannot hide.
    const game = await loadLog(readSample("sanma"));
    const summary = game.rounds.map((round) => ({
      round: [round.number, round.honba, round.riichiSticks],
      scores: round.scores,
      kita: round.events.filter((event) => event.type === "kita").length,
      results: round.events.flatMap((event): object[] => {
        if (event.type === "ryukyoku") {
          return [{ draw: event.reason, tenpai: event.tenpai, deltas: event.deltas }];
        }
        if (event.type === "win") {
          const { seat, from, han, fu, deltas } = event;
          return [{ seat, from, han, fu, deltas }];
        }
        return [];
      }),
    }));
    expect(summary).toEqual([
      {
        round: [1, 0, 0],
        scores: [35000, 35000, 35000, 0],
        kita: 2,
        results: [{ seat: 1, from: 1, han: 5, fu: undefined, deltas: [-4000, 7000, -2000, 0] }],
      },
      {
        round: [2, 0, 0],
        scores: [31000, 41000, 33000, 0],
        kita: 4,
        results: [{ draw: "exhaustive", tenpai: [0, 1], deltas: [1000, 1000, -2000, 0] }],
      },
      {
        round: [2, 1, 1],
        scores: [31000, 42000, 31000, 0],
        kita: 2,
        results: [{ seat: 0, from: 1, han: 3, fu: 30, deltas: [5100, -4100, 0, 0] }],
      },
      {
        round: [3, 0, 0],
        scores: [36100, 37900, 31000, 0],
        kita: 1,
        results: [{ seat: 2, from: 2, han: 4, fu: 25, deltas: [-3200, -3200, 7400, 0] }],
      },
      {
        round: [3, 1, 0],
        scores: [32900, 34700, 37400, 0],
        kita: 2,
        results: [{ seat: 1, from: 2, han: 5, fu: undefined, deltas: [0, 9200, -8200, 0] }],
      },
    ]);
    expect(game.finalScores).toEqual([32900, 42900, 29200, 0]);
  });

  it("is the same file as the tenhou.net/6 fixture of the ranked game", () => {
    const fixture = new URL(
      "../formats/tenhou-json/__fixtures__/convlog/ranked_game.json",
      import.meta.url,
    );
    expect(readSample("tenhou-json")).toEqual(readFileSync(fileURLToPath(fixture)));
  });
});
