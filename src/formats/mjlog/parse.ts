import type {
  GameLog,
  GameRules,
  LimitName,
  PlayerCount,
  PlayerInfo,
  Quad,
  Round,
  RoundEvent,
  RyukyokuEvent,
  RyukyokuReason,
  Seat,
  Wind,
  WinEvent,
  YakuEntry,
} from "../../core/model";
import { isActiveSeat } from "../../core/players";
import type { KnownTile, Tile } from "../../core/tile";
import { yakuKeyFromTenhouId } from "../../core/yaku";
import { LogParseError } from "../errors";
import {
  TENHOU_DAN_LABELS,
  type TenhouRoom,
  type TenhouRules,
  tenhouRuleText,
} from "../tenhou-labels";
import { decodeMeld, isTileId, tileFromId } from "./meld";
import { type MjlogTag, readTags } from "./tags";

/** GO `type` bits. */
const GO_NO_RED_FIVES = 0x02;
const GO_NO_KUITAN = 0x04;
const GO_SOUTH = 0x08;
const GO_THREE_PLAYER = 0x10;
const GO_TOKUJOU = 0x20;
const GO_FAST = 0x40;
const GO_JOUKYUU = 0x80;
/** Rooms by (0x20 ? 1 : 0) + (0x80 ? 2 : 0): 般, 特 (tokujou), 上 (joukyuu), 鳳 (houou, both bits). */
const GO_ROOMS: readonly TenhouRoom[] = ["general", "special", "upper", "phoenix"];

const LIMITS: readonly (LimitName | undefined)[] = [
  undefined,
  "mangan",
  "haneman",
  "baiman",
  "sanbaiman",
  "yakuman",
];

const RYUUKYOKU_REASONS = new Map<string, RyukyokuReason>([
  ["yao9", "kyuushuKyuuhai"],
  ["reach4", "suuchaRiichi"],
  ["ron3", "sanchaHou"],
  ["kan4", "suukaikan"],
  ["kaze4", "suufonRenda"],
  ["nm", "nagashiMangan"],
]);

const DRAW_TAG = /^([TUVW])(\d+)$/;
const DISCARD_TAG = /^([DEFG])(\d+)$/;

/**
 * Parses a Tenhou mjlog XML document (`<mjloggm ...>`), already decompressed.
 *
 * Three-player games (GO type bit 0x10) are written with four seat slots, seat 3 empty: `n3=""`
 * in UN (whose dan, rate and sx still have a fourth entry), `hai3=""` and a fourth score of 0 in
 * INIT, and `0,0` for seat 3 in every sc and owari. They are read into the model's empty-chair
 * placeholders, and anything seat 3 does or scores is invalid. Seats keep their four-seat geometry:
 * meld codes give the discarder relative to the caller mod 4, so it is never seat 3.
 */
export function parseMjlog(text: string): GameLog {
  const tags = readTags(text);
  if (!tags?.some((tag) => tag.name === "mjloggm" && !tag.closing)) {
    throw new LogParseError("invalid", "Not an mjlog document");
  }
  let goType: number | undefined;
  /** Set by the first INIT: from GO, or without GO from that INIT's empty seat 3. */
  let playerCount: PlayerCount | undefined;
  let players: Quad<PlayerInfo> | undefined;
  let finalScores: Quad<number> | undefined;
  const rounds: Round[] = [];
  let round: RoundBuilder | undefined;

  for (const tag of tags) {
    if (tag.closing) {
      continue;
    }
    switch (tag.name) {
      case "GO":
        goType = intAttr(tag, "type");
        break;
      case "UN":
        // The first UN lists everyone; later ones (after a BYE) are reconnects.
        players ??= readPlayers(tag);
        break;
      case "INIT":
        if (round) {
          rounds.push(round.round);
        }
        playerCount ??= goType === undefined ? playerCountOfInit(tag) : playerCountOf(goType);
        round = new RoundBuilder(tag, redFivesOf(goType), playerCount);
        break;
      case "AGARI":
      case "RYUUKYOKU": {
        const current = requireRound(round, tag);
        current.addResult(tag);
        finalScores = readFinalScores(tag, current.playerCount) ?? finalScores;
        break;
      }
      case "N":
      case "REACH":
      case "DORA":
        requireRound(round, tag).addEvent(tag);
        break;
      default:
        if (DRAW_TAG.test(tag.name) || DISCARD_TAG.test(tag.name)) {
          requireRound(round, tag).addEvent(tag);
        }
      // SHUFFLE, TAIKYOKU, BYE and unknown tags carry nothing the viewer shows.
    }
  }
  if (round) {
    rounds.push(round.round);
  }
  if (rounds.length === 0 || playerCount === undefined) {
    throw new LogParseError("invalid", "No rounds in mjlog");
  }
  if (goType !== undefined && playerCountOf(goType) !== playerCount) {
    throw new LogParseError("unsupportedPlayers", "GO and INIT disagree on the number of players");
  }

  const seats = players ?? [{ name: "" }, { name: "" }, { name: "" }, { name: "" }];
  if (playerCount === 3) {
    // UN still lists dan 0 and rate 1500.00 for the empty chair.
    seats[3] = { name: "" };
  }
  const game: GameLog = {
    format: "mjlog",
    playerCount,
    players: seats,
    rules: readRules(goType),
    rounds,
  };
  if (finalScores) {
    game.finalScores = finalScores;
  }
  return game;
}

