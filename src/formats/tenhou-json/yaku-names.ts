/**
 * Fallback lookup for yaku names written in romaji or English, as found in tenhou.net/6 logs
 * exported in English or converted from other clients (e.g. "Riichi(1飜)", "Ura Dora(0飜)"; tensoul
 * writes Mahjong Soul's English names such as "Four Little Winds" when set to English).
 * Names are compared lowercased with everything but letters and digits removed.
 */

import type { YakuKey } from "../../core/yaku";

const NAMES: ReadonlyArray<[YakuKey, readonly string[]]> = [
  ["menzenTsumo", ["menzentsumo", "menzenchintsumohou", "fullyconcealedhand", "selfdraw"]],
  ["riichi", ["riichi", "reach"]],
  ["ippatsu", ["ippatsu"]],
  ["chankan", ["chankan", "robbingakan", "robbingthekan"]],
  ["rinshanKaihou", ["rinshankaihou", "rinshan", "afterakan", "deadwalldraw"]],
  ["haiteiRaoyue", ["haiteiraoyue", "haitei", "underthesea"]],
  ["houteiRaoyui", ["houteiraoyui", "houtei", "undertheriver"]],
  ["pinfu", ["pinfu"]],
  ["tanyao", ["tanyao", "allsimples"]],
  ["iipeikou", ["iipeikou", "puredoublesequence"]],
  ["seatWindEast", ["seatwindeast", "jikazeton"]],
  ["seatWindSouth", ["seatwindsouth", "jikazenan"]],
  ["seatWindWest", ["seatwindwest", "jikazesha"]],
  ["seatWindNorth", ["seatwindnorth", "jikazepei"]],
  ["roundWindEast", ["roundwindeast", "prevalentwindeast", "bakazeton"]],
  ["roundWindSouth", ["roundwindsouth", "prevalentwindsouth", "bakazenan"]],
  ["roundWindWest", ["roundwindwest", "prevalentwindwest", "bakazesha"]],
  ["roundWindNorth", ["roundwindnorth", "prevalentwindnorth", "bakazepei"]],
  ["haku", ["yakuhaihaku", "haku", "whitedragon"]],
  ["hatsu", ["yakuhaihatsu", "hatsu", "greendragon"]],
  ["chun", ["yakuhaichun", "chun", "reddragon"]],
  ["doubleRiichi", ["doubleriichi", "doublereach", "dabururiichi"]],
  ["chiitoitsu", ["chiitoitsu", "chiitoi", "sevenpairs"]],
  ["chanta", ["chanta", "honchantaiyaochuu", "halfoutsidehand"]],
  ["ittsu", ["ittsu", "ikkitsuukan", "purestraight"]],
  ["sanshokuDoujun", ["sanshokudoujun", "sanshoku", "mixedtriplesequence"]],
  ["sanshokuDoukou", ["sanshokudoukou", "tripletriplets"]],
  ["sankantsu", ["sankantsu", "threequads"]],
  ["toitoi", ["toitoi", "toitoihou", "alltriplets"]],
  ["sanankou", ["sanankou", "threeconcealedtriplets"]],
  ["shousangen", ["shousangen", "littlethreedragons"]],
  ["honroutou", ["honroutou", "allterminalsandhonors"]],
  ["ryanpeikou", ["ryanpeikou", "twicepuredoublesequence"]],
  ["junchan", ["junchan", "junchantaiyaochuu", "fullyoutsidehand"]],
  ["honitsu", ["honitsu", "halfflush"]],
  ["chinitsu", ["chinitsu", "fullflush"]],
  ["renhou", ["renhou", "blessingofman", "handofman"]],
  ["tenhou", ["tenhou", "blessingofheaven"]],
  ["chiihou", ["chiihou", "blessingofearth"]],
  ["daisangen", ["daisangen", "bigthreedragons"]],
  ["suuankou", ["suuankou", "fourconcealedtriplets"]],
  ["suuankouTanki", ["suuankoutanki", "singlewaitfourconcealedtriplets"]],
  ["tsuuiisou", ["tsuuiisou", "allhonors"]],
  ["ryuuiisou", ["ryuuiisou", "allgreen"]],
  ["chinroutou", ["chinroutou", "allterminals"]],
  ["chuurenPoutou", ["chuurenpoutou", "ninegates"]],
  ["junseiChuurenPoutou", ["junseichuurenpoutou", "trueninegates", "pureninegates"]],
  ["kokushiMusou", ["kokushimusou", "thirteenorphans"]],
  ["kokushiMusou13", ["kokushimusou13", "kokushimusoujuusanmen", "thirteenwaitthirteenorphans"]],
  ["daisuushii", ["daisuushii", "bigfourwinds", "fourbigwinds"]],
  ["shousuushii", ["shousuushii", "littlefourwinds", "fourlittlewinds"]],
  ["suukantsu", ["suukantsu", "fourquads"]],
  ["dora", ["dora"]],
  ["uraDora", ["uradora"]],
  ["akaDora", ["akadora", "reddora", "redfive", "redfives"]],
  ["seatWind", ["seatwind", "jikaze"]],
  ["roundWind", ["roundwind", "prevalentwind", "bakaze"]],
  ["yakuhai", ["yakuhai", "dragon"]],
];

const NAME_TO_KEY = new Map<string, YakuKey>(
  NAMES.flatMap(([key, names]) => names.map((name): [string, YakuKey] => [name, key])),
);

export function yakuKeyFromEnglishName(name: string): YakuKey | undefined {
  return NAME_TO_KEY.get(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
}
