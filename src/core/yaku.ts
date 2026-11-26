/**
 * Canonical yaku keys and lookups from each log format. Display names live in the i18n messages.
 * TENHOU_YAKU is ordered by Tenhou's yaku id (the index), as used by mjlog `yaku`/`yakuman` attributes.
 */
const TENHOU_YAKU = [
  ["menzenTsumo", "門前清自摸和"],
  ["riichi", "立直"],
  ["ippatsu", "一発"],
  ["chankan", "槍槓"],
  ["rinshanKaihou", "嶺上開花"],
  ["haiteiRaoyue", "海底摸月"],
  ["houteiRaoyui", "河底撈魚"],
  ["pinfu", "平和"],
  ["tanyao", "断幺九"],
  ["iipeikou", "一盃口"],
  ["seatWindEast", "自風 東"],
  ["seatWindSouth", "自風 南"],
  ["seatWindWest", "自風 西"],
  ["seatWindNorth", "自風 北"],
  ["roundWindEast", "場風 東"],
  ["roundWindSouth", "場風 南"],
  ["roundWindWest", "場風 西"],
  ["roundWindNorth", "場風 北"],
  ["haku", "役牌 白"],
  ["hatsu", "役牌 發"],
  ["chun", "役牌 中"],
  ["doubleRiichi", "両立直"],
  ["chiitoitsu", "七対子"],
  ["chanta", "混全帯幺九"],
  ["ittsu", "一気通貫"],
  ["sanshokuDoujun", "三色同順"],
  ["sanshokuDoukou", "三色同刻"],
  ["sankantsu", "三槓子"],
  ["toitoi", "対々和"],
  ["sanankou", "三暗刻"],
  ["shousangen", "小三元"],
  ["honroutou", "混老頭"],
  ["ryanpeikou", "二盃口"],
  ["junchan", "純全帯幺九"],
  ["honitsu", "混一色"],
  ["chinitsu", "清一色"],
  ["renhou", "人和"],
  ["tenhou", "天和"],
  ["chiihou", "地和"],
  ["daisangen", "大三元"],
  ["suuankou", "四暗刻"],
  ["suuankouTanki", "四暗刻単騎"],
  ["tsuuiisou", "字一色"],
  ["ryuuiisou", "緑一色"],
  ["chinroutou", "清老頭"],
  ["chuurenPoutou", "九蓮宝燈"],
  ["junseiChuurenPoutou", "純正九蓮宝燈"],
  ["kokushiMusou", "国士無双"],
  ["kokushiMusou13", "国士無双１３面"],
  ["daisuushii", "大四喜"],
  ["shousuushii", "小四喜"],
  ["suukantsu", "四槓子"],
  ["dora", "ドラ"],
  ["uraDora", "裏ドラ"],
  ["akaDora", "赤ドラ"],
] as const;

/** Generic keys for sources that do not say which wind or dragon a yakuhai is. */
const GENERIC_KEYS = ["seatWind", "roundWind", "yakuhai"] as const;

/**
 * Yaku with no Tenhou id. Nukidora (抜きドラ, the han of set-aside North tiles in three-player
 * games): Tenhou counts it inside ドラ, but Mahjong Soul logs converted by tensoul list it apart.
 */
const EXTRA_KEYS = ["nukidora"] as const;

export type YakuKey =
  | (typeof TENHOU_YAKU)[number][0]
  | (typeof GENERIC_KEYS)[number]
  | (typeof EXTRA_KEYS)[number];

export const YAKU_KEYS: readonly YakuKey[] = [
  ...TENHOU_YAKU.map(([key]) => key),
  ...GENERIC_KEYS,
  ...EXTRA_KEYS,
];

export function yakuKeyFromTenhouId(id: number): YakuKey | undefined {
  return TENHOU_YAKU[id]?.[0];
}

