/**
 * Test-only GameLog -> Tenhou mjlog XML encoder, written from the mjlog format as
 * src/formats/mjlog/parse.ts reads it and as Tenhou writes it. It lets the mjlog parser be tested
 * on whole games without committing Tenhou's game records: parseMjlog(toMjlogXml(game)) gives back
 * stripMjlogUnsupported(game).
 *
 * The output looks like Tenhou's: one line, Tenhou's tags in Tenhou's order, its attribute order,
 * and a space before "/>" exactly on the tags where Tenhou writes one (N, DORA, AGARI, RYUUKYOKU).
 * Round events are written in model order; REACH step 1 goes right before the declaration discard.
 *
 * Tile ids: the model keeps tile kinds and red fives, not which of the four copies a tile is. Each
 * round hands out ids as tiles appear (dealt, drawn, revealed as a dora or ura indicator): the
 * lowest free copy of the kind, where copy 0 of a five is the red five when the game has red fives.
 * An id then stays with its physical tile through hands, discards and calls, so discards, melds
 * (`m`, with Tenhou's exact bit layout for chi, pon, kakan, daiminkan and ankan from every seat) and
 * AGARI/RYUUKYOKU hands name the same copies, and a discard of the tile just drawn has its id (which
 * is how parseMjlog tells tsumogiri).
 *
 * What the model does not keep is written as Tenhou would write it, or as a fixed value:
 * - no SHUFFLE (the wall seed), no BYE; GO lobby 0 and bit 0x01 (human players); rules the model
 *   leaves unknown as Tenhou's defaults: general room, east-only, open tanyao, not fast;
 * - UN: names URL-encoded byte by byte like Tenhou; sx "M"; dan and rate only when all four players
 *   have them; rate with two decimals; INIT dice 0,0; TAIKYOKU oya 0;
 * - AGARI: ba (honba, then the deposits, which only the first winner of a multiple ron collects),
 *   the winner's melds in m, doraHai, and "53,0" (ura dora worth 0 han) after the yaku of a riichi
 *   winner without ura dora; a limit hand without fu gets fu 0;
 * - owari: the final points with Tenhou's ranked-game result to one decimal (see tenhouUma);
 * - RYUUKYOKU hands the model does not record are the ones Tenhou shows, taken from the replay: the
 *   tenpai hands of an exhaustive draw or nagashi mangan and the declarer's at kyuushu kyuuhai.
 *
 * Throws on what mjlog cannot express or the replay contradicts: unknown tiles, more than one
 * starting dora indicator, more copies of a tile than the game has, a call of a tile that was not
 * just discarded, a tsumogiri discard that is not the tile just drawn, a win without points or
 * yaku, yaku without a Tenhou id, a ryuukyoku of unknown reason, points that are not whole hundreds.
 */
import type {
  CallEvent,
  GameLog,
  GameRules,
  LimitName,
  PlayerInfo,
  Quad,
  Round,
  RoundEvent,
  RyukyokuEvent,
  RyukyokuReason,
  Seat,
  WinEvent,
  YakuEntry,
} from "../core/model";
import { isKnownTile, isRedFive, sortTiles, type Tile, tileKind } from "../core/tile";
import { type YakuKey, yakuKeyFromTenhouId } from "../core/yaku";
import { tileFromId } from "../formats/mjlog/meld";
import { TENHOU_DAN_LABELS, type TenhouRules, tenhouRuleText } from "../formats/tenhou-labels";

const ROOM_BITS: Record<NonNullable<GameRules["room"]>, number> = {
  general: 0,
  special: 0x20,
  upper: 0x80,
  phoenix: 0xa0,
};

const LIMIT_INDEX: Record<LimitName, number> = {
  mangan: 1,
  haneman: 2,
  baiman: 3,
  sanbaiman: 4,
  yakuman: 5,
};

/** RYUUKYOKU `type` per reason; an exhaustive draw has none. */
const RYUUKYOKU_TYPES: Record<Exclude<RyukyokuReason, "unknown">, string | undefined> = {
  exhaustive: undefined,
  nagashiMangan: "nm",
  kyuushuKyuuhai: "yao9",
  suufonRenda: "kaze4",
  suuchaRiichi: "reach4",
  suukaikan: "kan4",
  sanchaHou: "ron3",
};

/** Tenhou's yaku ids (mjlog `yaku` and `yakuman`) by key: the inverse of yakuKeyFromTenhouId. */
const YAKU_IDS = new Map<YakuKey, number>();
for (let id = 0; yakuKeyFromTenhouId(id) !== undefined; id++) {
  YAKU_IDS.set(yakuKeyFromTenhouId(id) as YakuKey, id);
}
const URA_DORA_ID = YAKU_IDS.get("uraDora") as number;

