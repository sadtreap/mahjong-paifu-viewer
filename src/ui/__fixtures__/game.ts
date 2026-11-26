import type { GameLog, Quad, Round } from "../../core/model";
import type { BoardState, SeatView } from "../../replay/types";

/**
 * Hand-built four-player game with one short round, for UI tests: a tsumogiri, a riichi that is
 * accepted, a pon of the riichi tile, and a ron that collects one honba and the riichi stick.
 */
export const round: Round = {
  wind: 0,
  number: 1,
  dealer: 0,
  honba: 1,
  riichiSticks: 0,
  scores: [25000, 25000, 25000, 25000],
  doraIndicators: ["3m"],
  hands: [
    ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "2z", "2z", "3z", "4z"],
    ["9m", "2p", "3p", "4p", "0p", "6p", "7p", "8p", "9p", "1s", "1s", "2s", "3s"],
    ["9m", "9m", "1z", "5m", "6m", "7m", "3s", "4s", "5s", "6s", "7s", "8s", "2m"],
    ["1m", "1m", "0m", "4m", "6m", "1p", "1p", "2s", "4s", "6z", "6z", "7z", "7z"],
  ],
  events: [
    { type: "draw", seat: 0, tile: "5z" },
    { type: "discard", seat: 0, tile: "5z", tsumogiri: true, riichi: false },
    { type: "draw", seat: 1, tile: "2p" },
    { type: "discard", seat: 1, tile: "9m", tsumogiri: false, riichi: true },
    { type: "riichiAccepted", seat: 1 },
    { type: "pon", seat: 2, from: 1, tile: "9m", consumed: ["9m", "9m"] },
    { type: "discard", seat: 2, tile: "1z", tsumogiri: false, riichi: false },
    { type: "draw", seat: 3, tile: "7s" },
    { type: "discard", seat: 3, tile: "7s", tsumogiri: true, riichi: false },
    { type: "draw", seat: 0, tile: "1p" },
    { type: "discard", seat: 0, tile: "1p", tsumogiri: true, riichi: false },
    {
      type: "win",
      seat: 1,
      from: 0,
      deltas: [-4200, 5200, 0, 0],
      tile: "1p",
      hand: ["2p", "2p", "3p", "4p", "0p", "6p", "7p", "8p", "9p", "1s", "1s", "2s", "3s", "1p"],
      uraIndicators: ["5s"],
      han: 2,
      fu: 40,
      points: 3900,
      yaku: [
        { key: "riichi", han: 1 },
        { key: "akaDora", han: 1 },
      ],
    },
  ],
};

export const game: GameLog = {
  format: "tenhou-json",
  playerCount: 4,
  players: [
    { name: "A", rank: "四段", danIndex: 13, rating: 1913.4 },
    { name: "B" },
    { name: "C" },
    { name: "D" },
  ],
  rules: {
    redFives: true,
    length: "south",
    room: "phoenix",
    openTanyao: true,
    fast: false,
    description: "四鳳南喰赤",
  },
  rounds: [round],
};

function seat(view: Partial<SeatView> = {}): SeatView {
  return {
    hand: [],
    drawn: null,
    melds: [],
    kita: [],
    discards: [],
    score: 25000,
    riichi: false,
    ...view,
  };
}

/** A table state with hand-picked contents, independent of the replay engine. */
export function boardState(overrides: Partial<BoardState> = {}): BoardState {
  const seats: Quad<SeatView> = [
    seat({ hand: round.hands[0].slice(0, 12), drawn: "1p" }),
    seat({
      hand: round.hands[1],
      riichi: true,
      score: 24000,
      discards: [{ tile: "9m", tsumogiri: false, riichi: true, called: true }],
    }),
    seat({
      hand: round.hands[2].slice(2, 13),
      melds: [{ type: "pon", tiles: ["9m", "9m"], from: 1, calledTile: "9m" }],
      discards: [{ tile: "1z", tsumogiri: false, riichi: false, called: false }],
    }),
    seat({
      hand: round.hands[3],
      melds: [{ type: "ankan", tiles: ["0s", "5s", "5s", "5s"] }],
      discards: [{ tile: "7s", tsumogiri: true, riichi: false, called: false }],
    }),
  ];
  return {
    seats,
    doraIndicators: ["3m"],
    riichiSticks: 1,
    honba: 1,
    wallRemaining: 60,
    eventIndex: 8,
    lastEvent: round.events[8] ?? null,
    activeSeat: 3,
    results: [],
    ...overrides,
  };
}
