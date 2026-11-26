/**
 * A synthetic three-player tonpuu (三般東喰赤) for the cross-format tests, with every event and
 * result kind a three-player log can have. It is invented, not taken from any real game, and its
 * scoring is real: every winning hand is complete on its winning tile, its yaku, han, fu and points
 * follow Tenhou's rules (tsumo loss, honba 200 per ron and 100 per payer on tsumo, noten payments
 * of 2000 in all, set-aside Norths counted inside ドラ), the tenpai seats of each exhaustive draw
 * really are tenpai, and checkGame finds no issue. No round has a 1m or 9m dora indicator, so the
 * three-player 1m-to-9m dora wrap is left to the tile tests.
 *
 * - East 1: the dealer (seat 0) sets aside a North from the hand, pons seat 1's discard (from the
 *   right) and seat 2's (from across the empty chair); seat 1 declares riichi; seat 2 sets aside two
 *   Norths in a row, each drawn; the dealer wins by ron on seat 1's tsumogiri (haku, dora 2).
 * - East 1, honba 1: seat 0 declares an ankan; seat 2 pons from the left, adds to it (kakan), then
 *   sets aside a North and wins on the replacement draw (rinshan, hatsu, honitsu, dora 2 from a
 *   North when North is dora: haneman).
 * - East 2: seat 0 declares riichi on a North wait and wins by ron on the North seat 2 sets aside
 *   (riichi, ittsu, red five, ura dora: mangan).
 * - East 3: the dealer declares riichi on the first discard (a double riichi, which the draw never
 *   scores); the wall runs out after 55 draws with only the dealer tenpai.
 * - East 3, honba 1: exhaustive draw with the dealer and seat 0 tenpai.
 * - East 3, honba 2: the dealer declares kyuushu kyuuhai.
 * - East 3, honba 3: seat 1 wins by tsumo (menzen tsumo, pinfu, tanyao, red five) and collects
 *   the riichi deposit left from East 3. Final scores 42100, 27600, 35300.
 */
import type { GameLog, Seat } from "../core/model";
import type { KnownTile } from "../core/tile";
import {
  ankan,
  discard,
  dora,
  draw,
  kakan,
  kita,
  makeSanmaGame,
  makeSanmaRound,
  pon,
  riichiAccepted,
  ryukyoku,
  tiles,
  tsumogiri,
  wallRound,
  win,
} from "./round-builder";

/**
 * The wall of a round dealt to these three hands (by seat), with this indicator and these draws in
 * order: the shape `wallRound({ wall })` deals from.
 */
function designedWall(
  dealer: Seat,
  hands: [string, string, string],
  indicator: KnownTile,
  draws: string,
): KnownTile[] {
  const dealt = [0, 1, 2].flatMap((offset) => tiles(hands[(dealer + offset) % 3] as string));
  return [...dealt, indicator, ...tiles(draws)] as KnownTile[];
}

