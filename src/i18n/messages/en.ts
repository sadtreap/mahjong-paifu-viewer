import type { GameRules, LimitName, LogFormat, RyukyokuReason } from "../../core/model";
import type { Suit } from "../../core/tile";
import type { YakuKey } from "../../core/yaku";
import type { LogErrorCode } from "../../formats/errors";
import type { SampleId } from "../../ui/samples";

/** Errors the UI reports besides the loader's own codes. */
export type UiErrorCode =
  | LogErrorCode
  | "readFailed"
  | "fetchFailed"
  /** The log of a pasted Tenhou link could not be downloaded from tenhou.net. */
  | "tenhouFetchFailed"
  | "unexpected";

/** Kinds of call named in step descriptions. */
export type CallKind = "chi" | "pon" | "daiminkan" | "ankan" | "kakan";

const WINDS = ["East", "South", "West", "North"];

/** Tenhou ranks by dan index (PlayerInfo.danIndex): 新人, 9-1 kyu, 1-10 dan, 天鳳位. */
function dan(index: number): string {
  if (index <= 0) {
    return "Novice";
  }
  if (index < 10) {
    return `${10 - index} kyu`;
  }
  return index < 20 ? `${index - 9} dan` : "Tenhoui";
}
const SUITS: Record<Suit, string> = { m: "Man", p: "Pin", s: "Sou" };

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) {
    return `${n}th`;
  }
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/**
 * Source of truth for UI strings. Other locales must provide the same shape (`Messages`).
 * Use functions for strings that need interpolation, e.g. `round: (n: number) => \`Round ${n}\``.
 */