function redFivesOf(goType: number | undefined): boolean {
  return ((goType ?? 0) & GO_NO_RED_FIVES) === 0;
}

function playerCountOf(goType: number): PlayerCount {
  return goType & GO_THREE_PLAYER ? 3 : 4;
}

/** Without GO: an INIT that deals seat 3 nothing and gives it 0 points is a three-player round. */
function playerCountOfInit(tag: MjlogTag): PlayerCount {
  const ten = optionalList(tag, "ten");
  return optionalList(tag, "hai3") === undefined && ten?.[3] === 0 ? 3 : 4;
}

/**
 * The rules in the GO `type` bits. The description is the rule text Tenhou shows for them (and
 * writes as rule.disp in tenhou.net/6 logs), e.g. "鳳南喰赤".
 */
function readRules(goType: number | undefined): GameRules {
  if (goType === undefined) {
    return { redFives: true };
  }
  const rules: TenhouRules = {
    players: playerCountOf(goType),
    room: GO_ROOMS[(goType & GO_TOKUJOU ? 1 : 0) + (goType & GO_JOUKYUU ? 2 : 0)] as TenhouRoom,
    length: goType & GO_SOUTH ? "south" : "east",
    openTanyao: (goType & GO_NO_KUITAN) === 0,
    redFives: redFivesOf(goType),
    fast: (goType & GO_FAST) !== 0,
  };
  // The player count is GameLog.playerCount, not a rule; only the description ("三...") shows it.
  const { room, length, openTanyao, redFives, fast } = rules;
  return { redFives, length, room, openTanyao, fast, description: tenhouRuleText(rules) };
}

function readPlayers(tag: MjlogTag): Quad<PlayerInfo> {
  const dans = optionalList(tag, "dan");
  const rates = optionalList(tag, "rate", true);
  return [0, 1, 2, 3].map((seat) => {
    const player: PlayerInfo = { name: decodeName(tag.attrs.get(`n${seat}`) ?? "") };
    const dan = dans?.[seat];
    const label = dan === undefined ? undefined : TENHOU_DAN_LABELS[dan];
    if (dan !== undefined && label) {
      // Tenhou's own label, which is also what tenhou.net/6 logs carry; the UI localizes danIndex.
      player.rank = label;
      player.danIndex = dan;
    }
    const rate = rates?.[seat];
    if (rate !== undefined) {
      player.rating = rate;
    }
    return player;
  }) as Quad<PlayerInfo>;
}

