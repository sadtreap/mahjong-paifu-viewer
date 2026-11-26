import type {
  GameRules,
  LimitName,
  LogFormat,
  PlayerCount,
  RyukyokuReason,
} from "../../core/model";
import type { Suit } from "../../core/tile";
import type { YakuKey } from "../../core/yaku";
import type { LogErrorCode } from "../../formats/errors";
import type { SampleId } from "../../ui/samples";
import type { Theme } from "../../ui/viewer/types";

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

/** A key (or gesture) and what it does, shown as **key** + action in the first-use hint. */
export type HintPair = readonly [key: string, action: string];

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

const WINDS_SHORT = ["E", "S", "W", "N"];

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

/** Notes after a label: "" or ", a, b". */
function more(items: readonly string[]): string {
  return items.length === 0 ? "" : `, ${items.join(", ")}`;
}

const hintPairs = (...pairs: HintPair[]): readonly HintPair[] => pairs;

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
    newLog: "Open another log",
    settings: "Settings",
    help: "Keyboard, mouse and touch help",
    more: "More",
    copyLink: "Copy link to this moment",
    linkCopied: "Link copied",
    linkCopyFailed: "The link could not be copied",
    linkUnavailable: "Links work only for the sample logs and Tenhou logs",
  },
  tools: {
    label: "Viewer tools",
    view3d: "3D table",
    panel: "Review panel",
    withKey: (label: string, key: string) => `${label} (${key})`,
    pov: "Point of view",
    povButton: (name: string) => `Point of view: ${name}`,
    povMenu: "View from",
    povItem: (name: string, wind: string, dealer: boolean) =>
      `${name}, ${wind}${dealer ? ", dealer" : ""}`,
  },
  settings: {
    language: "Language",
    heading: "Settings",
    close: "Close",
    reset: "Reset to defaults",
    display: "Display",
    review: "Review aids",
    controls: "Controls",
    view: "Table view",
    view3d: "3D (tilted)",
    viewFlat: "Flat (top-down)",
    dimTsumogiri: "Dim tiles discarded right after drawing",
    captions: "Show call captions (Pon, Riichi, Ron…)",
    motion: "Animate tiles (discards, riichi, the round-end reveal)",
    theme: "Theme",
    themes: {
      system: "Same as the system",
      light: "Light",
      dark: "Dark",
    } satisfies Record<Theme, string>,
    clickToStep: "Click or tap the table to step (right-click or swipe right goes back)",
    wheelToStep: "Mouse wheel steps through the game",
    charKeys: "Single-key shortcuts (letters, digits, punctuation and Space)",
    autoplaySpeed: "Autoplay speed",
    showWaits: "Show waits, tenpai and furiten on the player plates",
    showNextDiscard:
      "Mark the tile the point-of-view player discards next (gives the next move away)",
    movesShowRest: "List the rest of the round under Moves (gives the round away)",
    charKeysOff: "Single-key shortcuts are turned off in the settings; the dimmed keys do nothing.",
  },
  welcome: {
    lede: "Replay Tenhou and mjai game logs. Click the table to step through a game. Your files never leave this browser.",
    drop: "Drop a log file here, or paste a Tenhou link or log text anywhere",
    openFile: "Open a file…",
    paste: "Paste a link or log",
    pasteHeading: "Paste a Tenhou link or log data",
    samples: "Samples:",
    sample4: "4-player",
    sample3: "3-player",
    explore: "Explore the sample",
  },
  open: {
    heading: "Open a game log",
    hint: "You can also drop a log file anywhere on the page, or press Ctrl+V (⌘V on a Mac) to paste a Tenhou link or log text.",
    close: "Close",
  },
  hint: {
    mouse: hintPairs(
      ["Click the table", "next"],
      ["Right-click", "back"],
      ["Hold", "fast-forward"],
      ["Wheel", "step"],
      ["Shift", "your turns"],
    ),
    touch: hintPairs(["Tap", "next"], ["Swipe →", "back"], ["Hold", "fast-forward"]),
    short: "Tap the table: next · swipe →: back · hold: fast-forward",
    legend: "step · click the table",
    dismiss: "Got it",
  },
  load: {
    pasteLabel: "Paste the log data or a Tenhou link",
    pastePlaceholder: "tenhou.net/6 JSON, mjai JSONL, mjlog XML or a Tenhou replay link",
    loadButton: "Load",
    formatsHeading: "Supported formats",
    formats: [
      "Tenhou replay links and log ids, e.g. https://tenhou.net/0/?log=… (the viewer downloads the log from tenhou.net)",
      "tenhou.net/6 JSON, or a tenhou.net/6 link that contains #json=",
      "mjai JSONL (one event per line)",
      "Tenhou mjlog XML (.xml or .mjlog, gzip-compressed or not)",
    ],
    playerCounts: "Three- and four-player games are supported.",
    privacy:
      "Logs are read in your browser and never uploaded. Pasting a Tenhou link downloads that log from tenhou.net.",
    samples: {
      "tenhou-json": "Short game (tenhou.net/6 JSON)",
      sanma: "Three-player game (tenhou.net/6 JSON)",
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
        "Only three- and four-player games are supported, and this log does not say clearly which it is.",
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
    players: { 3: "Three-player", 4: "Four-player" } satisfies Record<PlayerCount, string>,
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
    short: (wind: number, number: number, honba: number) =>
      `${WINDS_SHORT[wind] ?? ""}${number}${honba > 0 ? `-${honba}` : ""}`,
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
    uraIndicators: "Ura dora indicators",
    pao: (player: string) => `Liability (pao): ${player}`,
    deltas: "Point changes",
    player: "Player",
    change: "Change",
    tenpai: "Tenpai",
    noten: "Noten",
    hide: "Hide",
    nextRound: "Next round",
    beforeAfter: (before: string, after: string) => `${before} → ${after}`,
    riichiLine: (turn: number) => `Riichi turn ${turn}`,
    otherRiichi: (name: string, turn: number) => `${name}: riichi turn ${turn}`,
    waited: "waited",
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
  },
  table: {
    viewFrom: (name: string) => `View from ${name}`,
    openRoundList: (round: string) => `${round}. Open the round list`,
    kita: (name: string, n: number) =>
      `${name}'s kita: ${count(n, "North tile", "North tiles")} set aside`,
    kitaCount: (n: number) => `×${n}`,
    kitaPlate: (n: number) => `North ×${n}`,
    /** The plate's kita count on phones (kitaPlate is the screen-reader text there). */
    kitaPlateShort: (n: number) => `N×${n}`,
    /** How many honba or riichi sticks, after the stick drawn in the HUD. */
    stickCount: (n: number) => `×${n}`,
    showResult: "Show result",
    wallHand: (name: string, n: number) => `${name}'s hand, ${count(n, "tile", "tiles")} face down`,
    nextDiscard: "(discarded next)",
    waits: "Waits",
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
  ptip: {
    /** "\u00a0·": a wrapped line never starts with the separator (it stays with the word before). */
    head: (name: string, n: number, turn: number) =>
      `${name}\u00a0· ${ordinal(n)} discard\u00a0· turn ${turn}`,
    /** The head without the turn, when the tooltip does not fit a small console. */
    headShort: (name: string, n: number) => `${name}\u00a0· ${ordinal(n)} discard`,
    tsumogiri: "tsumogiri",
    fromHand: "from hand",
    riichiTile: "riichi tile",
    afterRiichi: "after riichi",
    called: "called",
    go: "Alt+click or the pin on the timeline: go there",
    /** The facts line: tsumogiri or from hand, riichi tile, after riichi, called. */
    facts: (items: readonly string[]) => items.join("\u00a0· "),
  },
  menu: {
    speed: "Speed",
    settingsLanguage: "Settings and language",
  },
  transport: {
    label: "Replay controls",
    prevTurn: "Previous own turn",
    nextTurn: "Next own turn",
    prevMoment: "Previous call, riichi or kita",
    nextMoment: "Next call, riichi or kita",
    autoplay: "Autoplay",
    speed: (x: number) => `Autoplay speed: ${x}×`,
    speedValue: (x: number) => `${x}×`,
    turn: (n: number) => `Turn ${n}`,
    turnPrefix: (n: number) => `Turn ${n} · `,
    counter: (step: number, total: number) => `Step ${step} / ${total}`,
    backLabel: (round: string, turn: number) => `${round} · turn ${turn}`,
    back: (label: string) => `Back to ${label}`,
    backTitle: "Back to where you were (Backspace)",
    resultPrefix: "Result · ",
  },
  help: {
    heading: "Controls",
    close: "Close",
    keyboard: "Keyboard",
    mouse: "Mouse",
    touch: "Touch",
    step: "Next / previous step",
    ownTurn: "Next / previous own turn (draws and calls of the point of view)",
    moment: "Next / previous call, riichi, kan or kita",
    nextRound: "Next round",
    roundStart: "Start of this round, then the previous round",
    roundEnds: "Round start / round result",
    back: "Back to where you jumped from",
    autoplay: "Autoplay on / off",
    speed: "Autoplay faster / slower",
    seat: "View from seat 1–4 (1–3 in three-player games)",
    cycleSeat: "View from the next / previous player",
    hands: "Show / hide all hands",
    view: "3D / flat table",
    rounds: "Round list",
    helpKey: "This help",
    escape: "Close menus, hide the round result, stop autoplay",
    click: "Click the table: next step",
    rightClick: "Right-click (or Ctrl+click): previous step",
    shiftClick: "Shift+click / Shift+right-click: next / previous own turn",
    hold: "Press and hold: fast-forward or rewind",
    wheel: "Mouse wheel over the table or the controls below it: step; with Shift: own turn",
    hover: "Point at a tile: highlight every copy of it",
    altClick: "Alt+click a discard: go to that moment",
    backButton: "Mouse back button: back to where you jumped from",
    pov: "Players list or the toolbar's seat menu: view from that player's seat",
    timeline: "Click or drag the timeline to jump",
    tap: "Tap the table: next step",
    swipe: "Swipe left / right: next / previous step",
    longPress: "Touch and hold: fast-forward",
    note: "Text fields, select boxes, the timeline slider and tabs keep their own keys. Holding, key repeat, fast wheel turns and autoplay stop at each round result; press again to go on.",
  },
  timeline: {
    stepSlider: "Step in this round",
    stepValue: (step: number, total: number, turn: number, text: string) =>
      `Step ${step} of ${total}, turn ${turn}: ${text}`,
    roundTip: (round: string, result: string) => `${round} · ${result}`,
    kitaMark: "N",
    pinLabel: (name: string, n: number) => `Go to ${name}'s ${ordinal(n)} discard`,
  },
  panel: {
    label: "Game review",
    hide: "Hide review panel",
    source: (format: string, date: string | null) => (date ? `${format} · ${date}` : format),
    players: "Players",
    unseen: (name: string) => `Unseen from ${name}`,
    unseenTotal: (n: number) => count(n, "tile", "tiles"),
    unseenCell: (tile: string, n: number, dora: boolean) =>
      `${tile}: ${n} unseen${dora ? ", dora" : ""}`,
    rounds: "Rounds",
    round: "Round",
    final: "Final",
    legendWon: "won",
    legendDealtIn: "dealt in",
    legendTenpai: "tenpai",
    legendRiichi: "riichi",
    outcome: { ron: "Ron", tsumo: "Tsumo", draw: "Draw" },
    goToRound: (round: string) => `Go to ${round}`,
    cellLabel: (
      round: string,
      name: string,
      delta: string,
      facts: readonly string[],
      target: string,
    ) => `${round}, ${name}: ${delta}${more(facts)}. ${target}`,
    facts: {
      ronWin: "won by ron",
      tsumoWin: "won by tsumo",
      dealtIn: "dealt in",
      tenpai: "tenpai",
      riichi: "riichi",
    },
    targets: {
      dealIn: "Go to the discard that dealt in",
      win: "Go to the win",
      riichi: "Go to the riichi",
      start: "Go to the round start",
    },
    moves: "Moves in this round",
    movesFilter: (tile: string, n: number) => `${tile} (${n})`,
    movesShowRest: "Show the rest of this round",
    movesHidden: (n: number) => `${count(n, "later move", "later moves")} hidden`,
    turnShort: (n: number) => `T${n}`,
    note: {
      draw: "draws",
      discard: "discard",
      tsumo: "tsumo",
      ron: "ron",
      drawEnd: "draw",
    },
    moveRow: (turn: number, name: string | null, tile: string | null, notes: readonly string[]) => {
      const head = name === null ? `Turn ${turn}` : `Turn ${turn}, ${name}`;
      const body = tile === null ? notes : [tile, ...notes];
      return body.length === 0 ? head : `${head}: ${body.join(", ")}`;
    },
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
