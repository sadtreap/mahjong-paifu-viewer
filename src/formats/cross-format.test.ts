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
import type { CallEvent, GameLog, Quad, Round, RoundEvent } from "../core/model";
import { sortTiles, type Tile } from "../core/tile";
import { checkGame } from "../replay/check";
import {
  corpusFiles,
  MJLOG_CORPUS,
  SANMA_MJLOG_CORPUS,
  SANMA_TENHOU_JSON_CORPUS,
} from "../test/corpus";
import { stripMjaiUnsupported, toMjaiJsonl } from "../test/mjai-serialize";
import { stripMjlogUnsupported, toMjlogXml } from "../test/mjlog-serialize";
import { sanmaCrossFormatGame } from "../test/sanma-game";
import { stripTenhouJsonUnsupported, toTenhouJson } from "../test/tenhou-json-serialize";
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
 * - WinEvent.fu of a limit hand: mjlog records it, tenhou.net/6 does not, so it is dropped;
 * - RyukyokuEvent.hands: mjlog records the hands shown at a draw, tenhou.net/6 does not.
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
        if (event.type === "ryukyoku") {
          const { hands: _hands, ...draw } = event;
          return draw;
        }
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

/** The sanma game of src/test/sanma-game.ts in all three formats, mjai in both of its shapes. */
describe("a three-player game in every format", () => {
  const game = sanmaCrossFormatGame();
  const tenhou = parseTenhouJson(toTenhouJson(game));
  const mjlog = parseMjlog(toMjlogXml(game));
  // Four seat slots with an empty fourth (mjai-reviewer3p's convlog) and three (Akagi).
  const mjaiFourSlots = toMjaiJsonl(game);
  const mjaiThreeSlots = toMjaiJsonl(game, { sanma: "akagi" });

  it("is consistent and has every three-player event and result", () => {
    expect(checkGame(game)).toEqual([]);
    const events = game.rounds.flatMap((round) => round.events);
    const count = (predicate: (event: RoundEvent, index: number, all: RoundEvent[]) => boolean) =>
      game.rounds.reduce(
        (sum, round) =>
          sum + round.events.filter((event, index) => predicate(event, index, round.events)).length,
        0,
      );
    const previous = (all: RoundEvent[], index: number) => all[index - 1];
    const drawnBefore = (all: RoundEvent[], index: number) => {
      const event = previous(all, index);
      return event?.type === "draw" ? event.tile : undefined;
    };
    // Kita of the tile just drawn, of a North from the hand, and two in a row.
    expect(count((e, i, all) => e.type === "kita" && drawnBefore(all, i) === "4z")).toBeGreaterThan(
      0,
    );
    expect(
      count((e, i, all) => e.type === "kita" && !["4z", undefined].includes(drawnBefore(all, i))),
    ).toBeGreaterThan(0);
    expect(count((e, i, all) => e.type === "kita" && all[i - 2]?.type === "kita")).toBeGreaterThan(
      0,
    );
    // Pons from the right (seat 0 from seat 1) and from across the empty chair (seat 0 from seat 2).
    const pons = events.filter((event): event is CallEvent => event.type === "pon");
    expect(pons.map((event) => [event.seat, event.from])).toEqual(
      expect.arrayContaining([
        [0, 1],
        [0, 2],
      ]),
    );
    for (const type of ["ankan", "kakan", "riichiAccepted"] as const) {
      expect(
        events.some((event) => event.type === type),
        type,
      ).toBe(true);
    }
    const wins = events.filter((event) => event.type === "win");
    expect(wins.some((win) => win.seat !== win.from)).toBe(true);
    expect(wins.some((win) => win.seat === win.from)).toBe(true);
    // A ron on a set-aside North and a rinshan tsumo on a kita's replacement draw.
    expect(
      count(
        (e, i, all) => e.type === "win" && e.seat !== e.from && previous(all, i)?.type === "kita",
      ),
    ).toBe(1);
    expect(
      count((e, i, all) => e.type === "win" && e.seat === e.from && all[i - 2]?.type === "kita"),
    ).toBe(1);
    const draws = events.filter((event) => event.type === "ryukyoku");
    expect(draws.map((draw) => [draw.reason, draw.tenpai])).toEqual([
      ["exhaustive", [2]],
      ["exhaustive", [0, 2]],
      ["kyuushuKyuuhai", undefined],
    ]);
  });

  it("comes back from each format as its strip function says", () => {
    expect(tenhou).toStrictEqual(stripTenhouJsonUnsupported(game));
    expect(mjlog).toStrictEqual(stripMjlogUnsupported(game));
    expect(parseMjai(mjaiFourSlots)).toStrictEqual(stripMjaiUnsupported(game));
    expect(parseMjai(mjaiThreeSlots)).toStrictEqual(stripMjaiUnsupported(game));
  });

  it("writes mjai with four seat slots or three", () => {
    const [fourSlots, threeSlots] = [mjaiFourSlots, mjaiThreeSlots].map(
      (text) => JSON.parse(text.split("\n")[0] as string) as { names: string[] },
    );
    expect(fourSlots?.names).toEqual(["A", "B", "C", ""]);
    expect(threeSlots?.names).toEqual(["A", "B", "C"]);
    expect(mjaiFourSlots).toContain('"type":"nukidora"');
    expect(mjaiThreeSlots).toContain('"type":"kita"');
  });

  it("gives the same game from tenhou.net/6 and from mjlog", () => {
    expect(normalizeTenhouSource(mjlog)).toStrictEqual(normalizeTenhouSource(tenhou));
    expect([tenhou.playerCount, mjlog.playerCount]).toEqual([3, 3]);
    expect([tenhou.rules.description, mjlog.rules.description]).toEqual([
      "三般東喰赤",
      "三般東喰赤",
    ]);
  });

  it("gives the same game from mjai, in both shapes, as the Tenhou formats minus what mjai lacks", () => {
    // Starting hands keep the source's order (the model allows it), so they are compared sorted.
    const sorted = (log: GameLog): GameLog => ({
      ...log,
      rounds: log.rounds.map((round) => ({ ...round, hands: sortedHands(round) })),
    });
    for (const text of [mjaiFourSlots, mjaiThreeSlots]) {
      const mjai = sorted(parseMjai(text));
      expect(mjai).toStrictEqual(sorted(stripMjaiUnsupported(tenhou)));
      expect(mjai).toStrictEqual(sorted(stripMjaiUnsupported(mjlog)));
    }
  });

  it("converts between the formats without a loss beyond each format's own", () => {
    // tenhou.net/6 -> mjlog and mjlog -> tenhou.net/6.
    expect(parseMjlog(toMjlogXml(tenhou))).toStrictEqual(stripMjlogUnsupported(tenhou));
    expect(parseTenhouJson(toTenhouJson(mjlog))).toStrictEqual(stripTenhouJsonUnsupported(mjlog));
    expect(normalizeTenhouSource(parseTenhouJson(toTenhouJson(mjlog)))).toStrictEqual(
      normalizeTenhouSource(tenhou),
    );
  });

  it("replays cleanly from every format", () => {
    for (const parsed of [tenhou, mjlog, parseMjai(mjaiFourSlots), parseMjai(mjaiThreeSlots)]) {
      expect(checkGame(parsed), parsed.format).toEqual([]);
    }
  });
});

