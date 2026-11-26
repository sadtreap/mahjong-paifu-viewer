import { describe, expect, it } from "vitest";
import type {
  GameLog,
  Quad,
  Round,
  RoundEvent,
  RyukyokuReason,
  Seat,
  WinEvent,
} from "../core/model";
import type { Tile } from "../core/tile";
import {
  ankan,
  chi,
  daiminkan,
  discard,
  dora,
  draw,
  kakan,
  kita,
  makeGame,
  makeRound,
  makeSanmaGame,
  makeSanmaRound,
  pon,
  riichiAccepted,
  ryukyoku,
  sampleRound,
  sampleSanmaGame,
  sampleSanmaRound,
  tiles,
  tsumogiri,
  wallDraw,
  wallRound,
  win,
} from "../test/round-builder";
import { checkGame, checkRound } from "./check";
import type { ReplayIssue } from "./types";

const unknownHands = (): Round["hands"] => [
  tiles("?????????????"),
  tiles("?????????????"),
  tiles("?????????????"),
  tiles("?????????????"),
];

/** The sample round with its events edited. */
function editSample(edit: (events: RoundEvent[], round: Round) => void): Round {
  const round = structuredClone(sampleRound());
  edit(round.events, round);
  return round;
}

function sampleWin(round: Round): WinEvent {
  const event = round.events[27];
  if (event?.type !== "win") {
    throw new Error("The sample round should end with a win");
  }
  return event;
}

const issue = (eventIndex: number, message: RegExp) => ({
  eventIndex,
  message: expect.stringMatching(message),
});