/** The 0-based rank of each seat by points, ties going to the lower seat, as Tenhou ranks them. */
function ranks(points: Quad<number>): Quad<number> {
  const order = [0, 1, 2, 3].sort((a, b) => (points[b] as number) - (points[a] as number) || a - b);
  return [0, 1, 2, 3].map((seat) => order.indexOf(seat)) as Quad<number>;
}

/**
 * Tenhou's ranked-game result per seat, as the `owari` text it writes ("-17.4"): (points - 30000) /
 * 1000 plus the uma (+10, -10, -20 for 2nd to 4th); the top player gets what makes the four add up
 * to 0 (oka and +20 uma included). Computed in tenths, so there is no float rounding.
 */
export function tenhouUma(points: Quad<number>): Quad<string> {
  const rank = ranks(points);
  const uma = [0, 100, -100, -200];
  const tenths = [0, 0, 0, 0];
  let others = 0;
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    if (rank[seat] !== 0) {
      tenths[seat] = ((points[seat] as number) - 30000) / 100 + (uma[rank[seat]] as number);
      others += tenths[seat] as number;
    }
  }
  tenths[rank.indexOf(0)] = -others;
  return tenths.map((value) => (value / 10).toFixed(1)) as Quad<string>;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Attributes = Array<[string, string | number | undefined]>;

