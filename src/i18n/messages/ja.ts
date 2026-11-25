import type { Suit } from "../../core/tile";
import type { Messages } from "./en";

const WINDS = ["東", "南", "西", "北"];
const SUITS: Record<Suit, string> = { m: "萬", p: "筒", s: "索" };
const NUMERALS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 天鳳の段位 (PlayerInfo.danIndex): 新人、9級〜1級、初段〜十段、天鳳位。 */
function dan(index: number): string {
  if (index <= 0) {
    return "新人";
  }
  if (index < 10) {
    return `${10 - index}級`;
  }
  if (index === 10) {
    return "初段";
  }
  return index < 19 ? `${NUMERALS[index - 9]}段` : index === 19 ? "十段" : "天鳳位";
}

export const ja: Messages = {
  app: {
    title: "麻雀牌譜ビューア",
    tagline: "天鳳と mjai の牌譜をブラウザで閲覧できます。",
    newLog: "別の牌譜を開く",
  },
  settings: {
    language: "言語",
  },
  load: {
    heading: "牌譜を開く",
    intro:
      "牌譜ファイルをページ上のどこかにドロップするか、ファイルを選択するか、牌譜データまたは天鳳のリンクを貼り付けてください。",
    chooseFile: "ファイルを選択",
    pasteLabel: "牌譜データまたは天鳳のリンクを貼り付け",
    pastePlaceholder: "tenhou.net/6 JSON、mjai JSONL、mjlog XML、天鳳の牌譜リンク",
    loadButton: "読み込む",
    pasteAnywhere:
      "ページ上のどこでも Ctrl+V（Mac は ⌘V）を押すと、コピーした牌譜や天鳳のリンクをそのまま読み込めます。",
    formatsHeading: "対応形式",
    formats: [
      "天鳳の牌譜リンクと牌譜ID（例: https://tenhou.net/0/?log=…。牌譜は tenhou.net からダウンロードします）",
      "tenhou.net/6 JSON、または #json= を含む tenhou.net/6 のリンク",
      "mjai JSONL（1 行に 1 イベント）",
      "天鳳 mjlog XML（.xml または .mjlog、gzip 圧縮の有無は問いません）",
    ],
    fourPlayerOnly: "四人打ちのみ対応しています。",
    privacy:
      "牌譜はブラウザ内で読み込まれ、どこにもアップロードされません。天鳳のリンクを貼り付けると、その牌譜を tenhou.net からダウンロードします。",
    samplesHeading: "サンプルを開く",
    samples: {
      "tenhou-json": "短い対局（tenhou.net/6 JSON）",
    },
    loading: "牌譜を読み込んでいます…",
    dropOverlay: "ここにドロップすると牌譜を開きます",
  },
  errors: {
    title: "牌譜を開けませんでした",
    dismiss: "閉じる",
    codes: {
      empty: "読み込む内容がありません。ファイルまたは貼り付けたテキストが空です。",
      unrecognized:
        "対応していない形式です。tenhou.net/6 JSON、mjai JSONL、天鳳 mjlog XML を使用してください。",
      urlOnly:
        "これは牌譜そのものではなく、牌譜へのリンクです。このビューアが直接ダウンロードできるのは天鳳のリンクの牌譜だけなので、牌譜データを保存するかコピーしてください。",
      decompress:
        "圧縮ファイルを展開できませんでした。ファイルが壊れているか、途中までしか保存されていない可能性があります。",
      invalid: "形式は判別できましたが、牌譜が壊れているか不完全なため読み込めませんでした。",
      unsupportedPlayers: "四人打ちのみ対応しています。三人打ち（サンマ）の牌譜は表示できません。",
      readFailed: "ファイルを読み込めませんでした。",
      fetchFailed: "牌譜をダウンロードできませんでした。接続を確認して、もう一度お試しください。",
      tenhouFetchFailed:
        "この天鳳のリンクの牌譜を tenhou.net からダウンロードできませんでした。リンクと接続を確認して、もう一度お試しください。",
      tooLarge: "牌譜としては大きすぎるため、開きませんでした。",
      unexpected: "牌譜の読み込み中に問題が発生しました。",
    },
    linkHelp: [
      "天鳳: tenhou.net/0/log/?<牌譜ID> を開いてください。牌譜IDは牌譜リンクの log= の後から次の & の前までの部分です（例: 2000010100gm-0089-0000-0123abcd）。Ctrl+S（Mac は ⌘S）でページを保存してここにドロップするか、全体を選択してコピーし、ここに貼り付けてください。",
      "雀魂（Mahjong Soul）: このビューアは雀魂の牌譜をダウンロードできません。tensoul などのツールで牌譜を tenhou.net/6 JSON に変換し、その結果を開くか貼り付けてください。",
      "tenhou.net/6: #json= を含むリンクには牌譜が含まれているので、そのまま貼り付けられます。",
      "mjai: AI やサーバーが保存した .json または .jsonl ファイルを開いてください。",
    ],
    tenhouSaveHelp:
      "手動で開くには、下の牌譜データを新しいタブで開き、Ctrl+S（Mac は ⌘S）でページを保存してここにドロップするか、全体を選択してコピーし、ここに貼り付けてください。",
    logDataLink: "牌譜データ（新しいタブで開きます）:",
    replayFailed:
      "この局を再生できませんでした。牌譜が壊れているか、このビューアが対応していないルールの可能性があります。",
  },
  viewer: {
    gameInfo: "対局情報",
    formats: {
      "tenhou-json": "tenhou.net/6 JSON",
      mjlog: "天鳳 mjlog XML",
      mjai: "mjai JSONL",
    },
    length: { east: "東風戦", south: "東南戦" },
    rooms: { general: "一般卓", upper: "上級卓", special: "特上卓", phoenix: "鳳凰卓" },
    openTanyao: "喰いタンあり",
    noOpenTanyao: "喰いタンなし",
    redFives: "赤あり",
    noRedFives: "赤なし",
    fast: "高速",
    dan,
    rating: (rating: number) => `R${rating}`,
    unnamed: (seat: number) => `プレイヤー${seat + 1}`,
    round: "局",
    pov: "視点",
    showAllHands: "全員の手牌を表示",
    stepSlider: "進行",
    stepCounter: (step: number, total: number) => `進行 ${step} / ${total}`,
    firstStep: "最初へ",
    prevStep: "1 手戻る",
    nextStep: "1 手進む",
    lastStep: "最後へ",
    prevRound: "前の局",
    nextRound: "次の局",
    playback: "再生操作",
    shortcuts: "キーボードショートカット",
    shortcutStep: "1 手戻る / 進む",
    shortcutRound: "前の局 / 次の局",
    shortcutEnds: "最初 / 最後",
    shortcutsNote:
      "テキスト欄、選択ボックス、進行スライダーでは、これらのキーはその操作に使われます。スライダーは現在の局の中だけで動きます。",
  },
  board: {
    table: "麻雀卓",
    hand: (name: string) => `${name}の手牌`,
    melds: (name: string) => `${name}の副露`,
    discards: (name: string) => `${name}の捨て牌`,
    drawn: (tile: string) => `${tile}（ツモ牌）`,
    tsumogiri: (tile: string) => `${tile}、ツモ切り`,
    riichiDiscard: (tile: string) => `${tile}、立直宣言牌`,
    calledDiscard: (tile: string) => `${tile}、鳴かれた牌`,
    lastDiscard: (tile: string) => `${tile}、最後の捨て牌`,
    meld: (kind: string, tiles: string) => `${kind}: ${tiles}`,
    honba: "本場",
    riichiSticks: "供託リーチ棒",
    dora: "ドラ表示牌",
    wall: (count: number) => `残り ${count} 枚`,
    wallShort: (count: number) => `残り${count}枚`,
    riichi: "立直",
    dealer: "親",
    windsShort: WINDS,
  },
  calls: {
    chi: "チー",
    pon: "ポン",
    daiminkan: "大明槓",
    ankan: "暗槓",
    kakan: "加槓",
  },
  round: {
    winds: WINDS,
    name: (wind: number, number: number, honba: number) =>
      `${WINDS[wind] ?? ""}${number}局${honba > 0 ? ` ${honba}本場` : ""}`,
  },
  event: {
    deal: (round: string) => `${round} 配牌`,
    draw: (player: string, tile: string | null) =>
      tile === null ? `${player} ツモ` : `${player} ツモ: ${tile}`,
    discard: (player: string, tile: string) => `${player} 打牌: ${tile}`,
    tsumogiri: (player: string, tile: string) => `${player} ツモ切り: ${tile}`,
    riichi: (player: string, tile: string) => `${player} 立直宣言: ${tile}`,
    riichiAccepted: (player: string) => `${player} 立直成立`,
    call: (player: string, call: string, tile: string) => `${player} ${call}: ${tile}`,
    kan: (player: string, call: string, tile: string) => `${player} ${call}: ${tile}`,
    dora: (tile: string) => `新ドラ表示牌: ${tile}`,
    tsumo: (player: string) => `${player} ツモ和了`,
    ron: (player: string, from: string) => `${player} ロン和了（${from} 放銃）`,
  },
  result: {
    heading: "局の結果",
    tsumo: "ツモ",
    ronFrom: (from: string) => `ロン（${from} 放銃）`,
    han: (han: number) => `${han}飜`,
    fu: (fu: number) => `${fu}符`,
    points: (points: string) => `${points}点`,
    limits: {
      mangan: "満貫",
      haneman: "跳満",
      baiman: "倍満",
      sanbaiman: "三倍満",
      yakuman: "役満",
    },
    yakuman: (count: number) => (count === 1 ? "役満" : `${count}倍役満`),
    yaku: "役",
    unknownYaku: "不明な役",
    winningHand: "和了形",
    winningTile: "和了牌",
    uraIndicators: "裏ドラ表示牌",
    pao: (player: string) => `責任払い（パオ）: ${player}`,
    deltas: "点数移動",
    player: "プレイヤー",
    change: "増減",
    tenpai: "聴牌",
    noten: "不聴",
    noTenpai: "全員不聴でした。",
  },
  ryukyoku: {
    exhaustive: "荒牌流局",
    nagashiMangan: "流し満貫",
    kyuushuKyuuhai: "九種九牌",
    suufonRenda: "四風連打",
    suuchaRiichi: "四家立直",
    suukaikan: "四槓散了",
    sanchaHou: "三家和",
    unknown: "流局",
  },
  standings: {
    heading: "最終順位",
    place: (place: number) => `${place}位`,
    points: "持ち点",
  },
  tiles: {
    number: (value: number, suit: Suit, red: boolean) =>
      `${red ? "赤" : ""}${NUMERALS[value] ?? String(value)}${SUITS[suit]}`,
    honors: ["東", "南", "西", "北", "白", "發", "中"],
    unknown: "不明な牌",
    back: "伏せた牌",
  },
  yaku: {
    menzenTsumo: "門前清自摸和",
    riichi: "立直",
    ippatsu: "一発",
    chankan: "槍槓",
    rinshanKaihou: "嶺上開花",
    haiteiRaoyue: "海底摸月",
    houteiRaoyui: "河底撈魚",
    pinfu: "平和",
    tanyao: "断幺九",
    iipeikou: "一盃口",
    seatWindEast: "自風 東",
    seatWindSouth: "自風 南",
    seatWindWest: "自風 西",
    seatWindNorth: "自風 北",
    roundWindEast: "場風 東",
    roundWindSouth: "場風 南",
    roundWindWest: "場風 西",
    roundWindNorth: "場風 北",
    haku: "役牌 白",
    hatsu: "役牌 發",
    chun: "役牌 中",
    doubleRiichi: "両立直",
    chiitoitsu: "七対子",
    chanta: "混全帯幺九",
    ittsu: "一気通貫",
    sanshokuDoujun: "三色同順",
    sanshokuDoukou: "三色同刻",
    sankantsu: "三槓子",
    toitoi: "対々和",
    sanankou: "三暗刻",
    shousangen: "小三元",
    honroutou: "混老頭",
    ryanpeikou: "二盃口",
    junchan: "純全帯幺九",
    honitsu: "混一色",
    chinitsu: "清一色",
    renhou: "人和",
    tenhou: "天和",
    chiihou: "地和",
    daisangen: "大三元",
    suuankou: "四暗刻",
    suuankouTanki: "四暗刻単騎",
    tsuuiisou: "字一色",
    ryuuiisou: "緑一色",
    chinroutou: "清老頭",
    chuurenPoutou: "九蓮宝燈",
    junseiChuurenPoutou: "純正九蓮宝燈",
    kokushiMusou: "国士無双",
    kokushiMusou13: "国士無双１３面",
    daisuushii: "大四喜",
    shousuushii: "小四喜",
    suukantsu: "四槓子",
    dora: "ドラ",
    uraDora: "裏ドラ",
    akaDora: "赤ドラ",
    seatWind: "自風",
    roundWind: "場風",
    yakuhai: "役牌",
  },
};