describe("checkRound", () => {
  it("accepts consistent rounds", () => {
    expect(checkRound(sampleRound())).toEqual([]);
    expect(checkRound(wallRound({ draws: 70, results: [ryukyoku("exhaustive")] }))).toEqual([]);
    const tenpai = ryukyoku("exhaustive", [1500, -1500, 1500, -1500], { tenpai: [0, 2] });
    expect(checkRound(wallRound({ draws: 70, riichiAt: [10], results: [tenpai] }))).toEqual([]);
    const tsumo = win(1, 1, [-2000, 4000, -1000, -1000], { tile: wallDraw(1) });
    expect(checkRound(wallRound({ draws: 2, keepLastDraw: true, results: [tsumo] }))).toEqual([]);
    const abort = ryukyoku("kyuushuKyuuhai");
    expect(checkRound(wallRound({ draws: 1, keepLastDraw: true, results: [abort] }))).toEqual([]);
  });

  it("accepts a round recorded from one seat", () => {
    const round = editSample((events, round) => {
      round.hands = [round.hands[0], ...unknownHands().slice(1)] as Round["hands"];
      for (const [index, event] of events.entries()) {
        if (event.type === "draw" && event.seat !== 0) {
          events[index] = draw(event.seat, "?");
        }
      }
    });
    expect(checkRound(round)).toEqual([]);
  });

  it("reports discards that are not in the hand", () => {
    const round = editSample((events) => {
      events[13] = discard(2, "2s");
    });
    expect(checkRound(round)).toEqual([
      issue(13, /^Seat 2 discards 2s, which is not in its hand$/),
    ]);
  });

  it("reports tsumogiri flags that contradict the drawn tile", () => {
    const fromHand = editSample((events) => {
      events[10] = discard(1, "4z");
    });
    expect(checkRound(fromHand)).toEqual([
      issue(10, /from the hand, but only its drawn tile is 4z/),
    ]);
    const otherTile = editSample((events) => {
      events[18] = tsumogiri(3, "3m");
    });
    expect(checkRound(otherTile)).toEqual([issue(18, /discards 3m as tsumogiri but drew 5m/)]);
    const afterCall = editSample((events) => {
      events[3] = tsumogiri(1, "9s");
    });
    expect(checkRound(afterCall)).toEqual([issue(3, /as tsumogiri without a drawn tile/)]);
  });

  it("reports a red five used in place of a plain five", () => {
    const call = editSample((events) => {
      events[2] = chi(1, 0, "3m", "45m");
    });
    expect(checkRound(call)).toEqual([issue(2, /^Seat 1 uses 5m for its chi but holds 0m$/)]);
    const round = makeRound({
      hands: [tiles("0m123456789p111z"), ...unknownHands().slice(1)] as Round["hands"],
      events: [draw(0, "2z"), discard(0, "5m"), ryukyoku("unknown")],
    });
    expect(checkRound(round)).toEqual([issue(1, /^Seat 0 discards 5m but holds 0m$/)]);
  });

  it("reports call tiles missing from the hand", () => {
    const round = editSample((_, round) => {
      round.hands[3] = tiles("234678m456p19s77z");
      round.events[4] = pon(3, 1, "9s", "99s");
    });
    expect(checkRound(round)).toEqual([
      issue(4, /^Seat 3 has no 9s for its pon$/),
      issue(5, /^Seat 3 holds 15 tiles before discarding, expected 14/),
    ]);
  });

  it("reports calls that do not take the latest discard", () => {
    const otherTile = editSample((events) => {
      events[3] = discard(1, "8p");
    });
    expect(checkRound(otherTile)).toEqual([issue(4, /calls 9s, but seat 1 discarded 8p/)]);
    const otherSeat = editSample((events) => {
      events[4] = pon(3, 2, "9s", "99s");
    });
    expect(checkRound(otherSeat)).toEqual([
      issue(4, /calls pon from seat 2, but the last discard was by seat 1/),
    ]);
    const late = makeRound({
      hands: unknownHands(),
      events: [draw(0, "6z"), tsumogiri(0, "6z"), draw(1, "?"), pon(3, 0, "6z", "66z")],
    });
    expect(checkRound(late)).toContainEqual(issue(3, /no discard to call/));
    const own = makeRound({
      hands: unknownHands(),
      events: [draw(0, "6z"), tsumogiri(0, "6z"), pon(0, 0, "6z", "66z")],
    });
    expect(checkRound(own)).toContainEqual(issue(2, /calls pon on its own discard/));
  });

  it("checks the shape of chi, pon and daiminkan", () => {
    const callOnDiscard = (call: RoundEvent) =>
      checkRound(
        makeRound({
          hands: unknownHands(),
          events: [draw(0, "?"), tsumogiri(0, "3s"), call, ryukyoku("unknown")],
        }),
      );
    expect(callOnDiscard(chi(1, 0, "3s", "24s"))).toEqual([]);
    expect(callOnDiscard(chi(1, 0, "3s", "40s"))).toEqual([]);
    expect(callOnDiscard(pon(2, 0, "3s", "33s"))).toEqual([]);
    expect(callOnDiscard(daiminkan(3, 0, "3s", "333s"))).toEqual([]);
    for (const consumed of ["45p", "46s", "12z"]) {
      expect(callOnDiscard(chi(1, 0, "3s", consumed))).toEqual([issue(2, /is not a sequence/)]);
    }
    expect(callOnDiscard(chi(2, 0, "3s", "24s"))).toEqual([
      issue(2, /^Seat 2 calls chi from seat 0, which is not the seat to its left$/),
    ]);
    expect(callOnDiscard(pon(2, 0, "3s", "34s"))).toEqual([issue(2, /mixes tile kinds/)]);
    expect(callOnDiscard(daiminkan(2, 0, "3s", "33s"))).toEqual([
      issue(2, /uses 2 tiles from the hand, expected 3/),
    ]);
    const wrapped = checkRound(
      makeRound({
        hands: unknownHands(),
        events: [draw(0, "?"), tsumogiri(0, "9m"), chi(1, 0, "9m", "12p"), ryukyoku("unknown")],
      }),
    );
    expect(wrapped).toEqual([issue(2, /is not a sequence/)]);
  });

  it("checks ankan and kakan", () => {
    const mixed = editSample((events) => {
      events[21] = ankan(0, "222s9m");
    });
    expect(checkRound(mixed)).toEqual([
      issue(21, /^The ankan 2s 2s 2s 9m of seat 0 is not four tiles of one kind$/),
      issue(27, /winning hand .* differs from the replayed hand/),
    ]);
    const missing = editSample((events) => {
      events[20] = draw(0, "3s");
    });
    expect(checkRound(missing)).toEqual([
      issue(21, /^Seat 0 has no 2s for its ankan$/),
      issue(23, /^Seat 0 holds 14 tiles before drawing, expected 13/),
      issue(27, /winning hand/),
    ]);
    const noPon = makeRound({
      hands: unknownHands(),
      events: [
        draw(0, "5p"),
        kakan(0, "5p"),
        draw(0, "?"),
        tsumogiri(0, "1m"),
        ryukyoku("unknown"),
      ],
    });
    expect(checkRound(noPon)).toEqual([issue(1, /adds 5p as a kakan without a pon/)]);
  });

  it("reports hand sizes that drift, once per seat", () => {
    const short = editSample((_, round) => {
      round.hands[2] = tiles("23m50p99p1s78s444z");
    });
    expect(checkRound(short)).toEqual([
      issue(-1, /^The starting hand of seat 2 has 12 tiles instead of 13$/),
      issue(11, /^Seat 2 holds 12 tiles before calling daiminkan, expected 13/),
    ]);
    const missingDraw = editSample((events) => {
      events.splice(25, 1);
    });
    const issues = checkRound(missingDraw);
    expect(issues).toContainEqual(
      issue(25, /Seat 1 discards out of turn \(seat 1 should draw next\)/),
    );
    expect(issues).toContainEqual(
      issue(25, /Seat 1 holds 13 tiles before discarding, expected 14/),
    );
  });

  it("reports turns taken out of order", () => {
    const round = makeRound({
      hands: unknownHands(),
      events: [draw(1, "?"), tsumogiri(1, "1m"), ryukyoku("unknown")],
    });
    expect(checkRound(round)).toEqual([
      issue(0, /^Seat 1 draws out of turn \(seat 0 should draw next\)$/),
    ]);
  });

  it("reports draws beyond the wall and too many kans", () => {
    const long = wallRound({
      draws: 70,
      results: [draw(2, "?"), tsumogiri(2, "1m"), ryukyoku("exhaustive")],
    });
    expect(checkRound(long)).toEqual([issue(140, /^Seat 2 draws from an empty wall$/)]);

    const kans: RoundEvent[] = [
      draw(0, "?"),
      ankan(0, "1111m"),
      draw(0, "?"),
      ankan(0, "2222m"),
      draw(0, "?"),
      tsumogiri(0, "1z"),
      draw(1, "?"),
      ankan(1, "3333m"),
      draw(1, "?"),
      ankan(1, "4444m"),
      draw(1, "?"),
      ankan(1, "6666m"),
      draw(1, "?"),
      tsumogiri(1, "2z"),
      ryukyoku("suukaikan"),
    ];
    expect(checkRound(makeRound({ hands: unknownHands(), events: kans }))).toEqual([
      issue(11, /^Kan number 5 in one round/),
    ]);
  });

  it("reports anything after the result and a missing result", () => {
    const extra = editSample((events) => {
      events.push(draw(2, "?"));
    });
    expect(checkRound(extra)).toEqual([issue(28, /^A "draw" event follows the round result$/)]);
    const twoResults = editSample((events) => {
      events.push(ryukyoku("exhaustive"));
    });
    expect(checkRound(twoResults)).toContainEqual(
      issue(28, /"ryukyoku" event follows the round result/),
    );
    const noResult = editSample((events) => {
      events.pop();
    });
    expect(checkRound(noResult)).toEqual([
      issue(26, /^The round ends without a win or draw result$/),
    ]);
    expect(checkRound(makeRound())).toEqual([issue(-1, /ends without a win or draw result/)]);
  });

  it("checks the winning hand and tile", () => {
    const wrongHand = editSample((_, round) => {
      sampleWin(round).hand = tiles("99m123789p667z");
    });
    expect(checkRound(wrongHand)).toEqual([
      issue(
        27,
        /^The winning hand 9m 9m 1p 2p 3p 7p 8p 9p 6z 6z 7z of seat 0 differs from the replayed hand 9m 9m 1p 2p 3p 7p 8p 9p 6z 6z 6z$/,
      ),
    ]);
    const wrongTile = editSample((_, round) => {
      const event = sampleWin(round);
      event.tile = "7z";
      delete event.hand;
    });
    expect(checkRound(wrongTile)).toEqual([
      issue(27, /^The ron tile 7z differs from the discard tile 6z$/),
    ]);

    const hand = (round: Round) => [...(round.hands[1] as Tile[]), wallDraw(1)];
    const tsumo = (extra: Partial<WinEvent>) => {
      const round = wallRound({ draws: 2, keepLastDraw: true });
      round.events.push(win(1, 1, [-2000, 4000, -1000, -1000], { hand: hand(round), ...extra }));
      return checkRound(round);
    };
    expect(tsumo({})).toEqual([]);
    expect(tsumo({ tile: "?" })).toEqual([]);
    const otherTile = wallDraw(1) === "1z" ? "2z" : "1z";
    expect(tsumo({ tile: otherTile })).toEqual([
      issue(3, /^The tsumo tile .* differs from the drawn tile/),
    ]);
    expect(tsumo({ hand: [] })).toEqual([issue(3, /winning hand \(none\) of seat 1 differs/)]);
  });

  it("checks multiple ron", () => {
    const round = (second: WinEvent) =>
      makeRound({
        hands: unknownHands(),
        events: [draw(0, "?"), tsumogiri(0, "7z"), win(1, 0, [-8000, 8000, 0, 0]), second],
      });
    expect(checkRound(round(win(3, 0, [-3900, 0, 0, 3900])))).toEqual([]);
    expect(checkRound(round(win(1, 0, [-3900, 3900, 0, 0])))).toEqual([
      issue(3, /^Seat 1 wins twice$/),
    ]);
    expect(checkRound(round(win(3, 2, [0, 0, -3900, 3900])))).toContainEqual(
      issue(3, /Multiple ron wins name different discarders/),
    );
    expect(checkRound(round(win(3, 3, [-1300, -1300, -1300, 3900])))).toContainEqual(
      issue(3, /Only ron wins can share a result/),
    );
  });

  it("checks riichi declarations and their acceptance", () => {
    const openRiichi = editSample((events) => {
      events[3] = discard(1, "9s", { riichi: true });
    });
    expect(checkRound(openRiichi)).toEqual([
      issue(3, /^Seat 1 declares riichi with an open hand$/),
      issue(4, /riichi discard of seat 1 \(event 3\) is not followed by riichiAccepted/),
    ]);
    const twice = editSample((events) => {
      events[24] = discard(0, "7m", { tsumogiri: true, riichi: true });
    });
    expect(checkRound(twice)).toEqual([
      issue(24, /^Seat 0 declares riichi a second time$/),
      issue(25, /not followed by riichiAccepted/),
    ]);

    const base = () => wallRound({ draws: 6, riichiAt: [1], results: [ryukyoku("unknown")] });
    expect(checkRound(base())).toEqual([]);
    const missing = base();
    missing.events.splice(4, 1);
    expect(checkRound(missing)).toEqual([issue(4, /^The riichi discard of seat 1 \(event 3\)/)]);
    const wrongSeat = base();
    wrongSeat.events[4] = riichiAccepted(2);
    expect(checkRound(wrongSeat)).toEqual([
      issue(4, /^riichiAccepted for seat 2 does not follow its riichi discard$/),
    ]);
    const fromHand = base();
    const later = fromHand.events[12];
    if (later?.type !== "discard") {
      throw new Error("Expected a discard");
    }
    later.tsumogiri = false;
    expect(checkRound(fromHand)).toContainEqual(
      issue(12, /is in riichi but discards .* from the hand/),
    );

    const callInRiichi = makeRound({
      hands: unknownHands(),
      events: [
        draw(0, "?"),
        discard(0, "5m", { riichi: true }),
        riichiAccepted(0),
        draw(1, "?"),
        tsumogiri(1, "7z"),
        pon(0, 1, "7z", "77z"),
      ],
    });
    expect(checkRound(callInRiichi)).toContainEqual(issue(5, /^Seat 0 calls pon while in riichi$/));
  });

  it("holds a seat to the riichi rules from its declaration, before any riichiAccepted", () => {
    // The acceptance is missing, so no deposit is paid, but the declaration still binds the seat.
    const unaccepted = (...later: RoundEvent[]) =>
      makeRound({
        hands: unknownHands(),
        events: [
          draw(0, "?"),
          discard(0, "5m", { riichi: true }),
          draw(1, "?"),
          tsumogiri(1, "7z"),
          ...later,
        ],
      });
    const missing = issue(2, /^The riichi discard of seat 0 \(event 1\) is not followed/);
    expect(checkRound(unaccepted(pon(0, 1, "7z", "77z"), ryukyoku("unknown")))).toEqual([
      missing,
      issue(4, /^Seat 0 calls pon while in riichi$/),
    ]);
    const next = [draw(2, "?"), tsumogiri(2, "1s"), draw(3, "?"), tsumogiri(3, "2s"), draw(0, "?")];
    expect(checkRound(unaccepted(...next, discard(0, "3p"), ryukyoku("unknown")))).toEqual([
      missing,
      issue(9, /^Seat 0 is in riichi but discards 3p from the hand$/),
    ]);
    const twice = unaccepted(...next, discard(0, "3p", { tsumogiri: true, riichi: true }));
    twice.events.push(riichiAccepted(0), ryukyoku("unknown"));
    expect(checkRound(twice)).toEqual([
      missing,
      issue(9, /^Seat 0 declares riichi a second time$/),
    ]);
  });

  it("allows a ron on a riichi discard only without riichiAccepted", () => {
    const ronned = wallRound({ draws: 2, results: [win(2, 1, [0, -8000, 8000, 0])] });
    const declaration = ronned.events[3];
    if (declaration?.type !== "discard") {
      throw new Error("Expected a discard");
    }
    declaration.riichi = true;
    expect(checkRound(ronned)).toEqual([]);
    ronned.events.splice(4, 0, riichiAccepted(1));
    const winEvent = ronned.events[5] as WinEvent;
    winEvent.deltas = [0, -8000, 9000, 0];
    expect(checkRound(ronned)).toEqual([
      issue(5, /^The riichi discard of seat 1 is ronned after its riichiAccepted$/),
    ]);
  });

  it("checks result deltas", () => {
    const noDeposit = editSample((_, round) => {
      sampleWin(round).deltas = [12000, -12000, 0, 0];
    });
    expect(checkRound(noDeposit)).toEqual([
      issue(
        27,
        /^Win deltas add up to 0, but 1 riichi deposits \(1000 points\) were on the table$/,
      ),
    ]);
    const loser = editSample((_, round) => {
      sampleWin(round).deltas = [-1000, 2000, 0, 0];
    });
    expect(checkRound(loser)).toEqual([issue(27, /^The winner, seat 0, gains -1000 points$/)]);
    const broken = editSample((_, round) => {
      sampleWin(round).deltas = [13000, -12000] as unknown as Quad<number>;
    });
    expect(checkRound(broken)).toContainEqual(issue(27, /^Result deltas are not four numbers$/));

    const drawWith = (result: RoundEvent, draws = 70) =>
      checkRound(wallRound({ draws, results: [result] }));
    expect(drawWith(ryukyoku("exhaustive", [1000, 0, 0, 0]))).toEqual([
      issue(140, /^Draw deltas add up to 1000 instead of 0$/),
    ]);
    expect(drawWith(ryukyoku("exhaustive"), 60)).toEqual([
      issue(120, /^Exhaustive draw with 10 tiles left in the wall$/),
    ]);
    expect(drawWith(ryukyoku("exhaustive", [3000, -1000, -1000, -1000], { tenpai: [1] }))).toEqual([
      issue(140, /do not match the payments -1000, 3000, -1000, -1000/),
    ]);
  });

  it("reports dora indicators without a kan", () => {
    const round = wallRound({ draws: 4, results: [ryukyoku("unknown")] });
    round.events.splice(2, 0, dora("3p"));
    expect(checkRound(round)).toEqual([issue(2, /^Dora indicator 3p is revealed without a kan$/)]);
  });

  it("reports more than four copies of a tile", () => {
    const round = editSample((events) => {
      events[23] = draw(0, "2s");
      events[24] = tsumogiri(0, "2s");
    });
    expect(checkRound(round)).toEqual([issue(23, /^More than four 2s tiles appear in the round$/)]);
  });

  it("reports malformed events and start state", () => {
    const round = makeRound({
      dealer: 1,
      hands: [tiles("123m"), ...unknownHands().slice(1)] as Round["hands"],
      doraIndicators: [],
      events: [
        null,
        { type: "draw", seat: 4, tile: "1m" },
        { type: "draw", seat: 1, tile: "5x" },
        { type: "shout", seat: 0 },
      ] as unknown as RoundEvent[],
    });
    const messages = checkRound(round);
    expect(messages).toEqual(
      expect.arrayContaining([
        issue(-1, /^Dealer seat 1 does not match round number 1$/),
        issue(-1, /^The starting hand of seat 0 has 3 tiles instead of 13$/),
        issue(-1, /^Expected one to five starting dora indicators$/),
        issue(0, /^The event is not an object$/),
        issue(1, /^Invalid seat 4$/),
        issue(2, /^Invalid tile 5x$/),
        issue(3, /^Unknown event type "shout"$/),
      ]),
    );
    expect(() => checkRound(null as unknown as Round)).not.toThrow();
    expect(() => checkRound({ events: [{ type: "win" }] } as unknown as Round)).not.toThrow();
  });
});