/** `<NAME a="1" b="2"/>`, or with a space before "/>" when `spaced`. Undefined values are left out. */
function tag(name: string, attributes: Attributes = [], spaced = false): string {
  const text = attributes
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}="${escapeAttribute(String(value))}"`)
    .join("");
  return `<${name}${text}${spaced ? " " : ""}/>`;
}

/** `<N who="1" m="44137" />`, with the space before "/>" that Tenhou writes on N tags. */
function meldTag(seat: Seat, m: number): string {
  return tag(
    "N",
    [
      ["who", seat],
      ["m", m],
    ],
    true,
  );
}

/** Tenhou's name encoding: every UTF-8 byte as %XX, ASCII included. */
function encodeName(name: string): string {
  return [...new TextEncoder().encode(name)]
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");
}

/** The GO `type` bits for these rules (see parse.ts). */
export function goType(rules: GameRules): number {
  let type = 0x01 | ROOM_BITS[rules.room ?? "general"];
  if (!rules.redFives) type |= 0x02;
  if (rules.openTanyao === false) type |= 0x04;
  if (rules.length === "south") type |= 0x08;
  if (rules.fast) type |= 0x40;
  return type;
}

function hasDan(player: PlayerInfo): boolean {
  return player.danIndex !== undefined && TENHOU_DAN_LABELS[player.danIndex] !== undefined;
}

function unTag(players: Quad<PlayerInfo>): string {
  const attributes: Attributes = players.map((player, seat): [string, string] => [
    `n${seat}`,
    encodeName(player.name),
  ]);
  attributes.push([
    "dan",
    players.every(hasDan) ? players.map((p) => p.danIndex).join(",") : undefined,
  ]);
  const rated = players.every((player) => player.rating !== undefined);
  attributes.push(["rate", rated ? players.map((p) => p.rating?.toFixed(2)).join(",") : undefined]);
  attributes.push(["sx", "M,M,M,M"]);
  return tag("UN", attributes);
}

/** Points in Tenhou's hundreds. */
function hundreds(points: number, what: string): number {
  const value = points / 100;
  if (!Number.isInteger(value)) {
    throw new Error(`toMjlogXml: ${what} (${points}) is not a whole number of hundreds`);
  }
  return value;
}

function isFiveKind(kind: number): boolean {
  return kind < 27 && kind % 9 === 4;
}

/** A meld written so far, kept for AGARI `m` and to turn a pon into a kakan. */
interface WrittenMeld {
  type: "chi" | "pon" | "daiminkan" | "ankan" | "kakan";
  m: number;
  kind: number;
  /** Copy left out of a pon (the copy a kakan adds). */
  unused?: number;
}

/** The tile others can win on: the last discard, kakan tile or ankan. */
interface Offer {
  seat: Seat;
  ids: number[];
  discard: boolean;
}

interface GameContext {
  redFives: boolean;
  /** Owari attribute for the game's last result tag, if the game has final scores. */
  owari?: string;
  /** The round and event index of the game's last result. */
  lastResult?: [number, number];
}

class RoundWriter {
  private readonly tags: string[] = [];
  private readonly used = new Set<number>();
  private readonly hands: Quad<number[]> = [[], [], [], []];
  private readonly melds: Quad<WrittenMeld[]> = [[], [], [], []];
  private readonly lastDraw: Array<number | null> = [null, null, null, null];
  private offer: Offer | null = null;
  private readonly doraIds: number[] = [];
  private readonly uraIds: number[] = [];
  private readonly scores: number[];
  private sticks: number;
  private wins = 0;
  private where = "";
  private readonly round: Round;
  private readonly roundIndex: number;
  private readonly game: GameContext;

  constructor(round: Round, roundIndex: number, game: GameContext) {
    this.round = round;
    this.roundIndex = roundIndex;
    this.game = game;
    this.scores = [...round.scores];
    this.sticks = round.riichiSticks;
  }

  write(): string[] {
    this.where = `round ${this.roundIndex}`;
    this.writeInit();
    this.round.events.forEach((event, index) => {
      this.where = `round ${this.roundIndex} event ${index}`;
      this.writeEvent(event, index);
    });
    return this.tags;
  }

  private fail(message: string): never {
    throw new Error(`toMjlogXml: ${this.where}: ${message}`);
  }

  private tileOf(id: number): Tile {
    return tileFromId(id, this.game.redFives);
  }

  /** Hands out the lowest free id for a tile that appears for the first time. */
  private allocate(tile: Tile, what: string): number {
    if (!isKnownTile(tile)) {
      return this.fail(`mjlog cannot record the unknown tile of ${what}`);
    }
    if (isRedFive(tile) && !this.game.redFives) {
      return this.fail(`${what} is a red five in a game without red fives`);
    }
    const kind = tileKind(tile);
    let copies = [0, 1, 2, 3];
    if (this.game.redFives && isFiveKind(kind)) {
      copies = isRedFive(tile) ? [0] : [1, 2, 3];
    }
    for (const copy of copies) {
      const id = kind * 4 + copy;
      if (!this.used.has(id)) {
        this.used.add(id);
        return id;
      }
    }
    return this.fail(`no ${tile} is left for ${what}: the round shows too many of them`);
  }

  /** Takes a tile from a seat's hand, preferring the lowest id and never `avoid`. */
  private take(seat: Seat, tile: Tile, what: string, avoid: number | null = null): number {
    const hand = this.hands[seat];
    let best: number | undefined;
    for (const id of hand) {
      if (id !== avoid && this.tileOf(id) === tile && (best === undefined || id < best)) {
        best = id;
      }
    }
    if (best === undefined) {
      return this.fail(`seat ${seat} has no ${tile} for ${what}`);
    }
    hand.splice(hand.indexOf(best), 1);
    return best;
  }

  private writeInit(): void {
    const round = this.round;
    if (round.doraIndicators.length !== 1) {
      this.fail(
        `INIT has one dora indicator, the round starts with ${round.doraIndicators.length}`,
      );
    }
    const index = round.wind * 4 + round.number - 1;
    if (!Number.isInteger(index) || index < 0 || index > 15) {
      this.fail(`no INIT seed for wind ${round.wind} round ${round.number}`);
    }
    round.hands.forEach((hand, seat) => {
      if (hand.length !== 13) {
        this.fail(`seat ${seat} starts with ${hand.length} tiles instead of 13`);
      }
      this.hands[seat as Seat] = hand.map((tile) => this.allocate(tile, `seat ${seat}'s deal`));
    });
    const indicator = this.allocate(round.doraIndicators[0] as Tile, "the dora indicator");
    this.doraIds.push(indicator);
    const seed = [index, round.honba, round.riichiSticks, 0, 0, indicator];
    const attributes: Attributes = [
      ["seed", seed.join(",")],
      ["ten", round.scores.map((points) => hundreds(points, "a start score")).join(",")],
      ["oya", round.dealer],
    ];
    this.hands.forEach((hand, seat) => {
      attributes.push([`hai${seat}`, hand.join(",")]);
    });
    this.tags.push(tag("INIT", attributes));
  }

  private writeEvent(event: RoundEvent, index: number): void {
    switch (event.type) {
      case "draw": {
        const id = this.allocate(event.tile, `seat ${event.seat}'s draw`);
        this.hands[event.seat].push(id);
        this.lastDraw[event.seat] = id;
        this.tags.push(tag(`${"TUVW"[event.seat]}${id}`));
        return;
      }
      case "discard": {
        const seat = event.seat;
        if (event.riichi) {
          this.tags.push(
            tag("REACH", [
              ["who", seat],
              ["step", 1],
            ]),
          );
        }
        const drawn = this.lastDraw[seat] ?? null;
        let id: number;
        if (event.tsumogiri) {
          if (drawn === null || this.tileOf(drawn) !== event.tile) {
            this.fail(`the tsumogiri discard ${event.tile} is not the tile just drawn`);
          }
          id = drawn;
          this.hands[seat].splice(this.hands[seat].indexOf(drawn), 1);
        } else {
          id = this.take(seat, event.tile, "a discard from the hand", drawn);
        }
        this.lastDraw[seat] = null;
        this.offer = { seat, ids: [id], discard: true };
        this.tags.push(tag(`${"DEFG"[seat]}${id}`));
        return;
      }
      case "chi":
      case "pon":
      case "daiminkan":
        this.writeCall(event);
        return;
      case "ankan": {
        const seat = event.seat;
        const ids = event.tiles.map((tile) => this.take(seat, tile, "an ankan"));
        const kind = (ids[0] as number) >> 2;
        if (ids.length !== 4 || ids.some((id) => id >> 2 !== kind)) {
          this.fail(`an ankan of ${event.tiles.join(",")} is not four tiles of one kind`);
        }
        const m = (kind * 4) << 8;
        this.melds[seat].push({ type: "ankan", m, kind });
        this.lastDraw[seat] = null;
        this.offer = { seat, ids, discard: false };
        this.tags.push(meldTag(seat, m));
        return;
      }
      case "kakan": {
        const seat = event.seat;
        const kind = tileKind(event.tile);
        const pon = this.melds[seat].find((meld) => meld.type === "pon" && meld.kind === kind);
        if (!pon) {
          this.fail(`kakan of ${event.tile} without a pon of it`);
        }
        const id = this.take(seat, event.tile, "a kakan");
        if (id !== kind * 4 + (pon.unused as number)) {
          this.fail(`kakan of ${event.tile}, but the pon left out another copy`);
        }
        pon.type = "kakan";
        pon.m = (pon.m & ~0x18) | 0x10;
        this.lastDraw[seat] = null;
        this.offer = { seat, ids: [id], discard: false };
        this.tags.push(meldTag(seat, pon.m));
        return;
      }
      case "riichiAccepted": {
        const seat = event.seat;
        this.scores[seat] = (this.scores[seat] as number) - 1000;
        this.sticks += 1;
        const ten = this.scores.map((points) => hundreds(points, "a score")).join(",");
        this.tags.push(
          tag("REACH", [
            ["who", seat],
            ["ten", ten],
            ["step", 2],
          ]),
        );
        return;
      }
      case "dora": {
        const id = this.allocate(event.indicator, "a kan dora indicator");
        this.doraIds.push(id);
        this.tags.push(tag("DORA", [["hai", id]], true));
        return;
      }
      case "win":
        this.tags.push(this.agari(event, index));
        return;
      case "ryukyoku":
        this.tags.push(this.ryuukyoku(event, index));
        return;
    }
  }

  private writeCall(event: CallEvent): void {
    const seat = event.seat;
    const offer = this.offer;
    const called = offer?.ids[0];
    if (!offer?.discard || called === undefined || offer.seat !== event.from) {
      this.fail(`${event.type} from seat ${event.from} does not follow a discard of it`);
    }
    if (this.tileOf(called) !== event.tile) {
      this.fail(`${event.type} of ${event.tile}, but ${this.tileOf(called)} was discarded`);
    }
    const relative = (event.from - seat + 4) % 4;
    if (relative === 0) {
      this.fail(`seat ${seat} calls its own discard`);
    }
    const consumed = event.consumed.map((tile) => this.take(seat, tile, `a ${event.type}`));
    const ids = [called, ...consumed].sort((a, b) => a - b);
    const kinds = ids.map((id) => id >> 2);
    const kind = kinds[0] as number;
    const index = ids.indexOf(called);
    let meld: WrittenMeld;
    if (event.type === "chi") {
      if (ids.length !== 3 || kind >= 27 || kind % 9 > 6 || kinds.some((k, i) => k !== kind + i)) {
        this.fail(`chi of ${event.tile} with ${event.consumed.join(",")} is not a run`);
      }
      const run = Math.floor(kind / 9) * 7 + (kind % 9);
      const copies = ids.map((id) => id & 3);
      const m =
        ((run * 3 + index) << 10) |
        ((copies[2] as number) << 7) |
        ((copies[1] as number) << 5) |
        ((copies[0] as number) << 3) |
        0x4 |
        relative;
      meld = { type: "chi", m, kind };
    } else {
      const size = event.type === "pon" ? 3 : 4;
      if (ids.length !== size || kinds.some((k) => k !== kind)) {
        this.fail(`${event.type} of ${event.tile} with ${event.consumed.join(",")}`);
      }
      if (event.type === "pon") {
        const unused = [0, 1, 2, 3].find((copy) => !ids.includes(kind * 4 + copy)) as number;
        const m = ((kind * 3 + index) << 9) | (unused << 5) | 0x8 | relative;
        meld = { type: "pon", m, kind, unused };
      } else {
        meld = { type: "daiminkan", m: (called << 8) | relative, kind };
      }
    }
    this.melds[seat].push(meld);
    this.lastDraw[seat] = null;
    this.offer = null;
    this.tags.push(meldTag(seat, meld.m));
  }

  /** `ba`, `sc` and `owari`, shared by AGARI and RYUUKYOKU. */
  private resultAttributes(deltas: Quad<number>, index: number): Record<string, string> {
    const ba = `${this.round.honba},${this.wins === 0 ? this.sticks : 0}`;
    const sc = this.scores
      .flatMap((points, seat) => [
        hundreds(points, "a score"),
        hundreds(deltas[seat as Seat], "a point change"),
      ])
      .join(",");
    this.scores.forEach((points, seat) => {
      this.scores[seat] = points + deltas[seat as Seat];
    });
    const [lastRound, lastEvent] = this.game.lastResult ?? [-1, -1];
    const last = lastRound === this.roundIndex && lastEvent === index;
    const result: Record<string, string> = { ba, sc };
    if (last && this.game.owari !== undefined) {
      result.owari = this.game.owari;
    }
    return result;
  }

  private sortedHand(seat: Seat): number[] {
    return [...this.hands[seat]].sort((a, b) => a - b);
  }

  private checkShown(seat: Seat, ids: number[], shown: readonly Tile[], what: string): void {
    const replayed = sortTiles(ids.map((id) => this.tileOf(id))).join();
    if (replayed !== sortTiles(shown).join()) {
      this.fail(`${what} of seat ${seat} is ${shown.join(",")}, the replay has ${replayed}`);
    }
  }

  private agari(event: WinEvent, index: number): string {
    const { seat, from } = event;
    let machi: number;
    let hai: number[];
    if (seat === from) {
      const drawn = this.lastDraw[seat];
      if (drawn === null || drawn === undefined) {
        return this.fail(`seat ${seat} wins by tsumo without a draw`);
      }
      machi = drawn;
      hai = this.sortedHand(seat);
    } else {
      const offer = this.offer;
      if (!offer || offer.seat !== from) {
        return this.fail(`ron off seat ${from}, which did not just discard or kan`);
      }
      const matching = offer.ids.find(
        (id) => event.tile === undefined || this.tileOf(id) === event.tile,
      );
      machi = matching ?? (offer.ids[0] as number);
      hai = [...this.hands[seat], machi].sort((a, b) => a - b);
    }
    if (event.tile !== undefined && this.tileOf(machi) !== event.tile) {
      this.fail(`the winning tile is ${event.tile}, the replay has ${this.tileOf(machi)}`);
    }
    if (event.hand) {
      this.checkShown(seat, hai, event.hand, "the winning hand");
    }
    if (event.points === undefined) {
      return this.fail("mjlog needs the points of every win");
    }
    const fu =
      event.fu ?? (event.limit ? 0 : this.fail("mjlog needs the fu of a win below mangan"));
    const ten = [fu, event.points, event.limit ? LIMIT_INDEX[event.limit] : 0].join(",");
    const { yaku, yakuman } = this.yaku(event.yaku);
    const ura = event.uraIndicators?.length ? event.uraIndicators : undefined;
    const uraIds = ura?.map((tile, i) => {
      const known = this.uraIds[i];
      if (known !== undefined && this.tileOf(known) === tile) {
        return known;
      }
      const id = this.allocate(tile, "an ura dora indicator");
      this.uraIds[i] = id;
      return id;
    });
    // Tenhou lists the winner's melds newest first.
    const melds = this.melds[seat].map((meld) => meld.m).reverse();
    const { ba, sc, owari } = this.resultAttributes(event.deltas, index);
    this.wins += 1;
    return tag(
      "AGARI",
      [
        ["ba", ba],
        ["hai", hai.join(",")],
        ["m", melds.length > 0 ? melds.join(",") : undefined],
        ["machi", machi],
        ["ten", ten],
        ["yaku", yaku],
        ["yakuman", yakuman],
        ["doraHai", this.doraIds.join(",")],
        ["doraHaiUra", uraIds?.join(",")],
        ["who", seat],
        ["fromWho", from],
        ["paoWho", event.pao],
        ["sc", sc],
        ["owari", owari],
      ],
      true,
    );
  }

  private yaku(entries: YakuEntry[] | undefined): { yaku?: string; yakuman?: string } {
    if (entries === undefined) {
      return this.fail("mjlog needs the yaku of every win");
    }
    const pairs: number[] = [];
    const yakuman: number[] = [];
    for (const entry of entries) {
      const id = entry.key === null ? undefined : YAKU_IDS.get(entry.key);
      if (id === undefined) {
        return this.fail(`Tenhou has no yaku id for ${entry.key ?? entry.raw}`);
      }
      if (entry.han <= 0) {
        continue;
      }
      if (entry.yakuman) {
        if (entry.han !== 13) {
          return this.fail(`a yakuman worth ${entry.han} han: Tenhou counts each yakuman once`);
        }
        yakuman.push(id);
      } else {
        pairs.push(id, entry.han);
      }
    }
    const riichi = entries.some((entry) => entry.key === "riichi" || entry.key === "doubleRiichi");
    const hasUra = pairs.some((value, i) => i % 2 === 0 && value === URA_DORA_ID);
    if (riichi && !hasUra) {
      // Tenhou lists ura dora with 0 han on every riichi win that has none.
      pairs.push(URA_DORA_ID, 0);
    }
    return {
      yaku: pairs.length > 0 ? pairs.join(",") : undefined,
      yakuman: yakuman.length > 0 ? yakuman.join(",") : undefined,
    };
  }

  private ryuukyoku(event: RyukyokuEvent, index: number): string {
    if (event.reason === "unknown") {
      return this.fail("mjlog has no ryuukyoku type for a draw of unknown reason");
    }
    const type = RYUUKYOKU_TYPES[event.reason];
    const shown: Array<number[] | null> = [null, null, null, null];
    if (event.hands) {
      event.hands.forEach((hand, seat) => {
        if (hand) {
          const ids = this.sortedHand(seat as Seat);
          this.checkShown(seat as Seat, ids, hand, "the hand shown at the draw");
          shown[seat] = ids;
        }
      });
    } else if (event.reason === "exhaustive" || event.reason === "nagashiMangan") {
      for (const seat of event.tenpai ?? []) {
        shown[seat] = this.sortedHand(seat);
      }
    } else if (event.reason === "kyuushuKyuuhai") {
      const declarer = this.round.events.slice(0, index).findLast((e) => e.type === "draw");
      if (declarer?.type === "draw") {
        shown[declarer.seat] = this.sortedHand(declarer.seat);
      }
    }
    const { ba, sc, owari } = this.resultAttributes(event.deltas, index);
    return tag(
      "RYUUKYOKU",
      [
        ["type", type],
        ["ba", ba],
        ["sc", sc],
        ...shown.map((ids, seat): [string, string | undefined] => [`hai${seat}`, ids?.join(",")]),
        ["owari", owari],
      ],
      true,
    );
  }
}