function decodeName(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * `owari="score0,uma0,score1,uma1,..."` with scores in hundreds, on the game's last result. Three-
 * player games list the empty seat 3 as `0,0.0`.
 */
function readFinalScores(tag: MjlogTag, playerCount: PlayerCount): Quad<number> | undefined {
  const values = optionalList(tag, "owari", true);
  if (!values) {
    return undefined;
  }
  if (values.length < 8) {
    throw invalid(tag, "owari");
  }
  const scores = [0, 1, 2, 3].map((seat) =>
    Math.round((values[seat * 2] as number) * 100),
  ) as Quad<number>;
  if (playerCount === 3 && scores[3] !== 0) {
    throw invalid(tag, "owari");
  }
  return scores;
}

class RoundBuilder {
  readonly round: Round;
  readonly playerCount: PlayerCount;
  private readonly redFives: boolean;
  /** Id of each seat's last draw, cleared once it is no longer the tile just drawn. */
  private readonly lastDraw: Array<number | null> = [null, null, null, null];
  /** REACH step 1 seen: the seat's next discard declares riichi. */
  private readonly riichiPending = [false, false, false, false];
  /** Index in events of each seat's riichi declaration discard. */
  private readonly riichiDiscard: Array<number | null> = [null, null, null, null];
  private ended = false;

  constructor(tag: MjlogTag, redFives: boolean, playerCount: PlayerCount) {
    this.redFives = redFives;
    this.playerCount = playerCount;
    const seed = intList(tag, "seed");
    const [index, honba, riichiSticks] = seed;
    if (index === undefined || honba === undefined || riichiSticks === undefined) {
      throw invalid(tag, "seed");
    }
    // wind * 4 + dealer, also with three players (East 3 is 2, South 1 is 4).
    if (index < 0 || index > 15 || index % 4 >= playerCount) {
      throw invalid(tag, "seed");
    }
    const indicator = seed[5];
    if (indicator === undefined) {
      throw invalid(tag, "seed");
    }
    const ten = intList(tag, "ten");
    if (ten.length < 4) {
      throw invalid(tag, "ten");
    }
    const hands = [0, 1, 2, 3].map((seat) => {
      const hand = optionalList(tag, `hai${seat}`) ?? [];
      if (!isActiveSeat(seat as Seat, playerCount)) {
        if (hand.length > 0) {
          throw new LogParseError("unsupportedPlayers", "A three-player game deals seat 3 a hand");
        }
        return [];
      }
      if (hand.length === 0) {
        throw new LogParseError("unsupportedPlayers", "A seat has no starting hand");
      }
      if (hand.length !== 13) {
        throw invalid(tag, `hai${seat}`);
      }
      return hand.map((id) => this.tile(tag, id));
    }) as Quad<Tile[]>;
    if (playerCount === 3 && ten[3] !== 0) {
      throw invalid(tag, "ten");
    }
    this.round = {
      wind: Math.floor(index / 4) as Wind,
      number: (index % 4) + 1,
      dealer: this.seat(tag, "oya"),
      honba,
      riichiSticks,
      scores: ten.slice(0, 4).map((value) => value * 100) as Quad<number>,
      doraIndicators: [this.tile(tag, indicator)],
      hands,
      events: [],
    };
  }

  addEvent(tag: MjlogTag): void {
    if (this.ended) {
      throw new LogParseError("invalid", `<${tag.name}> after the round result`);
    }
    const events = this.round.events;
    const draw = DRAW_TAG.exec(tag.name);
    if (draw) {
      const seat = this.tagSeat(tag, "TUVW".indexOf(draw[1] as string) as Seat);
      const id = Number(draw[2]);
      events.push({ type: "draw", seat, tile: this.tile(tag, id) });
      this.lastDraw[seat] = id;
      return;
    }
    const discard = DISCARD_TAG.exec(tag.name);
    if (discard) {
      const seat = this.tagSeat(tag, "DEFG".indexOf(discard[1] as string) as Seat);
      const id = Number(discard[2]);
      const riichi = this.riichiPending[seat] as boolean;
      if (riichi) {
        this.riichiPending[seat] = false;
        this.riichiDiscard[seat] = events.length;
      }
      events.push({
        type: "discard",
        seat,
        tile: this.tile(tag, id),
        tsumogiri: this.lastDraw[seat] === id,
        riichi,
      });
      this.lastDraw[seat] = null;
      return;
    }
    switch (tag.name) {
      case "N":
        events.push(this.readMeld(tag));
        return;
      case "REACH":
        this.readReach(tag);
        return;
      case "DORA":
        events.push({ type: "dora", indicator: this.tile(tag, intAttr(tag, "hai")) });
        return;
    }
  }

  private readMeld(tag: MjlogTag): RoundEvent {
    const seat = this.seat(tag, "who");
    const meld = decodeMeld(intAttr(tag, "m"));
    if (!meld || (meld.type === "nukidora" && this.playerCount === 4)) {
      throw invalid(tag, "m");
    }
    // A kita is followed by the same seat's replacement draw, which sets lastDraw again.
    this.lastDraw[seat] = null;
    switch (meld.type) {
      case "nukidora":
        return { type: "kita", seat, tile: this.tile(tag, meld.tile) };
      case "ankan":
        return { type: "ankan", seat, tiles: meld.tiles.map((id) => this.tile(tag, id)) };
      case "kakan":
        return { type: "kakan", seat, tile: this.tile(tag, meld.added) };
      default: {
        // The discarder relative to the caller, mod 4 also with three players.
        const from = ((seat + meld.from) % 4) as Seat;
        if (!isActiveSeat(from, this.playerCount)) {
          throw invalid(tag, "m");
        }
        return {
          type: meld.type,
          seat,
          from,
          tile: this.tile(tag, meld.called),
          consumed: meld.consumed.map((id) => this.tile(tag, id)),
        };
      }
    }
  }

  private readReach(tag: MjlogTag): void {
    const seat = this.seat(tag, "who");
    const step = intAttr(tag, "step");
    if (step === 1) {
      this.riichiPending[seat] = true;
      return;
    }
    if (step !== 2) {
      throw invalid(tag, "step");
    }
    // The stick is placed once the declaration discard passes. Keep the event right after that
    // discard even if the source logged it later.
    const events = this.round.events;
    const discardIndex = this.riichiDiscard[seat];
    this.riichiDiscard[seat] = null;
    const at =
      discardIndex === null || discardIndex === undefined ? events.length : discardIndex + 1;
    events.splice(at, 0, { type: "riichiAccepted", seat });
    this.riichiDiscard.forEach((index, other) => {
      if (index !== null && index >= at) {
        this.riichiDiscard[other] = index + 1;
      }
    });
  }

  addResult(tag: MjlogTag): void {
    const events = this.round.events;
    const last = events[events.length - 1];
    if (this.ended && !(tag.name === "AGARI" && last?.type === "win")) {
      throw new LogParseError("invalid", `<${tag.name}> after the round result`);
    }
    this.ended = true;
    events.push(tag.name === "AGARI" ? this.readAgari(tag) : this.readRyuukyoku(tag));
  }

  /**
   * AGARI. Its `m` lists the winner's melds newest first, three-player kita included; the events
   * already have them, so it is not read. Tenhou counts kita (nukidora) han inside ドラ (yaku 52).
   */
  private readAgari(tag: MjlogTag): WinEvent {
    const seat = this.seat(tag, "who");
    const [fu, points, limit] = intList(tag, "ten");
    if (fu === undefined || points === undefined || limit === undefined) {
      throw invalid(tag, "ten");
    }
    if (limit < 0 || limit >= LIMITS.length) {
      throw invalid(tag, "ten");
    }
    const yaku = readYaku(tag);
    const win: WinEvent = {
      type: "win",
      seat,
      from: this.seat(tag, "fromWho"),
      deltas: this.deltas(tag),
      tile: this.tile(tag, intAttr(tag, "machi")),
      hand: intList(tag, "hai").map((id) => this.tile(tag, id)),
      han: yaku.reduce((sum, entry) => sum + entry.han, 0),
      fu,
      points,
      yaku,
    };
    const limitName = LIMITS[limit];
    if (limitName) {
      win.limit = limitName;
    }
    const ura = optionalList(tag, "doraHaiUra");
    if (ura) {
      win.uraIndicators = ura.map((id) => this.tile(tag, id));
    }
    if (tag.attrs.has("paoWho")) {
      const pao = this.seat(tag, "paoWho");
      if (pao !== win.seat && pao !== win.from) {
        win.pao = pao;
      }
    }
    return win;
  }

  private readRyuukyoku(tag: MjlogTag): RyukyokuEvent {
    const type = tag.attrs.get("type");
    const reason = type === undefined ? "exhaustive" : (RYUUKYOKU_REASONS.get(type) ?? "unknown");
    const hands = [0, 1, 2, 3].map((seat) => {
      const ids = optionalList(tag, `hai${seat}`);
      if (ids && !isActiveSeat(seat as Seat, this.playerCount)) {
        throw invalid(tag, `hai${seat}`);
      }
      return ids ? ids.map((id) => this.tile(tag, id)) : null;
    }) as Quad<Tile[] | null>;
    const result: RyukyokuEvent = { type: "ryukyoku", reason, deltas: this.deltas(tag), hands };
    if (reason === "exhaustive" || reason === "nagashiMangan") {
      // At an exhaustive draw Tenhou shows exactly the tenpai hands.
      result.tenpai = ([0, 1, 2, 3] as Seat[]).filter((seat) => hands[seat] !== null);
    }
    return result;
  }

  private tile(tag: MjlogTag, id: number): KnownTile {
    if (!isTileId(id)) {
      throw new LogParseError("invalid", `<${tag.name}> has tile id ${id}`);
    }
    return tileFromId(id, this.redFives);
  }

  /** A seat attribute; the empty seat 3 of a three-player game is out of range. */
  private seat(tag: MjlogTag, name: string): Seat {
    const value = intAttr(tag, name);
    if (value < 0 || value >= this.playerCount) {
      throw invalid(tag, name);
    }
    return value as Seat;
  }

  /** The seat of a draw or discard tag (W and G are seat 3). */
  private tagSeat(tag: MjlogTag, seat: Seat): Seat {
    if (!isActiveSeat(seat, this.playerCount)) {
      throw new LogParseError("invalid", `<${tag.name}> in a three-player game`);
    }
    return seat;
  }

  /** `sc="before0,delta0,before1,delta1,..."` in hundreds; seat 3 of a three-player game is 0,0. */
  private deltas(tag: MjlogTag): Quad<number> {
    const sc = intList(tag, "sc");
    if (sc.length < 8) {
      throw invalid(tag, "sc");
    }
    const deltas = [0, 1, 2, 3].map((seat) =>
      Math.round((sc[seat * 2 + 1] as number) * 100),
    ) as Quad<number>;
    if (this.playerCount === 3 && deltas[3] !== 0) {
      throw invalid(tag, "sc");
    }
    return deltas;
  }
}

/**
 * `yaku="id,han,id,han..."` and `yakuman="id,id..."`. Entries worth 0 han are dropped: Tenhou
 * writes ura dora (id 53) with 0 han on every riichi win that has none.
 */
function readYaku(tag: MjlogTag): YakuEntry[] {
  const entries: YakuEntry[] = [];
  const pairs = optionalList(tag, "yaku") ?? [];
  if (pairs.length % 2 !== 0) {
    throw invalid(tag, "yaku");
  }
  for (let i = 0; i < pairs.length; i += 2) {
    const han = pairs[i + 1] as number;
    if (han < 0) {
      throw invalid(tag, "yaku");
    }
    if (han > 0) {
      entries.push({ ...yakuKey(pairs[i] as number), han });
    }
  }
  for (const id of optionalList(tag, "yakuman") ?? []) {
    entries.push({ ...yakuKey(id), han: 13, yakuman: true });
  }
  return entries;
}

function yakuKey(id: number): Pick<YakuEntry, "key" | "raw"> {
  const key = yakuKeyFromTenhouId(id);
  return key ? { key } : { key: null, raw: `Tenhou yaku #${id}` };
}

function requireRound(round: RoundBuilder | undefined, tag: MjlogTag): RoundBuilder {
  if (!round) {
    throw new LogParseError("invalid", `<${tag.name}> before the first <INIT>`);
  }
  return round;
}

function invalid(tag: MjlogTag, attribute: string): LogParseError {
  const value = tag.attrs.get(attribute);
  return new LogParseError(
    "invalid",
    `<${tag.name}> has an invalid ${attribute}${value === undefined ? "" : `="${value}"`}`,
  );
}

function intAttr(tag: MjlogTag, name: string): number {
  const value = tag.attrs.get(name);
  if (value === undefined || !/^-?\d+$/.test(value.trim())) {
    throw invalid(tag, name);
  }
  return Number(value);
}

/** A required, non-empty comma-separated list of integers. */
function intList(tag: MjlogTag, name: string): number[] {
  const values = optionalList(tag, name);
  if (!values) {
    throw invalid(tag, name);
  }
  return values;
}

/**
 * A comma-separated list of integers (or decimals when `decimals` is set), or undefined when the
 * attribute is missing or empty.
 */
function optionalList(tag: MjlogTag, name: string, decimals = false): number[] | undefined {
  const value = tag.attrs.get(name)?.trim();
  if (!value) {
    return undefined;
  }
  const pattern = decimals ? /^-?\d+(\.\d+)?$/ : /^-?\d+$/;
  return value.split(",").map((part) => {
    const trimmed = part.trim();
    if (!pattern.test(trimmed)) {
      throw invalid(tag, name);
    }
    return Number(trimmed);
  });
}