describe("checkGame", () => {
  const roundTwo = () =>
    wallRound({
      honba: 1,
      scores: [37000, 13000, 25000, 25000],
      draws: 70,
      riichiAt: [5],
      results: [ryukyoku("exhaustive", [-1000, 3000, -1000, -1000], { tenpai: [1] })],
    });
  const roundThree = () =>
    wallRound({
      number: 2,
      dealer: 1,
      honba: 2,
      riichiSticks: 1,
      scores: [36000, 15000, 24000, 24000],
      draws: 2,
      keepLastDraw: true,
      results: [win(2, 2, [-1200, -2200, 5600, -1200])],
    });
  const game = (extra: Partial<GameLog> = {}) =>
    makeGame([sampleRound(), roundTwo(), roundThree()], {
      finalScores: [34800, 12800, 29600, 22800],
      ...extra,
    });

  it("accepts a consistent game", () => {
    expect(checkGame(game())).toEqual([]);
    expect(checkGame(game({ finalScores: undefined }))).toEqual([]);
  });

  it("tags round issues with the round index", () => {
    const broken = game();
    broken.rounds[0]?.events.pop();
    expect(checkGame(broken)).toContainEqual({
      roundIndex: 0,
      eventIndex: 26,
      message: expect.stringMatching(/ends without a win or draw result/),
    });
  });

  it("checks scores, deposits and honba between rounds", () => {
    const scores = game();
    (scores.rounds[1] as Round).scores = [36000, 14000, 25000, 25000];
    expect(checkGame(scores)).toContainEqual({
      roundIndex: 1,
      eventIndex: -1,
      message:
        "Start scores 36000, 14000, 25000, 25000 differ from the previous round's end scores 37000, 13000, 25000, 25000",
    });
    const sticks = game();
    (sticks.rounds[2] as Round).riichiSticks = 0;
    expect(checkGame(sticks)).toContainEqual({
      roundIndex: 2,
      eventIndex: -1,
      message: expect.stringMatching(/starts with 0 riichi deposits, but 1 were left/),
    });
    const honba = game();
    (honba.rounds[2] as Round).honba = 0;
    expect(checkGame(honba)).toEqual([
      { roundIndex: 2, eventIndex: -1, message: expect.stringMatching(/honba 0, expected 2/) },
    ]);
  });

  it("checks the final scores", () => {
    expect(checkGame(game({ finalScores: [34800, 12800, 29600, 22000] }))).toEqual([
      {
        roundIndex: 2,
        eventIndex: 3,
        message:
          "Final scores 34800, 12800, 29600, 22000 differ from the last round's end scores 34800, 12800, 29600, 22800",
      },
    ]);
    const endsInDraw = (finalScores: Quad<number>) =>
      checkGame(makeGame([sampleRound(), roundTwo()], { finalScores }));
    expect(endsInDraw([36000, 15000, 24000, 24000])).toEqual([]);
    // Tenhou hands the deposit left on the table to the top player.
    expect(endsInDraw([37000, 15000, 24000, 24000])).toEqual([]);
    expect(endsInDraw([36000, 16000, 24000, 24000])).toEqual([
      expect.objectContaining({ message: expect.stringMatching(/1 riichi deposits left/) }),
    ]);
  });

  it("checks red fives against the rules", () => {
    expect(checkGame(makeGame([sampleRound()], { rules: { redFives: false } }))).toEqual([
      { roundIndex: 0, eventIndex: -1, message: "Red five 0m in a game without red fives" },
      { roundIndex: 0, eventIndex: -1, message: "Red five 0p in a game without red fives" },
    ]);
    const plain = makeRound({
      hands: [tiles("5555m123456789p"), ...unknownHands().slice(1)] as Round["hands"],
      events: [ryukyoku("unknown")],
    });
    expect(checkGame(makeGame([plain]))).toEqual([
      {
        roundIndex: 0,
        eventIndex: -1,
        message: "Four plain 5m tiles in a game with red fives (one of them should be 0m)",
      },
    ]);
  });

  it("reports games without players or rounds", () => {
    const empty = checkGame(makeGame([], { players: [] as unknown as GameLog["players"] }));
    expect(empty.map((found: ReplayIssue) => found.message)).toEqual([
      "A game needs exactly four player slots",
      "The game has no rounds",
    ]);
    expect(checkGame(null as unknown as GameLog)).toHaveLength(1);
  });
});

