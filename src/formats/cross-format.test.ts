/**
 * Cross-checks of the three parsers on the committed fixtures: the same game read from different
 * formats must give the same model, up to what the GameLog contract (src/core/model.ts) lets the
 * formats differ in. Fixtures only: no network, no external converter. No Tenhou game record is
 * committed, so the mjlog games are the tenhou.net/6 fixtures written as mjlog by the test encoder
 * (src/test/mjlog-serialize.ts).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GameLog, Quad, Round, RoundEvent } from "../core/model";
import { sortTiles, type Tile } from "../core/tile";
import { checkGame } from "../replay/check";
import { stripMjaiUnsupported, toMjaiJsonl } from "../test/mjai-serialize";
import { toMjlogXml } from "../test/mjlog-serialize";
import { parseMjai } from "./mjai/parse";
import { parseMjlog } from "./mjlog/parse";
import { parseTenhouJson } from "./tenhou-json/parse";

const FORMATS_DIR = fileURLToPath(new URL("./", import.meta.url));
const TENHOU_DIR = join(FORMATS_DIR, "tenhou-json", "__fixtures__", "convlog");
const MJAI_DIR = join(FORMATS_DIR, "mjai", "__fixtures__");

function list(dir: string, extension: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort();
}

const TENHOU_FIXTURES = list(TENHOU_DIR, ".json");
/** Hand-made samples of the mjai flavors (convlog, gimite/mjai, a log recorded from one seat). */
const MJAI_SAMPLE_FIXTURES = list(MJAI_DIR, ".jsonl");
/**
 * The tenhou.net/6 fixtures that can be written as mjlog: all but convlog's hand-edited
 * confusing_nakis_2, whose wall has four plain 5s although red fives are on.
 */
const MJLOG_SOURCES = TENHOU_FIXTURES.filter((name) => name !== "confusing_nakis_2.json");