/** Collapses the spelling differences seen in Tenhou names: spaces, colons, full-width digits. */
function normalizeTenhouName(name: string): string {
  return name
    .replace(/[\s:：　]/g, "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

/**
 * Other Japanese spellings found in tenhou.net/6 logs: tensoul (Equim-chan/tensoul) converts
 * Mahjong Soul logs with Mahjong Soul's own yaku names, which do not say which wind a wind yakuhai is.
 */
const TENHOU_NAME_ALIASES: ReadonlyArray<readonly [YakuKey, string]> = [
  ["seatWind", "役牌:自風牌"],
  ["roundWind", "役牌:場風牌"],
  ["doubleRiichi", "ダブル立直"],
  ["kokushiMusou13", "国士無双十三面待ち"],
  ["nukidora", "抜きドラ"],
];

const TENHOU_NAME_TO_KEY = new Map<string, YakuKey>(
  [...TENHOU_YAKU, ...TENHOU_NAME_ALIASES].map(([key, name]) => [normalizeTenhouName(name), key]),
);

/** Looks up a Tenhou yaku name such as "立直" or "役牌 中" (without the "(1飜)" suffix). */
export function yakuKeyFromTenhouName(name: string): YakuKey | undefined {
  return TENHOU_NAME_TO_KEY.get(normalizeTenhouName(name));
}

const KEY_TO_TENHOU_NAME = new Map<YakuKey, string>(
  [...TENHOU_NAME_ALIASES, ...TENHOU_YAKU].map(([key, name]) => [key, name]),
);

/**
 * The Japanese name tenhou.net/6 JSON writes for a yaku ("立直", "役牌 中"), or the spelling
 * yakuKeyFromTenhouName reads for keys Tenhou itself has no name for (the generic wind yakuhai and
 * nukidora, as tensoul writes them). Undefined for the generic "yakuhai".
 */
export function tenhouYakuName(key: YakuKey): string | undefined {
  return KEY_TO_TENHOU_NAME.get(key);
}

/**
 * Yaku names used by mjai hora events. gimite/mjai (lib/mjai/hora.rb) writes "reach" and
 * "double_reach"; the "riichi" spellings are accepted too.
 */
const MJAI_NAME_TO_KEY = new Map<string, YakuKey>([
  ["menzenchin_tsumoho", "menzenTsumo"],
  ["reach", "riichi"],
  ["riichi", "riichi"],
  ["ippatsu", "ippatsu"],
  ["chankan", "chankan"],
  ["rinshankaiho", "rinshanKaihou"],
  ["haiteiraoyue", "haiteiRaoyue"],
  ["hoteiraoyui", "houteiRaoyui"],
  ["pinfu", "pinfu"],
  ["tanyaochu", "tanyao"],
  ["ipeko", "iipeikou"],
  ["jikaze", "seatWind"],
  ["bakaze", "roundWind"],
  ["sangenpai", "yakuhai"],
  ["double_reach", "doubleRiichi"],
  ["double_riichi", "doubleRiichi"],
  ["chitoitsu", "chiitoitsu"],
  ["honchantaiyao", "chanta"],
  ["ikkitsukan", "ittsu"],
  ["sanshokudojun", "sanshokuDoujun"],
  ["sanshokudoko", "sanshokuDoukou"],
  ["sankantsu", "sankantsu"],
  ["toitoiho", "toitoi"],
  ["sananko", "sanankou"],
  ["shosangen", "shousangen"],
  ["honroto", "honroutou"],
  ["ryanpeko", "ryanpeikou"],
  ["junchantaiyao", "junchan"],
  ["honiso", "honitsu"],
  ["chiniso", "chinitsu"],
  ["renho", "renhou"],
  ["tenho", "tenhou"],
  ["chiho", "chiihou"],
  ["daisangen", "daisangen"],
  ["suanko", "suuankou"],
  ["suanko_tanki", "suuankouTanki"],
  ["tsuiso", "tsuuiisou"],
  ["ryuiso", "ryuuiisou"],
  ["chinroto", "chinroutou"],
  ["churenpoton", "chuurenPoutou"],
  ["junsei_churenpoton", "junseiChuurenPoutou"],
  ["kokushimuso", "kokushiMusou"],
  ["kokushimuso_13", "kokushiMusou13"],
  ["daisushi", "daisuushii"],
  ["shosushi", "shousuushii"],
  ["sukantsu", "suukantsu"],
  ["dora", "dora"],
  ["uradora", "uraDora"],
  ["akadora", "akaDora"],
]);

export function yakuKeyFromMjaiName(name: string): YakuKey | undefined {
  return MJAI_NAME_TO_KEY.get(name);
}