function isResult(event: RoundEvent | undefined): boolean {
  return event?.type === "win" || event?.type === "ryukyoku";
}

/** Encodes a four-player game as Tenhou mjlog XML (see the top of this file). */
export function toMjlogXml(game: GameLog): string {
  const lastRound = game.rounds.length - 1;
  const events = game.rounds[lastRound]?.events ?? [];
  const context: GameContext = { redFives: game.rules.redFives };
  if (isResult(events[events.length - 1])) {
    context.lastResult = [lastRound, events.length - 1];
    if (game.finalScores) {
      const uma = tenhouUma(game.finalScores);
      context.owari = game.finalScores
        .flatMap((points, seat) => [hundreds(points, "a final score"), uma[seat as Seat]])
        .join(",");
    }
  }
  const parts = [
    '<mjloggm ver="2.3">',
    tag("GO", [
      ["type", goType(game.rules)],
      ["lobby", 0],
    ]),
    unTag(game.players),
    tag("TAIKYOKU", [["oya", 0]]),
  ];
  game.rounds.forEach((round, index) => {
    parts.push(...new RoundWriter(round, index, context).write());
  });
  parts.push("</mjloggm>");
  return parts.join("");
}

/** Concealed tiles of each seat right before `end` (an index into round.events). */
function concealedBefore(round: Round, end: number): Quad<Tile[]> {
  const hands = round.hands.map((hand) => [...hand]) as Quad<Tile[]>;
  const remove = (seat: Seat, tile: Tile) => {
    const at = hands[seat].indexOf(tile);
    if (at >= 0) {
      hands[seat].splice(at, 1);
    }
  };
  for (const event of round.events.slice(0, end)) {
    switch (event.type) {
      case "draw":
        hands[event.seat].push(event.tile);
        break;
      case "discard":
      case "kakan":
        remove(event.seat, event.tile);
        break;
      case "chi":
      case "pon":
      case "daiminkan":
        for (const tile of event.consumed) remove(event.seat, tile);
        break;
      case "ankan":
        for (const tile of event.tiles) remove(event.seat, tile);
        break;
    }
  }
  return hands;
}