function read(dir: string, name: string): string {
  return readFileSync(join(dir, name), "utf-8");
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

type Fixture = [label: string, load: () => GameLog];

const TENHOU_GAMES: Fixture[] = TENHOU_FIXTURES.map((name) => [
  `tenhou-json/${name}`,
  () => parseTenhouJson(read(TENHOU_DIR, name)),
]);
const MJLOG_GAMES: Fixture[] = MJLOG_SOURCES.map((name) => [
  `mjlog/${baseName(name)}.xml`,
  () => parseMjlog(toMjlogXml(parseTenhouJson(read(TENHOU_DIR, name)))),
]);
const MJAI_GAMES: Fixture[] = MJAI_SAMPLE_FIXTURES.map((name) => [
  `mjai/${name}`,
  () => parseMjai(read(MJAI_DIR, name)),
]);

/** Every file under `dir`, recursively, as paths relative to the repository root. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("fixture inventory", () => {
  it("finds every fixture", () => {
    expect(TENHOU_FIXTURES).toHaveLength(20);
    expect(MJLOG_SOURCES).toHaveLength(19);
    expect(MJAI_SAMPLE_FIXTURES).toEqual([
      "convlog-flavor.jsonl",
      "gimite-flavor.jsonl",
      "seat-view.jsonl",
    ]);
  });

  it("names the source of every folder of real games (CONTRIBUTING.md)", () => {
    expect(existsSync(join(TENHOU_DIR, "README.md")), TENHOU_DIR).toBe(true);
  });

  it("commits no mjlog game record: tests build their mjlog XML", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const files = [...filesUnder(join(root, "src")), ...filesUnder(join(root, "public"))];
    const records = files.filter(
      (path) => !/\.tsx?$/.test(path) && readFileSync(path).includes("<mjloggm"),
    );
    expect(records).toEqual([]);
  });
});

function sortedHands(round: Round): Quad<Tile[]> {
  return round.hands.map(sortTiles) as Quad<Tile[]>;
}

/**
 * The only differences the contract allows between the mjlog and the tenhou.net/6 log of one game,
 * normalized away:
 * - format, id and rules.description describe the source, not the game;
 * - Round.hands and WinEvent.hand keep the source order (mjlog: deal order, tenhou.net/6: sorted),
 *   so both are sorted;
 * - WinEvent.fu of a limit hand: mjlog records it, tenhou.net/6 does not, so it is dropped.
 */
function normalizeTenhouSource(game: GameLog): unknown {
  const { format: _format, id: _id, rules, rounds, ...rest } = game;
  const { description: _description, ...comparableRules } = rules;
  return {
    ...rest,
    rules: comparableRules,
    rounds: rounds.map((round) => ({
      ...round,
      hands: sortedHands(round),
      events: round.events.map((event): RoundEvent => {
        if (event.type !== "win") {
          return event;
        }
        const win = { ...event };
        if (win.hand) {
          win.hand = sortTiles(win.hand);
        }
        if (win.limit !== undefined) {
          delete win.fu;
        }
        return win;
      }),
    })),
  };
}

describe("the ranked game as tenhou.net/6 and written as mjlog", () => {
  // tenhou.net/6 -> model -> mjlog -> model.
  const tenhou = parseTenhouJson(read(TENHOU_DIR, "ranked_game.json"));
  const mjlog = parseMjlog(toMjlogXml(tenhou));

  it("give the same game", () => {
    expect(normalizeTenhouSource(mjlog)).toStrictEqual(normalizeTenhouSource(tenhou));
  });

  it("only differ where the contract allows it", () => {
    expect([mjlog.format, tenhou.format]).toEqual(["mjlog", "tenhou-json"]);
    // mjlog builds Tenhou's rule text from the GO type bits; tenhou.net/6 carries it.
    expect(mjlog.rules.description).toBe("特南喰赤");
    expect(tenhou.rules.description).toBe("特南喰赤");
    // The haneman of the last round: mjlog always states fu (the encoder writes 0 when the source
    // has none), tenhou.net/6 has none for limit hands.
    const mjlogWin = mjlog.rounds[2]?.events.at(-1);
    const tenhouWin = tenhou.rounds[2]?.events.at(-1);
    expect(mjlogWin).toMatchObject({ type: "win", limit: "haneman", fu: 0 });
    expect(tenhouWin).toMatchObject({ type: "win", limit: "haneman" });
    expect(tenhouWin).not.toHaveProperty("fu");
  });
});

describe("parseMjai(toMjaiJsonl(game)) on the fixtures", () => {
  it.each([...MJLOG_GAMES, ...TENHOU_GAMES])("%s gives back what mjai carries", (_, load) => {
    const game = load();
    expect(parseMjai(toMjaiJsonl(game))).toStrictEqual(stripMjaiUnsupported(game));
  });
});

/** convlog's test data: edited by hand to test turn order, so some of the numbers do not add up. */
const CONFUSING_NAKIS_1 = {
  why: "the win deltas leave out the riichi deposit on the table",
  issues: [/^Win deltas add up to 0, but 1 riichi deposits \(1000 points\) were on the table$/],
};
const CONFUSING_NAKIS_2 = {
  why: "the win deltas do not pay the winner, and the wall has four plain 5s but red fives are on",
  issues: [
    /^The winner, seat 1, gains 0 points$/,
    /^Win deltas add up to 0, but 1 riichi deposits \(1000 points\) were on the table$/,
    /^Four plain 5s tiles in a game with red fives/,
  ],
};

/**
 * Fixtures whose data (not its parsing) is inconsistent, with every issue checkGame reports for
 * them. Everything else must replay without a single issue.
 */
const KNOWN_BAD: Record<string, { why: string; issues: RegExp[] }> = {
  "tenhou-json/confusing_nakis_1.json": CONFUSING_NAKIS_1,
  "mjlog/confusing_nakis_1.xml": CONFUSING_NAKIS_1,
  "tenhou-json/confusing_nakis_2.json": CONFUSING_NAKIS_2,
  "mjai/gimite-flavor.jsonl": {
    why: "a short hand-made sample of the gimite/mjai fields: its exhaustive draw is after 3 draws",
    issues: [/^Exhaustive draw with 67 tiles left in the wall$/],
  },
};

const ALL_GAMES: Fixture[] = [...MJLOG_GAMES, ...TENHOU_GAMES, ...MJAI_GAMES];

describe("checkGame on every fixture", () => {
  it("lists only existing fixtures as known bad", () => {
    const labels = ALL_GAMES.map(([label]) => label);
    for (const label of Object.keys(KNOWN_BAD)) {
      expect(labels).toContain(label);
    }
  });

  it.each(ALL_GAMES.filter(([label]) => !(label in KNOWN_BAD)))("%s replays cleanly", (_, load) => {
    expect(checkGame(load())).toEqual([]);
  });

  it.each(ALL_GAMES.filter(([label]) => label in KNOWN_BAD))(
    "%s reports exactly its known issues",
    (label, load) => {
      const { why, issues: expected } = KNOWN_BAD[label] as (typeof KNOWN_BAD)[string];
      const messages = checkGame(load()).map((issue) => issue.message);
      for (const pattern of expected) {
        expect(
          messages.filter((message) => pattern.test(message)),
          why,
        ).toHaveLength(1);
      }
      expect(messages, why).toHaveLength(expected.length);
    },
  );
});

// Real games kept outside the repository (see the corpus block in mjlog/parse.test.ts).
const CORPUS_DIR = process.env.MJLOG_CORPUS_DIR;
const CORPUS_FILES = CORPUS_DIR && existsSync(CORPUS_DIR) ? list(CORPUS_DIR, ".xml") : [];

describe.skipIf(CORPUS_FILES.length === 0)("mjai round trip of the MJLOG_CORPUS_DIR games", () => {
  it.each(CORPUS_FILES)("%s gives back what mjai carries", (name) => {
    const game = parseMjlog(read(CORPUS_DIR as string, name));
    expect(parseMjai(toMjaiJsonl(game))).toStrictEqual(stripMjaiUnsupported(game));
  });
});