const sanmaUnknownHands = (): Round["hands"] => [
  tiles("?????????????"),
  tiles("?????????????"),
  tiles("?????????????"),
  [],
];

/** A three-player East 1 where every hand is hidden. */
const sanmaRound = (events: RoundEvent[], overrides: Partial<Round> = {}): Round =>
  makeSanmaRound({ hands: sanmaUnknownHands(), events, ...overrides });

/** Each seat draws a hidden tile and discards it, in turn order from seat 0. */
function passTurns(count: number): RoundEvent[] {
  return Array.from({ length: count }, (_, n) => {
    const seat = (n % 3) as Seat;
    return [draw(seat, "?"), tsumogiri(seat, "1z")];
  }).flat();
}

describe("checkRound with three players", () => {
  it("accepts consistent three-player rounds", () => {
    expect(checkRound(sampleSanmaRound(), 3)).toEqual([]);
    const exhaustive = wallRound({ playerCount: 3, draws: 55, results: [ryukyoku("exhaustive")] });
    expect(checkRound(exhaustive, 3)).toEqual([]);
    // Tsumo-son: the non-dealer's 1000-2000 tsumo is paid by two seats only.
    const tsumo = win(1, 1, [-2000, 3000, -1000, 0], { tile: wallDraw(1, undefined, 3) });
    const tsumoRound = wallRound({
      playerCount: 3,
      draws: 2,
      keepLastDraw: true,
      results: [tsumo],
    });
    expect(checkRound(tsumoRound, 3)).toEqual([]);
    expect(checkRound(sanmaRound([draw(0, "?"), ryukyoku("kyuushuKyuuhai")]), 3)).toEqual([]);
  });

  it("finds the three-player sample inconsistent when it is replayed as four-player", () => {
    const issues = checkRound(sampleSanmaRound());
    expect(issues).toContainEqual(issue(-1, /^The starting hand of seat 3 has 0 tiles/));
    expect(issues).toContainEqual(issue(1, /^Seat 0 declares kita in a four-player game$/));
    expect(issues).toContainEqual(issue(17, /^Seat 0 draws out of turn \(seat 3 should draw/));
    expect(checkRound(sampleSanmaRound(), 4)).toEqual(issues);
  });

  it("sets aside the drawn North, a chained North and a North from the hand", () => {
    const round = makeSanmaRound({
      hands: [tiles("111234567899p4z"), tiles("1112345678999s"), tiles("1199m112233556z"), []],
      events: [
        draw(0, "4z"),
        kita(0),
        draw(0, "4z"),
        kita(0),
        draw(0, "7z"),
        kita(0),
        draw(0, "2z"),
        tsumogiri(0, "2z"),
        ryukyoku("unknown"),
      ],
    });
    expect(checkRound(round, 3)).toEqual([]);
  });

  it("reports a kita without a North and a kita of another tile", () => {
    const noNorth = makeSanmaRound({ events: [draw(0, "5z"), kita(0), ryukyoku("unknown")] });
    expect(checkRound(noNorth, 3)).toEqual([issue(1, /^Seat 0 has no 4z for its kita$/)]);
    const otherTile = makeSanmaRound({
      events: [
        draw(0, "5z"),
        kita(0, "5z"),
        draw(0, "7z"),
        tsumogiri(0, "7z"),
        ryukyoku("unknown"),
      ],
    });
    expect(checkRound(otherTile, 3)).toEqual([
      issue(1, /^Seat 0 sets aside 5z as kita, which is not a North \(4z\)$/),
    ]);
  });

  it("reports a kita in a four-player game", () => {
    const round = makeRound({
      hands: unknownHands(),
      events: [draw(0, "4z"), kita(0), draw(0, "?"), tsumogiri(0, "1z"), ryukyoku("unknown")],
    });
    expect(checkRound(round)).toEqual([issue(1, /^Seat 0 declares kita in a four-player game$/)]);
  });

  it("gives the replacement draw to the seat that set the North aside", () => {
    const otherSeat = sanmaRound([draw(0, "4z"), kita(0), draw(1, "?"), tsumogiri(1, "1z")]);
    expect(checkRound(otherSeat, 3)).toContainEqual(
      issue(2, /^Seat 1 draws out of turn \(seat 0 should draw next\)$/),
    );
    const beforeDrawing = sanmaRound([kita(0), draw(0, "?"), tsumogiri(0, "1z")]);
    expect(checkRound(beforeDrawing, 3)).toEqual([
      issue(0, /^Seat 0 declares kita out of turn \(seat 0 should draw next\)$/),
      issue(0, /^Seat 0 holds 13 tiles before kita, expected 14/),
      issue(2, /^The round ends without a win or draw result$/),
    ]);
  });

  it("allows a kita in riichi", () => {
    const round = sanmaRound([
      draw(0, "?"),
      discard(0, "1z", { riichi: true }),
      riichiAccepted(0),
      ...passTurns(3).slice(2),
      draw(0, "4z"),
      kita(0),
      draw(0, "?"),
      tsumogiri(0, "5z"),
      ryukyoku("unknown"),
    ]);
    expect(checkRound(round, 3)).toEqual([]);
    const fromWall = wallRound({
      playerCount: 3,
      seed: 33,
      draws: 55,
      riichiAt: [4],
      kita: true,
      results: [ryukyoku("exhaustive")],
    });
    const riichi = fromWall.events.findIndex((event) => event.type === "riichiAccepted");
    expect(fromWall.events.slice(riichi)).toContainEqual(kita(1));
    expect(checkRound(fromWall, 3)).toEqual([]);
  });

  it("reports a kita in riichi that sets aside a North from the locked hand", () => {
    // Seat 1 declares riichi with a North in the hand; later it draws 5p and sets that North aside,
    // which would put the 5p into the locked hand.
    const riichiRound = (kitaTurn: RoundEvent[]) =>
      makeSanmaRound({
        hands: [tiles("1112345678999p"), tiles("1112345678s4z4z7z"), tiles("1199m112233556z"), []],
        events: [
          draw(0, "2z"),
          tsumogiri(0, "2z"),
          draw(1, "9s"),
          discard(1, "7z", { riichi: true }),
          riichiAccepted(1),
          draw(2, "3z"),
          tsumogiri(2, "3z"),
          draw(0, "3p"),
          tsumogiri(0, "3p"),
          ...kitaTurn,
          draw(2, "5z"),
          tsumogiri(2, "5z"),
          win(0, 2, [3000, 0, -2000, 0]),
        ],
      });
    const drawnNorth = riichiRound([draw(1, "4z"), kita(1), draw(1, "6p"), tsumogiri(1, "6p")]);
    expect(checkRound(drawnNorth, 3)).toEqual([]);
    const handNorth = riichiRound([draw(1, "5p"), kita(1), draw(1, "6p"), tsumogiri(1, "6p")]);
    expect(checkRound(handNorth, 3)).toEqual([
      issue(10, /^Seat 1 is in riichi but sets aside 4z from the hand$/),
    ]);
    // The same as a discard is reported the same way.
    const handDiscard = riichiRound([draw(1, "5p"), discard(1, "4z")]);
    expect(checkRound(handDiscard, 3)).toEqual([
      issue(10, /^Seat 1 is in riichi but discards 4z from the hand$/),
    ]);
    // Before riichi a North from the hand is fine.
    const beforeRiichi = makeSanmaRound({
      hands: [tiles("1112345678999p"), tiles("1112345678s4z4z7z"), tiles("1199m112233556z"), []],
      events: [
        draw(0, "2z"),
        tsumogiri(0, "2z"),
        draw(1, "5p"),
        kita(1),
        draw(1, "6p"),
        tsumogiri(1, "6p"),
        ryukyoku("unknown"),
      ],
    });
    expect(checkRound(beforeRiichi, 3)).toEqual([]);
  });

  it("reports a kita right after a pon, before the seat draws", () => {
    const afterPon = (turn: RoundEvent[]) =>
      makeSanmaRound({
        hands: [tiles("1112345678999p"), tiles("1112345678s4z66z"), tiles("1199m112233557z"), []],
        events: [
          draw(0, "6z"),
          tsumogiri(0, "6z"),
          pon(1, 0, "6z", "66z"),
          ...turn,
          draw(2, "2z"),
          tsumogiri(2, "2z"),
          win(0, 2, [1000, 0, -1000, 0]),
        ],
      });
    expect(checkRound(afterPon([discard(1, "4z")]), 3)).toEqual([]);
    expect(checkRound(afterPon([kita(1), draw(1, "9s"), tsumogiri(1, "9s")]), 3)).toEqual([
      issue(3, /^Seat 1 declares kita right after calling pon$/),
    ]);
    // After a daiminkan the seat draws its replacement tile first, so a kita may follow.
    const afterKan = makeSanmaRound({
      hands: [tiles("1112345678999p"), tiles("112345678s4z666z"), tiles("1199m112233557z"), []],
      events: [
        draw(0, "6z"),
        tsumogiri(0, "6z"),
        daiminkan(1, 0, "6z", "666z"),
        draw(1, "4z"),
        kita(1),
        draw(1, "9s"),
        tsumogiri(1, "9s"),
        ryukyoku("unknown"),
      ],
    });
    expect(checkRound(afterKan, 3)).toEqual([]);
  });

  it("reports a kita on an empty wall, which leaves no tile to replace it", () => {
    // The 55th and last draw of this wall is a North.
    const last = wallRound({ playerCount: 3, seed: 911, draws: 55, keepLastDraw: true });
    const lastDraw = last.events.at(-1);
    expect(lastDraw).toStrictEqual(draw(0, "4z"));
    const kitaOnLast = {
      ...last,
      events: [...last.events, kita(0), ryukyoku("exhaustive", [0, 0, 0, 0], { tenpai: [] })],
    };
    expect(checkRound(kitaOnLast, 3)).toEqual([
      issue(
        last.events.length,
        /^Seat 0 declares kita with no tile left in the wall to replace it$/,
      ),
    ]);
  });

  it("allows a ron on a set-aside North and a tsumo on the replacement draw", () => {
    const ronOnKita = (...results: WinEvent[]) =>
      checkRound(sanmaRound([draw(0, "4z"), kita(0), ...results]), 3);
    expect(ronOnKita(win(1, 0, [-3900, 3900, 0, 0], { tile: "4z" }))).toEqual([]);
    expect(ronOnKita(win(1, 0, [-3900, 3900, 0, 0]), win(2, 0, [-2000, 0, 2000, 0]))).toEqual([]);
    expect(ronOnKita(win(1, 0, [-3900, 3900, 0, 0], { tile: "5z" }))).toEqual([
      issue(2, /^The ron tile 5z differs from the kita tile 4z$/),
    ]);
    expect(ronOnKita(win(1, 2, [0, 3900, -3900, 0]))).toEqual([
      issue(2, /^Seat 1 wins by ron from seat 2, but the last discard or kan was by seat 0$/),
    ]);
    expect(checkRound(sanmaRound([win(1, 0, [-3900, 3900, 0, 0])]), 3)).toEqual([
      issue(0, /^Seat 1 wins by ron, but there is no discard, kan or kita to win on$/),
    ]);
    const ponOnKita = sanmaRound([draw(0, "4z"), kita(0), pon(1, 0, "4z", "44z")]);
    expect(checkRound(ponOnKita, 3)).toContainEqual(
      issue(2, /^Seat 1 calls pon on 4z, but there is no discard to call$/),
    );
    const rinshan = sanmaRound([
      draw(0, "4z"),
      kita(0),
      draw(0, "?"),
      win(0, 0, [12000, -6000, -6000, 0]),
    ]);
    expect(checkRound(rinshan, 3)).toEqual([]);
  });

  it("counts every draw, replacement draws included, against the 55-tile wall", () => {
    const withKita = (draws: number) =>
      wallRound({ playerCount: 3, seed: 33, draws, kita: true, results: [ryukyoku("exhaustive")] });
    const full = withKita(55);
    expect(full.events.filter((event) => event.type === "kita")).toHaveLength(4);
    expect(full.events.filter((event) => event.type === "draw")).toHaveLength(55);
    expect(checkRound(full, 3)).toEqual([]);
    const short = withKita(54);
    expect(checkRound(short, 3)).toEqual([
      issue(short.events.length - 1, /^Exhaustive draw with 1 tiles left in the wall$/),
    ]);
    const long = wallRound({
      playerCount: 3,
      draws: 55,
      results: [draw(1, "?"), tsumogiri(1, "1z"), ryukyoku("exhaustive")],
    });
    expect(checkRound(long, 3)).toEqual([issue(110, /^Seat 1 draws from an empty wall$/)]);
  });

  it("does not count a kita as a kan", () => {
    const round = sanmaRound([
      draw(0, "4z"),
      kita(0),
      dora("3p"),
      draw(0, "?"),
      ryukyoku("unknown"),
    ]);
    expect(checkRound(round, 3)).toEqual([
      issue(2, /^Dora indicator 3p is revealed without a kan$/),
    ]);
  });

  it("reports a chi and accepts a pon across the empty chair", () => {
    const callOnDiscard = (events: RoundEvent[]) =>
      checkRound(sanmaRound([...events, ryukyoku("unknown")]), 3);
    expect(callOnDiscard([draw(0, "?"), tsumogiri(0, "3s"), chi(1, 0, "3s", "24s")])).toEqual([
      issue(2, /^Seat 1 calls chi in a three-player game$/),
    ]);
    const fromSeatTwo = [...passTurns(3).slice(0, 5), tsumogiri(2, "3s"), pon(0, 2, "3s", "33s")];
    expect(callOnDiscard([...fromSeatTwo, discard(0, "5z")])).toEqual([]);
    const fromSeatZero = [draw(0, "?"), tsumogiri(0, "3s"), pon(2, 0, "3s", "33s")];
    expect(callOnDiscard([...fromSeatZero, discard(2, "5z")])).toEqual([]);
  });

  it("passes the turn from seat 2 back to seat 0", () => {
    expect(checkRound(sanmaRound([...passTurns(4), ryukyoku("unknown")]), 3)).toEqual([]);
    const emptyChair = sanmaRound([...passTurns(3), draw(3, "?"), tsumogiri(3, "1z")]);
    expect(checkRound(emptyChair, 3)).toEqual([
      issue(6, /^Seat 3 is the empty chair of a three-player game$/),
      issue(6, /^Seat 3 draws out of turn \(seat 0 should draw next\)$/),
      issue(6, /^Seat 3 holds 0 tiles before drawing, expected 13/),
      issue(7, /^Seat 3 is the empty chair of a three-player game$/),
      issue(7, /^The round ends without a win or draw result$/),
    ]);
  });

  it("checks the noten payments of 2000 points", () => {
    const drawWith = (deltas: Quad<number>, tenpai: Seat[]) =>
      checkRound(
        wallRound({
          playerCount: 3,
          draws: 55,
          results: [ryukyoku("exhaustive", deltas, { tenpai })],
        }),
        3,
      );
    expect(drawWith([2000, -1000, -1000, 0], [0])).toEqual([]);
    expect(drawWith([-1000, -1000, 2000, 0], [2])).toEqual([]);
    expect(drawWith([1000, 1000, -2000, 0], [0, 1])).toEqual([]);
    expect(drawWith([-2000, 1000, 1000, 0], [1, 2])).toEqual([]);
    expect(drawWith([0, 0, 0, 0], [0, 1, 2])).toEqual([]);
    expect(drawWith([0, 0, 0, 0], [])).toEqual([]);
    expect(drawWith([3000, -1500, -1500, 0], [0])).toEqual([
      issue(
        110,
        /^Draw deltas 3000, -1500, -1500, 0 do not match the payments 2000, -1000, -1000, 0 for tenpai seats \[0\]$/,
      ),
    ]);
    expect(drawWith([1500, 1500, -3000, 0], [0, 1])).toEqual([
      issue(110, /do not match the payments 1000, 1000, -2000, 0/),
    ]);
    expect(drawWith([2000, -1000, -1000, 0], [0, 3])).toEqual([
      issue(110, /^The draw lists the empty seat 3 of a three-player game as tenpai$/),
    ]);
  });

  it("reports abortive draws that need four players", () => {
    for (const reason of ["suufonRenda", "suuchaRiichi", "sanchaHou"] as const) {
      const round = sanmaRound([draw(0, "?"), tsumogiri(0, "4z"), ryukyoku(reason)]);
      expect(checkRound(round, 3)).toEqual([
        issue(2, new RegExp(`^A ${reason} draw cannot happen in a three-player game$`)),
      ]);
    }
    const allowed: RyukyokuReason[] = ["suukaikan", "unknown"];
    for (const reason of allowed) {
      const round = sanmaRound([draw(0, "?"), tsumogiri(0, "4z"), ryukyoku(reason)]);
      expect(checkRound(round, 3)).toEqual([]);
    }
  });

  it("reports anything the empty seat 3 is given at the start", () => {
    const start = (overrides: Partial<Round>) =>
      checkRound(makeSanmaRound({ events: [ryukyoku("unknown")], ...overrides }), 3);
    expect(start({ scores: [35000, 35000, 35000, 1000] })).toEqual([
      issue(-1, /^The empty seat 3 of a three-player game starts with 1000 points instead of 0$/),
    ]);
    const dealt = makeSanmaRound().hands;
    dealt[3] = tiles("4z");
    expect(start({ hands: dealt })).toEqual([
      issue(-1, /^The empty seat 3 of a three-player game is dealt 1 tiles instead of none$/),
    ]);
    const short = makeSanmaRound().hands;
    short[0] = tiles("111234567899p");
    expect(start({ hands: short })).toEqual([
      issue(-1, /^The starting hand of seat 0 has 12 tiles instead of 13$/),
    ]);
    expect(start({ number: 4, dealer: 3 })).toEqual([
      issue(-1, /^Invalid round number 4 in a three-player game$/),
      issue(-1, /^Dealer seat 3 is the empty chair of a three-player game$/),
    ]);
    expect(start({ number: 3, dealer: 2 })).toEqual([]);
  });

  it("reports results that give the empty seat 3 a share", () => {
    const ron = (result: RoundEvent) =>
      checkRound(sanmaRound([draw(0, "?"), tsumogiri(0, "7z"), result]), 3);
    expect(ron(win(1, 0, [-3900, 3900, 0, 100]))).toEqual([
      issue(2, /^The empty seat 3 of a three-player game has a delta of 100 instead of 0$/),
      issue(2, /^Win deltas add up to 100, but 0 riichi deposits/),
    ]);
    expect(ron(win(3, 0, [-3900, 0, 0, 3900]))).toContainEqual(
      issue(2, /^Seat 3 is the empty chair of a three-player game$/),
    );
    expect(ron(win(1, 3, [0, 3900, 0, -3900]))).toContainEqual(
      issue(2, /^The from seat 3 is the empty chair of a three-player game$/),
    );
    expect(ron(win(1, 0, [-3900, 3900, 0, 0], { pao: 3 }))).toEqual([
      issue(2, /^The pao seat 3 is the empty chair of a three-player game$/),
    ]);
    expect(ron(win(1, 0, [-3900, 3900, 0, 0], { pao: 2 }))).toEqual([]);
    const hands: Quad<Tile[] | null> = [null, tiles("123p"), null, []];
    expect(ron(ryukyoku("unknown", [0, 0, 0, 0], { hands }))).toEqual([
      issue(2, /^The draw reveals a hand for the empty seat 3 of a three-player game$/),
    ]);
    expect(ron(ryukyoku("unknown", [0, 0, 0, 0], { hands: [null, null, null, null] }))).toEqual([]);
    // Four-player games keep seat 3 and accept it anywhere.
    const fourPlayer = makeRound({
      hands: unknownHands(),
      events: [draw(0, "?"), tsumogiri(0, "7z"), win(1, 0, [-3900, 3900, 0, 0], { pao: 3 })],
    });
    expect(checkRound(fourPlayer)).toEqual([]);
  });

  it("reports 2m-8m and red 5m tiles in a three-player game", () => {
    const hands = makeSanmaRound().hands;
    hands[2] = tiles("1299m112233556z");
    const round = makeSanmaRound({
      hands,
      doraIndicators: ["8m"],
      events: [
        draw(0, "0m"),
        tsumogiri(0, "0m"),
        draw(1, "2m"),
        tsumogiri(1, "2m"),
        ryukyoku("unknown"),
      ],
    });
    expect(checkRound(round, 3)).toEqual([
      issue(-1, /^2m appears in a three-player game, which has no 2m-8m$/),
      issue(-1, /^8m appears in a three-player game, which has no 2m-8m$/),
      issue(0, /^0m appears in a three-player game, which has no 2m-8m$/),
    ]);
    // The same tiles are fine with four players.
    expect(checkRound({ ...round, scores: [25000, 25000, 25000, 25000] })).toContainEqual(
      issue(-1, /^The starting hand of seat 3 has 0 tiles instead of 13$/),
    );
    expect(checkRound({ ...round, scores: [25000, 25000, 25000, 25000] })).not.toContainEqual(
      issue(-1, /2m appears/),
    );
  });
});

describe("checkGame with three players", () => {
  const game = (extra: Partial<GameLog> = {}) => ({ ...sampleSanmaGame(), ...extra });

  it("accepts a consistent game", () => {
    expect(game().players[3]).toEqual({ name: "" });
    const kitaByRound = game().rounds.map(
      (round) => round.events.filter((event) => event.type === "kita").length,
    );
    expect(kitaByRound).toEqual([3, 4, 0]);
    expect(checkGame(game())).toEqual([]);
    expect(checkGame(game({ finalScores: undefined }))).toEqual([]);
  });

  it("replays with the game's player count", () => {
    const fourPlayer = checkGame(
      game({ playerCount: 4, players: makeGame([]).players, finalScores: undefined }),
    );
    expect(fourPlayer).toContainEqual({
      roundIndex: 0,
      eventIndex: 1,
      message: "Seat 0 declares kita in a four-player game",
    });
  });

  it("validates the player count", () => {
    expect(checkGame(game({ playerCount: 5 as unknown as 3 }))[0]).toEqual({
      eventIndex: -1,
      message: "Invalid player count 5",
    });
    const missing: Partial<GameLog> = makeGame([sampleRound()]);
    delete missing.playerCount;
    expect(checkGame(missing as GameLog)).toEqual([
      { eventIndex: -1, message: "Invalid player count undefined" },
    ]);
  });

  it("requires the placeholder player slot 3", () => {
    const withPlayer = (player: GameLog["players"][3]) => {
      const players = game().players;
      players[3] = player;
      return checkGame(game({ players }));
    };
    expect(withPlayer({ name: "" })).toEqual([]);
    expect(withPlayer({ name: "D" })).toEqual([
      {
        eventIndex: -1,
        message: 'Player slot 3 of a three-player game is {"name":"D"} instead of {"name":""}',
      },
    ]);
    expect(withPlayer({ name: "", rank: "新人", danIndex: 0, rating: 1500 })).toHaveLength(1);
    // Four-player games name their fourth player.
    expect(checkGame(makeGame([sampleRound()]))).toEqual([]);
  });

  it("gives deposits left at the end to the top of the three players", () => {
    const endsInDraw = (finalScores: Quad<number>) =>
      checkGame(makeSanmaGame(game().rounds.slice(0, 2), { finalScores }));
    expect(endsInDraw([34000, 29800, 40200, 0])).toEqual([]);
    expect(endsInDraw([34000, 29800, 41200, 0])).toEqual([]);
    expect(endsInDraw([34000, 29800, 40200, 1000])).toEqual([
      expect.objectContaining({ message: expect.stringMatching(/1 riichi deposits left/) }),
    ]);
  });

  it("tags start issues of the empty seat with the round index", () => {
    const broken = game();
    (broken.rounds[1] as Round).scores = [35000, 28800, 41200, 100];
    expect(checkGame(broken)).toContainEqual({
      roundIndex: 1,
      eventIndex: -1,
      message: "The empty seat 3 of a three-player game starts with 100 points instead of 0",
    });
  });
});