/** The tile a win is made on, as the replay has it: the drawn tile or the tile ronned. */
function winningTile(round: Round, index: number, win: WinEvent): Tile | undefined {
  const previous = round.events.slice(0, index).findLast((event) => event.type !== "win");
  if (win.seat === win.from) {
    const draw = round.events
      .slice(0, index)
      .findLast((e) => e.type === "draw" && e.seat === win.seat);
    return draw?.type === "draw" ? draw.tile : undefined;
  }
  switch (previous?.type) {
    case "discard":
    case "kakan":
      return previous.tile;
    case "ankan":
      return previous.tiles[0];
    default:
      return undefined;
  }
}

function stripYaku(entries: YakuEntry[]): YakuEntry[] {
  const known = entries.filter((entry) => entry.han > 0 && entry.key && YAKU_IDS.has(entry.key));
  return [
    ...known
      .filter((entry) => !entry.yakuman)
      .map((entry): YakuEntry => ({ key: entry.key, han: entry.han })),
    ...known
      .filter((entry) => entry.yakuman)
      .map((entry): YakuEntry => ({ key: entry.key, han: 13, yakuman: true })),
  ];
}

function stripRound(round: Round): Round {
  const events: RoundEvent[] = [];
  // Index in `events` of each seat's riichi declaration whose REACH step 2 is still to come.
  const declarations: Array<number | null> = [null, null, null, null];
  round.events.forEach((event, index) => {
    switch (event.type) {
      case "draw":
        events.push({ type: "draw", seat: event.seat, tile: event.tile });
        return;
      case "discard":
        if (event.riichi) {
          declarations[event.seat] = events.length;
        }
        events.push({
          type: "discard",
          seat: event.seat,
          tile: event.tile,
          tsumogiri: event.tsumogiri,
          riichi: event.riichi,
        });
        return;
      case "chi":
      case "pon":
      case "daiminkan":
        events.push({
          type: event.type,
          seat: event.seat,
          from: event.from,
          tile: event.tile,
          consumed: sortTiles(event.consumed),
        });
        return;
      case "ankan":
        events.push({ type: "ankan", seat: event.seat, tiles: sortTiles(event.tiles) });
        return;
      case "kakan":
        events.push({ type: "kakan", seat: event.seat, tile: event.tile });
        return;
      case "riichiAccepted": {
        // parseMjlog puts the stick right after the declaration, wherever REACH step 2 is logged.
        const declaration = declarations[event.seat] ?? null;
        declarations[event.seat] = null;
        const at = declaration === null ? events.length : declaration + 1;
        events.splice(at, 0, { type: "riichiAccepted", seat: event.seat });
        declarations.forEach((other, seat) => {
          if (other !== null && other >= at) {
            declarations[seat] = other + 1;
          }
        });
        return;
      }
      case "dora":
        events.push({ type: "dora", indicator: event.indicator });
        return;
      case "win": {
        const tile = event.tile ?? winningTile(round, index, event);
        let hand = event.hand;
        if (!hand) {
          hand = concealedBefore(round, index)[event.seat];
          if (event.seat !== event.from && tile !== undefined) {
            hand = [...hand, tile];
          }
        }
        const yaku = stripYaku(event.yaku ?? []);
        const win: WinEvent = {
          type: "win",
          seat: event.seat,
          from: event.from,
          deltas: [...event.deltas],
          hand: sortTiles(hand),
          han: yaku.reduce((sum, entry) => sum + entry.han, 0),
          fu: event.fu ?? 0,
          yaku,
        };
        if (tile !== undefined) {
          win.tile = tile;
        }
        if (event.points !== undefined) {
          win.points = event.points;
        }
        if (event.limit) {
          win.limit = event.limit;
        }
        if (event.uraIndicators?.length) {
          win.uraIndicators = [...event.uraIndicators];
        }
        if (event.pao !== undefined && event.pao !== event.seat && event.pao !== event.from) {
          win.pao = event.pao;
        }
        events.push(win);
        return;
      }
      case "ryukyoku": {
        let hands: Quad<Tile[] | null> = [null, null, null, null];
        if (event.hands) {
          hands = event.hands.map((hand) => (hand ? sortTiles(hand) : null)) as Quad<Tile[] | null>;
        } else {
          const concealed = concealedBefore(round, index);
          let seats: readonly Seat[] = [];
          if (event.reason === "exhaustive" || event.reason === "nagashiMangan") {
            seats = event.tenpai ?? [];
          } else if (event.reason === "kyuushuKyuuhai") {
            const draw = round.events.slice(0, index).findLast((e) => e.type === "draw");
            seats = draw?.type === "draw" ? [draw.seat] : [];
          }
          for (const seat of seats) {
            hands[seat] = sortTiles(concealed[seat]);
          }
        }
        const ryukyoku: RyukyokuEvent = {
          type: "ryukyoku",
          reason: event.reason,
          deltas: [...event.deltas],
          hands,
        };
        if (event.reason === "exhaustive" || event.reason === "nagashiMangan") {
          ryukyoku.tenpai = ([0, 1, 2, 3] as Seat[]).filter((seat) => hands[seat] !== null);
        }
        events.push(ryukyoku);
        return;
      }
    }
  });
  return {
    wind: round.wind,
    number: round.number,
    dealer: round.dealer,
    honba: round.honba,
    riichiSticks: round.riichiSticks,
    scores: [...round.scores],
    doraIndicators: [...round.doraIndicators],
    hands: round.hands.map((hand) => [...hand]) as Quad<Tile[]>,
    events,
  };
}

