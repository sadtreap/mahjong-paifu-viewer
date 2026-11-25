import { describe, expect, it } from "vitest";
import type { GameLog, Quad, Round, RoundEvent, WinEvent } from "../core/model";
import type { Tile } from "../core/tile";
import {
  ankan,
  chi,
  daiminkan,
  discard,
  dora,
  draw,
  kakan,
  makeGame,
  makeRound,
  pon,
  riichiAccepted,
  ryukyoku,
  sampleRound,
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
      "A game needs exactly four players",
      "The game has no rounds",
    ]);
    expect(checkGame(null as unknown as GameLog)).toHaveLength(1);
  });
});