describe("the three-player sample of the live site in every format", () => {
  const path = fileURLToPath(new URL("../../public/samples/sanma.json", import.meta.url));
  const text = readFileSync(path, "utf-8");
  const game = parseTenhouJson(text);

  it("is exactly what toTenhouJson writes for it, in Tenhou's layout", () => {
    expect(`${toTenhouJson(game)}\n`).toBe(text);
    expect(game.playerCount).toBe(3);
  });

  it("gives the same game as mjlog and back what mjai carries, in both shapes", () => {
    const mjlog = parseMjlog(toMjlogXml(game));
    expect(mjlog).toStrictEqual(stripMjlogUnsupported(game));
    expect(normalizeTenhouSource(mjlog)).toStrictEqual(normalizeTenhouSource(game));
    expect(parseMjai(toMjaiJsonl(game))).toStrictEqual(stripMjaiUnsupported(game));
    expect(parseMjai(toMjaiJsonl(game, { sanma: "akagi" }))).toStrictEqual(
      stripMjaiUnsupported(game),
    );
    expect(checkGame(mjlog)).toEqual([]);
  });
});

// Real games kept outside the repository (src/test/corpus.ts).
const MJLOG_CORPUS_FILES = [
  ...corpusFiles(MJLOG_CORPUS, ".xml"),
  ...corpusFiles(SANMA_MJLOG_CORPUS, ".xml"),
];

describe.skipIf(MJLOG_CORPUS_FILES.length === 0)(
  "the mjlog corpus games in the other formats",
  () => {
    const load = (path: string) => parseMjlog(readFileSync(path, "utf-8"));

    it.each(MJLOG_CORPUS_FILES)("%s gives back what mjai carries", (_, path) => {
      const game = load(path);
      expect(parseMjai(toMjaiJsonl(game))).toStrictEqual(stripMjaiUnsupported(game));
    });

    it.each(MJLOG_CORPUS_FILES)("%s gives the same game as tenhou.net/6", (_, path) => {
      const game = load(path);
      const tenhou = parseTenhouJson(toTenhouJson(game));
      expect(tenhou).toStrictEqual(stripTenhouJsonUnsupported(game));
      expect(normalizeTenhouSource(tenhou)).toStrictEqual(normalizeTenhouSource(game));
    });
  },
);

const SANMA_TENHOU_FILES = corpusFiles(SANMA_TENHOU_JSON_CORPUS, ".json");

describe.skipIf(SANMA_TENHOU_FILES.length === 0)(
  "the three-player tenhou.net/6 corpus games in the other formats",
  () => {
    const load = (path: string) => parseTenhouJson(readFileSync(path, "utf-8"));

    it.each(SANMA_TENHOU_FILES)("%s gives back what mjlog carries", (_, path) => {
      const game = load(path);
      expect(parseMjlog(toMjlogXml(game))).toStrictEqual(stripMjlogUnsupported(game));
    });

    it.each(SANMA_TENHOU_FILES)("%s gives back what mjai carries, in both shapes", (_, path) => {
      const game = load(path);
      expect(parseMjai(toMjaiJsonl(game))).toStrictEqual(stripMjaiUnsupported(game));
      expect(parseMjai(toMjaiJsonl(game, { sanma: "akagi" }))).toStrictEqual(
        stripMjaiUnsupported(game),
      );
    });
  },
);