/**
 * What parseMjlog(toMjlogXml(game)) gives back: `game` without what mjlog cannot carry, and with
 * what mjlog states that the model may leave out. Changed:
 * - format is "mjlog" and there is no id (an mjlog file does not contain its log id);
 * - rules: GO states room, length, open tanyao and fast, so unknown ones come back as Tenhou's
 *   defaults (general room, east-only, open tanyao, not fast); description is Tenhou's rule text;
 * - players: UN has a dan index, not a label, so rank is Tenhou's label for danIndex; dan and rate
 *   are kept only when all four players have one; ratings are rounded to two decimals;
 * - riichiAccepted sits right after its declaration discard (parseMjlog places REACH step 2 there);
 * - chi/pon/daiminkan consumed tiles and ankan tiles are in tile order (melds list tiles by id);
 * - win: hand in tile order (AGARI hai is sorted by id); tile and hand filled in from the replay
 *   when missing; han is the sum of the yaku (mjlog has no han); yaku without han or a Tenhou id
 *   dropped (toMjlogXml throws on the latter), yakuman after the other yaku, raw text dropped; a limit
 *   hand without fu gets fu 0; empty uraIndicators and a pao equal to the winner or dealer-in dropped;
 * - ryukyoku: hands always present (null where not shown), in tile order; without hands in the model,
 *   the hands Tenhou shows filled in from the replay (tenpai hands at an exhaustive draw or nagashi
 *   mangan, the declarer's at kyuushu kyuuhai); tenpai only for exhaustive draws and nagashi mangan,
 *   as the seats whose hands are shown (an unknown tenpai list comes back as no one tenpai);
 * - finalScores only when the game's last round ends with a result (owari is on its last tag).
 */
