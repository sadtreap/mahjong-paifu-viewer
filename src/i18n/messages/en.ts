import type { LimitName, RyukyokuReason } from "../../core/model";
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
  /** A Mahjong Soul link: its log cannot be downloaded and has to be converted first. */
  | "mahjongSoul"
  | "unexpected";

/** Kinds of call named in step descriptions. */
export type CallKind = "chi" | "pon" | "daiminkan" | "ankan" | "kakan";

const WINDS = ["East", "South", "West", "North"];

const SUITS: Record<Suit, string> = { m: "Man", p: "Pin", s: "Sou" };

/** "a", "a and b", "a, b and c". */
function andList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "n tile" or "n tiles". */
function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

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
    tagline: "Replay Tenhou and mjai game logs; your files stay in your browser.",
  },
  tools: {
    label: "Viewer tools",
    withKey: (label: string, key: string) => `${label} (${key})`,
    hands: "Hands",
    pov: "Point of view",
    povButton: (wind: string, name: string) => `Point of view: ${wind}, ${name}`,
    /** A row of the point-of-view menu; `diff` is the signed difference from the viewed player. */
    povItem: (wind: string, name: string, score: string, diff: string | null) =>
      `${wind}, ${name}, ${score}${diff === null ? "" : ` (${diff})`}`,
  },
  settings: {
    language: "Language",
    heading: "Settings",
    close: "Close",
    reset: "Reset to defaults",
    view: "Table",
    view3d: "3D",
    viewFlat: "Flat",
    showWaits: "Show waits and shanten",
    charKeys: "Single-key shortcuts",
    charKeysHint: "Letters, digits, punctuation and Space",
    charKeysOff: "Single-key shortcuts are off in the settings, so the dimmed keys do nothing.",
  },
  open: {
    heading: "Open a log",
    close: "Close",
  },
  load: {
    pasteLabel: "Link or log to open",
    pastePlaceholder: "Tenhou link, log ID or log text",
    openButton: "Open",
    // No-break spaces keep each format's name on one line.
    formats: "Reads tenhou.net/6 JSON, mjai JSONL and Tenhou mjlog XML.",
    chooseFile: "Choose a file",
    dropHint: "or drop one anywhere on the page",
    samplesLabel: "Samples",
    samples: {
      "tenhou-json": "4-player",
      sanma: "3-player",
    } satisfies Record<SampleId, string>,
    downloading: "Downloading the log…",
    cancel: "Cancel",
    dropOverlay: "Drop the log to open it",
  },
  errors: {
    codes: {
      empty: "The file or the pasted text is empty.",
      unrecognized: "This is not a game log the viewer can read.",
      urlOnly:
        "Only Tenhou links can be downloaded; for another site, open or paste the log data itself.",
      decompress: "The compressed file is damaged or incomplete.",
      invalid: "The log is damaged or incomplete.",
      unsupportedPlayers: "Only three- and four-player games can be opened.",
      readFailed: "The file could not be read.",
      fetchFailed: "The log could not be downloaded; check your connection.",
      tenhouFetchFailed:
        "The log could not be downloaded from tenhou.net; check the link and your connection.",
      mahjongSoul:
        "Mahjong Soul links cannot be opened; convert the log to tenhou.net/6 JSON with tensoul first.",
      tooLarge: "This is too large to be a game log.",
      unexpected: "Something went wrong while opening the log.",
    } satisfies Record<UiErrorCode, string>,
    logDataLink: "Log data on tenhou.net",
    tensoulLink: "tensoul on GitHub",
    newTab: "(opens in a new tab)",
    replayFailed:
      "This round could not be replayed. The log may be damaged or use a rule this viewer does not support.",
  },
  viewer: {
    unnamed: (seat: number) => `Player ${seat + 1}`,
    showAllHands: "Show all hands",
    prevStep: "Previous step",
    nextStep: "Next step",
    prevRound: "Previous round",
    nextRound: "Next round",
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
    dora: "Dora indicators",
    wall: (count: number) => `${count} tiles left`,
    wallShort: (count: number) => `${count} left`,
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
    kita: (player: string) => `${player} sets aside a North tile (kita)`,
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
    kita: (n: number) => `Kita: ${count(n, "North tile", "North tiles")} set aside`,
    dora: "Dora",
    doraIndicators: "Dora indicators",
    ura: "Ura Dora",
    uraIndicators: "Ura Dora indicators",
    pao: (player: string) => `Liability (pao): ${player}`,
    deltas: "Point changes",
    player: "Player",
    change: "Change",
    tenpai: "Tenpai",
    noten: "Noten",
    waits: (tiles: readonly string[]) => `Waits: ${andList(tiles)}`,
    showTable: "Show table",
    nextRound: "Next round",
    tenpaiSeats: (names: readonly string[]) =>
      names.length === 0 ? "nobody tenpai" : `tenpai: ${andList(names)}`,
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
    rank: "Rank",
  },
  table: {
    kita: (name: string, n: number) =>
      `${name}'s kita: ${count(n, "North tile", "North tiles")} set aside`,
    kitaCount: (n: number) => `×${n}`,
    /** The console's button: the other players' scores as differences from the viewed player's. */
    scoreDiff: "Show score differences",
    /** A seat tag's hidden text: what the console shows about the player. */
    seatFacts: (wind: string, points: string, dealer: boolean, riichi: boolean) =>
      `${wind}, ${points} points${dealer ? ", dealer" : ""}${riichi ? ", riichi" : ""}`,
    wallHand: (name: string, n: number) => `${name}'s hand, ${count(n, "tile", "tiles")} face down`,
    waitsShort: "Wait",
    left: (n: number) => `${n} left`,
    furiten: "Furiten",
    tenpai: "Tenpai",
    shanten: (n: number) => `${n}-shanten`,
    completeHand: "Complete hand",
    waitsSr: (tiles: readonly string[], n: number, furiten: boolean) =>
      `Waits ${andList(tiles)}, ${n} left${furiten ? ", furiten" : ""}`,
  },
  captions: {
    chi: "Chi",
    pon: "Pon",
    kan: "Kan",
    riichi: "Riichi",
    kita: "Kita",
    ron: "Ron",
    tsumo: "Tsumo",
  },
  menu: {
    label: "Menu",
    open: "Open another log",
    copyLink: "Copy link to this moment",
    settings: "Settings",
    controls: "Controls",
  },
  transport: {
    label: "Replay controls",
    showResult: "Show result",
    /** The round button's name: the round it shows, and what it opens. */
    roundList: (round: string) => `${round}, round list`,
    prevTurn: "Previous own turn",
    nextTurn: "Next own turn",
    turn: (n: number) => `Turn ${n}`,
    play: "Play",
    pause: "Pause",
    speed: (x: number) => `Autoplay speed: ${x}×`,
    speedValue: (x: number) => `${x}×`,
    resultPrefix: "Result · ",
  },
  help: {
    heading: "Controls",
    close: "Close",
    keyboard: "Keyboard",
    mouse: "Mouse",
    touch: "Touch",
    step: "Next / previous step",
    ownTurn: "Next / previous own turn",
    nextRound: "Next round",
    roundStart: "Round start, then the previous round",
    roundEnds: "Round start / round result",
    autoplay: "Autoplay on / off",
    speed: "Autoplay faster / slower",
    seat: "View from seat 1–4",
    cycleSeat: "View from the next / previous player",
    hands: "Show / hide all hands",
    waits: "Waits and shanten",
    scoreDiff: "Score differences",
    view: "3D / flat table",
    roundList: "Round list",
    helpKey: "This help",
    escape: "Close menus, hide the round result, stop autoplay",
    click: "Click the table: next step",
    rightClick: "Right-click: previous step",
    wheel: "Wheel: next / previous step",
    shift: "With Shift held: by own turn",
    hold: "Press and hold: fast-forward or rewind",
    hover: "Point at a tile: highlight every copy of it",
    altClick: "Alt+click a discard: go to that moment",
    console: "Click the centre panel: score differences",
    tap: "Tap the table: next step",
    swipe: "Swipe left / right: next / previous step",
    longPress: "Touch and hold: fast-forward",
    tapConsole: "Tap the centre panel: score differences",
    off: "(disabled)",
  },
  timeline: {
    stepSlider: "Step in this round",
    stepValue: (step: number, total: number, turn: number, text: string) =>
      `Step ${step} of ${total}, turn ${turn}: ${text}`,
  },
  info: {
    dora: "Dora",
    honba: (n: number) => `${n} honba`,
    deposits: (n: number) => count(n, "deposit", "deposits"),
  },
  rounds: {
    label: "Rounds",
    ron: (winner: string, from: string) => `${winner} ron off ${from}`,
    tsumo: (winner: string) => `${winner} tsumo`,
    draw: "Draw",
    final: "Final standings",
    /** Over the column of the viewed player's point changes. */
    changeFor: (name: string) => `Change for ${name}`,
  },
  toast: {
    linkCopied: "Link copied",
    linkCopyFailed: "The link could not be copied",
    waitsOn: "Waits and shanten on",
    waitsOff: "Waits and shanten off",
    /** Read out (not shown) when a key changes what the table shows. */
    handsShown: "All hands shown",
    handsHidden: "Other players' hands hidden",
    scoreDiffOn: "Score differences on",
    scoreDiffOff: "Score differences off",
    view3d: "3D table",
    viewFlat: "Flat table",
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
    nukidora: "Kita Dora",
  } satisfies Record<YakuKey, string>,
};

export type Messages = typeof en;