export function sanmaCrossFormatGame(): GameLog {
  const east1 = makeSanmaRound({
    doraIndicators: ["7s"],
    hands: [tiles("19m699p12378s455z"), tiles("9m1123456789p33z"), tiles("9m34p2456s125667z"), []],
    events: [
      draw(0, "2z"), // 0
      kita(0),
      draw(0, "6p"),
      discard(0, "1m"),
      draw(1, "3z"),
      discard(1, "9p"), // 5
      pon(0, 1, "9p", "99p"),
      discard(0, "2z"),
      draw(1, "8p"),
      discard(1, "9m", { riichi: true }),
      riichiAccepted(1), // 10
      draw(2, "4z"),
      kita(2),
      draw(2, "4z"),
      kita(2),
      draw(2, "8s"), // 15
      discard(2, "5z"),
      pon(0, 2, "5z", "55z"),
      discard(0, "9m"),
      draw(1, "9s"),
      tsumogiri(1, "9s"), // 20
      win(0, 1, [6800, -5800, 0, 0], {
        tile: "9s",
        hand: tiles("66p123789s"),
        han: 3,
        fu: 30,
        points: 5800,
        yaku: [
          { key: "haku", han: 1 },
          { key: "dora", han: 2 },
        ],
      }),
    ],
  });

  const east1Honba1 = makeSanmaRound({
    honba: 1,
    scores: [41800, 28200, 35000, 0],
    doraIndicators: ["3z"],
    hands: [tiles("9m11134577p18s33z"), tiles("19m2468p1238s567z"), tiles("1m9p2345699s1266z"), []],
    events: [
      draw(0, "1p"), // 0
      ankan(0, "1111p"),
      dora("8p"),
      draw(0, "6p"),
      discard(0, "9m"),
      draw(1, "7s"), // 5
      discard(1, "6z"),
      pon(2, 1, "6z", "66z"),
      discard(2, "1m"),
      draw(0, "2z"),
      tsumogiri(0, "2z"), // 10
      draw(1, "9p"),
      discard(1, "1m"),
      draw(2, "6z"),
      kakan(2, "6z"),
      draw(2, "7s"), // 15
      dora("5p"),
      discard(2, "9p"),
      draw(0, "4s"),
      tsumogiri(0, "4s"),
      draw(1, "5z"), // 20
      discard(1, "9m"),
      draw(2, "9s"),
      discard(2, "2z"),
      draw(0, "7z"),
      tsumogiri(0, "7z"), // 25
      draw(1, "1z"),
      discard(1, "2p"),
      draw(2, "4z"),
      kita(2),
      draw(2, "1z"), // 30
      win(2, 2, [-6100, -3100, 9200, 0], {
        tile: "1z",
        hand: tiles("234567999s11z"),
        han: 6,
        fu: 50,
        limit: "haneman",
        points: 9000,
        yaku: [
          { key: "rinshanKaihou", han: 1 },
          { key: "hatsu", han: 1 },
          { key: "honitsu", han: 2 },
          { key: "dora", han: 2 },
        ],
      }),
    ],
  });

  const east2 = makeSanmaRound({
    number: 2,
    dealer: 1,
    scores: [35700, 25100, 44200, 0],
    doraIndicators: ["6s"],
    hands: [tiles("12340678p999s14z"), tiles("119m23568s23567z"), tiles("9m23569p1147s126z"), []],
    events: [
      draw(1, "9s"), // 0
      tsumogiri(1, "9s"),
      draw(2, "4s"),
      discard(2, "9m"),
      draw(0, "5z"),
      tsumogiri(0, "5z"), // 5
      draw(1, "2p"),
      tsumogiri(1, "2p"),
      draw(2, "3s"),
      discard(2, "1z"),
      draw(0, "9p"), // 10
      discard(0, "1z", { riichi: true }),
      riichiAccepted(0),
      draw(1, "7p"),
      discard(1, "7z"),
      draw(2, "8s"), // 15
      discard(2, "2z"),
      draw(0, "3z"),
      tsumogiri(0, "3z"),
      draw(1, "1s"),
      discard(1, "8s"), // 20
      draw(2, "4z"),
      kita(2),
      win(0, 2, [9000, 0, -8000, 0], {
        tile: "4z",
        hand: tiles("12340678p9p999s44z"),
        uraIndicators: ["8p"],
        han: 5,
        fu: 40,
        limit: "mangan",
        points: 8000,
        yaku: [
          { key: "riichi", han: 1 },
          { key: "ittsu", han: 2 },
          { key: "akaDora", han: 1 },
          { key: "uraDora", han: 1 },
        ],
      }),
    ],
  });

  // Every seat discards what it draws; the waits of the tenpai seats are never drawn.
  const east3 = wallRound({
    playerCount: 3,
    wall: designedWall(
      2,
      ["199m2p589s123567z", "1m468p3679s23567z", "123456789p1123s"],
      "7s",
      "23s 63z 8p 8s 314z 9p 1m 45z 76s 2p 7z 9p 4z 2p 69s 7p 1z 0s 9m 8292s 7p 27z 34p 87s 4z 45p 6z 368p 55s 0p 9m 2z 6p 6s 5z 1m 11p",
    ),
    number: 3,
    dealer: 2,
    scores: [43700, 25100, 36200, 0],
    draws: 55,
    riichiAt: [0],
    kita: true,
    results: [ryukyoku("exhaustive", [-1000, -1000, 2000, 0], { tenpai: [2] })],
  });

  const east3Honba1 = wallRound({
    playerCount: 3,
    wall: designedWall(
      2,
      ["11p789p888s222z66z", "19m209p1069s1357z", "99m45p234567s111z"],
      "7s",
      "5z 4p 3z 3s 42p 2s 4p 89s 7z 6s 73z 2s 2p 2z 77p 92s 9p 5z 171s 9m 3s 434z 1m 6s 7z 14s 52p 45s 1m 8p 9s 5z 4s 89p 4z 5s 85p 7s 1m 4z 7p",
    ),
    number: 3,
    dealer: 2,
    honba: 1,
    riichiSticks: 1,
    scores: [42700, 24100, 37200, 0],
    draws: 55,
    kita: true,
    results: [ryukyoku("exhaustive", [1000, -2000, 1000, 0], { tenpai: [0, 2] })],
  });

  const east3Honba2 = makeSanmaRound({
    number: 3,
    dealer: 2,
    honba: 2,
    riichiSticks: 1,
    scores: [43700, 22100, 38200, 0],
    doraIndicators: ["8s"],
    hands: [
      tiles("1m5678p23456s466z"),
      tiles("9m2367p7789s1477z"),
      tiles("19m19p234p19s1235z"),
      [],
    ],
    events: [draw(2, "7z"), ryukyoku("kyuushuKyuuhai")],
  });

  const east3Honba3 = makeSanmaRound({
    number: 3,
    dealer: 2,
    honba: 3,
    riichiSticks: 1,
    scores: [43700, 22100, 38200, 0],
    doraIndicators: ["2z"],
    hands: [tiles("19m12469p29s1234z"), tiles("234567p345678s1z"), tiles("19m1889p19s23567z"), []],
    events: [
      draw(2, "4z"), // 0
      kita(2),
      draw(2, "7p"),
      discard(2, "1m"),
      draw(0, "3p"),
      discard(0, "9s"), // 5
      draw(1, "8s"),
      discard(1, "1z"),
      draw(2, "5z"),
      discard(2, "9m"),
      draw(0, "6z"), // 10
      tsumogiri(0, "6z"),
      draw(1, "0s"),
      win(1, 1, [-1600, 5500, -2900, 0], {
        tile: "0s",
        hand: tiles("234567p34567880s"),
        han: 4,
        fu: 20,
        points: 3900,
        yaku: [
          { key: "menzenTsumo", han: 1 },
          { key: "pinfu", han: 1 },
          { key: "tanyao", han: 1 },
          { key: "akaDora", han: 1 },
        ],
      }),
    ],
  });

  return makeSanmaGame([east1, east1Honba1, east2, east3, east3Honba1, east3Honba2, east3Honba3], {
    rules: {
      redFives: true,
      length: "east",
      room: "general",
      openTanyao: true,
      fast: false,
      description: "三般東喰赤",
    },
    finalScores: [42100, 27600, 35300, 0],
  });
}