export const en = {
  app: {
    title: "Mahjong Paifu Viewer",
    tagline: "View Tenhou and mjai game logs in your browser.",
    newLog: "Open another log",
  },
  settings: {
    language: "Language",
  },
  load: {
    heading: "Open a game log",
    intro:
      "Drop a log file anywhere on this page, choose a file, or paste the log data or a Tenhou link.",
    chooseFile: "Choose a file",
    pasteLabel: "Paste the log data or a Tenhou link",
    pastePlaceholder: "tenhou.net/6 JSON, mjai JSONL, mjlog XML or a Tenhou replay link",
    loadButton: "Load",
    pasteAnywhere:
      "You can also press Ctrl+V (⌘V on a Mac) anywhere on the page to load a copied log or Tenhou link.",
    formatsHeading: "Supported formats",
    formats: [
      "Tenhou replay links and log ids, e.g. https://tenhou.net/0/?log=… (the viewer downloads the log from tenhou.net)",
      "tenhou.net/6 JSON, or a tenhou.net/6 link that contains #json=",
      "mjai JSONL (one event per line)",
      "Tenhou mjlog XML (.xml or .mjlog, gzip-compressed or not)",
    ],
    fourPlayerOnly: "Four-player games only.",
    privacy:
      "Logs are read in your browser and never uploaded. Pasting a Tenhou link downloads that log from tenhou.net.",
    samplesHeading: "Try a sample",
    samples: {
      "tenhou-json": "Short game (tenhou.net/6 JSON)",
    } satisfies Record<SampleId, string>,
    loading: "Loading the log…",
    dropOverlay: "Drop the log file to open it",
  },
  errors: {
    title: "Could not open the log",
    dismiss: "Dismiss",
    codes: {
      empty: "There is nothing to load. The file or the pasted text is empty.",
      unrecognized:
        "This is not a log format the viewer knows. Use tenhou.net/6 JSON, mjai JSONL or Tenhou mjlog XML.",
      urlOnly:
        "This is a link to a log, not the log itself. The viewer downloads logs only from Tenhou links, so save or copy the log data instead:",
      decompress: "The compressed file could not be unpacked. It may be damaged or incomplete.",
      invalid:
        "The format was recognized, but the log is damaged or incomplete, so it could not be read.",
      unsupportedPlayers:
        "Only four-player games are supported. Three-player (sanma) logs cannot be shown.",
      readFailed: "The file could not be read.",
      fetchFailed: "The log could not be downloaded. Check your connection and try again.",
      tenhouFetchFailed:
        "The log for this Tenhou link could not be downloaded from tenhou.net. Check the link and your connection, then try again.",
      tooLarge: "This is too large to be a game log, so it was not opened.",
      unexpected: "Something went wrong while loading the log.",
    } satisfies Record<UiErrorCode, string>,
    linkHelp: [
      "Tenhou: open tenhou.net/0/log/?<log id>, where the log id is the part of the replay link after log= up to the next & (e.g. 2000010100gm-0089-0000-0123abcd). Save the page with Ctrl+S (⌘S on a Mac) and drop the file here, or select all of it, copy it and paste it here.",
      "Mahjong Soul: the viewer cannot download Mahjong Soul logs. Convert the log to tenhou.net/6 JSON with a tool such as tensoul, then open or paste the result.",
      "tenhou.net/6: a link that contains #json= already includes the log and can be pasted as it is.",
      "mjai: open the .json or .jsonl file that the AI or the server saved.",
    ],
    tenhouSaveHelp:
      "To open it by hand, open the log data below in a new tab, save the page with Ctrl+S (⌘S on a Mac) and drop the file here, or select all of it, copy it and paste it here.",
    logDataLink: "Log data (opens in a new tab):",
    replayFailed:
      "This round could not be replayed. The log may be damaged or use a rule this viewer does not support.",
  },
  viewer: {
    gameInfo: "Game information",
    formats: {
      "tenhou-json": "tenhou.net/6 JSON",
      mjlog: "Tenhou mjlog XML",
      mjai: "mjai JSONL",
    } satisfies Record<LogFormat, string>,
    length: { east: "East-only game", south: "East-South game" },
    rooms: {
      general: "General room",
      upper: "Upper room",
      special: "Special room",
      phoenix: "Phoenix room",
    } satisfies Record<NonNullable<GameRules["room"]>, string>,
    openTanyao: "Open tanyao",
    noOpenTanyao: "No open tanyao",
    redFives: "Red fives",
    noRedFives: "No red fives",
    fast: "Fast",
    dan,
    rating: (rating: number) => `R${rating}`,
    unnamed: (seat: number) => `Player ${seat + 1}`,
    round: "Round",
    pov: "Point of view",
    showAllHands: "Show all hands",
    stepSlider: "Step",
    stepCounter: (step: number, total: number) => `Step ${step} / ${total}`,
    firstStep: "First step",
    prevStep: "Previous step",
    nextStep: "Next step",
    lastStep: "Last step",
    prevRound: "Previous round",
    nextRound: "Next round",
    playback: "Playback",
    shortcuts: "Keyboard shortcuts",
    shortcutStep: "Previous / next step",
    shortcutRound: "Previous / next round",
    shortcutEnds: "First / last step",
    shortcutsNote:
      "Text fields, select boxes and the step slider keep these keys; the slider moves within the round.",
  },
  board: {
    table: "Mahjong table",
    hand: (name: string) => `${name}'s hand`,
    melds: (name: string) => `${name}'s calls`,
    discards: (name: string) => `${name}'s discards`,
    drawn: (tile: string) => `${tile} (just drawn)`,
    tsumogiri: (tile: string) => `${tile}, discarded right after drawing`,
    riichiDiscard: (tile: string) => `${tile}, riichi declaration`,
    calledDiscard: (tile: string) => `${tile}, called`,
    lastDiscard: (tile: string) => `${tile}, last discard`,
    meld: (kind: string, tiles: string) => `${kind}: ${tiles}`,
    honba: "Honba",
    riichiSticks: "Riichi sticks",
    dora: "Dora indicators",
    wall: (count: number) => `${count} tiles left`,
    wallShort: (count: number) => `${count} left`,
    riichi: "Riichi",
    dealer: "Dealer",
    windsShort: ["E", "S", "W", "N"],
  },
  calls: {
    chi: "Chi",
    pon: "Pon",
    daiminkan: "Open kan",
    ankan: "Closed kan",
    kakan: "Added kan",
  } satisfies Record<CallKind, string>,
  round: {
    winds: WINDS,
    name: (wind: number, number: number, honba: number) =>
      `${WINDS[wind] ?? ""} ${number}${honba > 0 ? `, ${honba} honba` : ""}`,
  },
  event: {
    deal: (round: string) => `${round}: starting hands dealt`,
    draw: (player: string, tile: string | null) =>
      tile === null ? `${player} draws` : `${player} draws ${tile}`,
    discard: (player: string, tile: string) => `${player} discards ${tile}`,
    tsumogiri: (player: string, tile: string) =>
      `${player} discards ${tile} right after drawing it`,
    riichi: (player: string, tile: string) => `${player} declares riichi, discarding ${tile}`,
    riichiAccepted: (player: string) => `${player}'s riichi stick is placed`,
    call: (player: string, call: string, tile: string) => `${player} calls ${call} on ${tile}`,
    kan: (player: string, call: string, tile: string) => `${player} declares ${call} of ${tile}`,
    dora: (tile: string) => `New dora indicator: ${tile}`,
    tsumo: (player: string) => `${player} wins by tsumo`,
    ron: (player: string, from: string) => `${player} wins by ron off ${from}`,
  },
  result: {
    heading: "Round result",
    tsumo: "Tsumo",
    ronFrom: (from: string) => `Ron off ${from}`,
    han: (han: number) => `${han} han`,
    fu: (fu: number) => `${fu} fu`,
    points: (points: string) => `${points} points`,
    limits: {
      mangan: "Mangan",
      haneman: "Haneman",
      baiman: "Baiman",
      sanbaiman: "Sanbaiman",
      yakuman: "Yakuman",
    } satisfies Record<LimitName, string>,
    yakuman: (count: number) => (count === 1 ? "Yakuman" : `${count}× Yakuman`),
    yaku: "Yaku",
    unknownYaku: "Unknown yaku",
    winningHand: "Winning hand",
    winningTile: "Winning tile",
    uraIndicators: "Ura dora indicators",
    pao: (player: string) => `Liability (pao): ${player}`,
    deltas: "Point changes",
    player: "Player",
    change: "Change",
    tenpai: "Tenpai",
    noten: "Noten",
    noTenpai: "Nobody was tenpai.",
  },
  ryukyoku: {
    exhaustive: "Exhaustive draw",
    nagashiMangan: "Nagashi mangan",
    kyuushuKyuuhai: "Nine terminals abortive draw (kyuushu kyuuhai)",
    suufonRenda: "Four winds abortive draw (suufon renda)",
    suuchaRiichi: "Four riichi abortive draw (suucha riichi)",
    suukaikan: "Four kans abortive draw (suukaikan)",
    sanchaHou: "Triple ron abortive draw (sancha hou)",
    unknown: "Draw",
  } satisfies Record<RyukyokuReason, string>,
  standings: {
    heading: "Final standings",
    place: (place: number) => ordinal(place),
    points: "Points",
  },
  tiles: {
    number: (value: number, suit: Suit, red: boolean) =>
      `${value} ${SUITS[suit]}${red ? " (red)" : ""}`,
    honors: ["East", "South", "West", "North", "Haku", "Hatsu", "Chun"],
    unknown: "Unknown tile",
    back: "Face-down tile",
  },
  yaku: {
    menzenTsumo: "Menzen Tsumo",
    riichi: "Riichi",
    ippatsu: "Ippatsu",
    chankan: "Chankan",
    rinshanKaihou: "Rinshan Kaihou",
    haiteiRaoyue: "Haitei Raoyue",
    houteiRaoyui: "Houtei Raoyui",
    pinfu: "Pinfu",
    tanyao: "Tanyao",
    iipeikou: "Iipeikou",
    seatWindEast: "Seat Wind: East",
    seatWindSouth: "Seat Wind: South",
    seatWindWest: "Seat Wind: West",
    seatWindNorth: "Seat Wind: North",
    roundWindEast: "Round Wind: East",
    roundWindSouth: "Round Wind: South",
    roundWindWest: "Round Wind: West",
    roundWindNorth: "Round Wind: North",
    haku: "Yakuhai: Haku",
    hatsu: "Yakuhai: Hatsu",
    chun: "Yakuhai: Chun",
    doubleRiichi: "Double Riichi",
    chiitoitsu: "Chiitoitsu",
    chanta: "Chanta",
    ittsu: "Ittsu",
    sanshokuDoujun: "Sanshoku Doujun",
    sanshokuDoukou: "Sanshoku Doukou",
    sankantsu: "Sankantsu",
    toitoi: "Toitoi",
    sanankou: "Sanankou",
    shousangen: "Shousangen",
    honroutou: "Honroutou",
    ryanpeikou: "Ryanpeikou",
    junchan: "Junchan",
    honitsu: "Honitsu",
    chinitsu: "Chinitsu",
    renhou: "Renhou",
    tenhou: "Tenhou",
    chiihou: "Chiihou",
    daisangen: "Daisangen",
    suuankou: "Suuankou",
    suuankouTanki: "Suuankou Tanki",
    tsuuiisou: "Tsuuiisou",
    ryuuiisou: "Ryuuiisou",
    chinroutou: "Chinroutou",
    chuurenPoutou: "Chuuren Poutou",
    junseiChuurenPoutou: "Junsei Chuuren Poutou",
    kokushiMusou: "Kokushi Musou",
    kokushiMusou13: "Kokushi Musou 13-sided Wait",
    daisuushii: "Daisuushii",
    shousuushii: "Shousuushii",
    suukantsu: "Suukantsu",
    dora: "Dora",
    uraDora: "Ura Dora",
    akaDora: "Aka Dora",
    seatWind: "Seat Wind",
    roundWind: "Round Wind",
    yakuhai: "Yakuhai",
  } satisfies Record<YakuKey, string>,
};

export type Messages = typeof en;