export function stripMjlogUnsupported(game: GameLog): GameLog {
  const tenhou: TenhouRules = {
    room: game.rules.room ?? "general",
    length: game.rules.length ?? "east",
    openTanyao: game.rules.openTanyao ?? true,
    redFives: game.rules.redFives,
    fast: game.rules.fast ?? false,
  };
  const ranked = game.players.every(hasDan);
  const rated = game.players.every((player) => player.rating !== undefined);
  const players = game.players.map((player) => {
    const stripped: PlayerInfo = { name: player.name };
    if (ranked && player.danIndex !== undefined) {
      stripped.rank = TENHOU_DAN_LABELS[player.danIndex] as string;
      stripped.danIndex = player.danIndex;
    }
    if (rated && player.rating !== undefined) {
      stripped.rating = Number(player.rating.toFixed(2));
    }
    return stripped;
  }) as Quad<PlayerInfo>;
  const stripped: GameLog = {
    format: "mjlog",
    players,
    rules: { ...tenhou, description: tenhouRuleText(tenhou) },
    rounds: game.rounds.map(stripRound),
  };
  const lastEvents = game.rounds.at(-1)?.events ?? [];
  if (game.finalScores && isResult(lastEvents[lastEvents.length - 1])) {
    stripped.finalScores = [...game.finalScores];
  }
  return stripped;
}
