# Sample logs

The viewer opens these logs from the sample buttons on its welcome card and in its Open dialog, and from links such as `?sample=tenhou-json` (see `src/ui/samples.ts`). A first visit opens `tenhou-json` under the welcome card.

| Sample id     | File               | Format            | Source                                                                                       | License                     |
| ------------- | ------------------ | ----------------- | -------------------------------------------------------------------------------------------- | --------------------------- |
| `tenhou-json` | `ranked_game.json` | tenhou.net/6 JSON | convlog test data in [Equim-chan/mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer) | Apache License 2.0          |
| `sanma`       | `sanma.json`       | tenhou.net/6 JSON | written for this project                                                                     | MIT (the project's license) |

## `ranked_game.json`

`convlog/tests/testdata/ranked_game.json` from [Equim-chan/mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer), the test data of convlog, its tenhou.net/6 to mjai converter. It is licensed under the Apache License 2.0; the full text is in [LICENSE-apache-2.0.txt](LICENSE-apache-2.0.txt). The same file is a test fixture in `src/formats/tenhou-json/__fixtures__/convlog`.

Modifications: player names are replaced with "A", "B", "C" and "D", and the `ref` field (the Tenhou log id) is removed. Everything else is unchanged.

## `sanma.json`

A three-player (sanma) East-only game of five rounds, invented for this project and not taken from any real game, so it is covered by the project's [MIT license](../../LICENSE). Players are "A", "B" and "C"; the rule text is Tenhou's `三般東喰赤`. It shows North tiles set aside (kita), including wins whose dora count them, a pon across the empty seat, riichi, ron, tsumo and an exhaustive draw.

It is written in the layout of Tenhou's own tenhou.net/6 export (four seat slots with the fourth empty, `f44` for a kita), without the ranks and ratings (`dan`, `rate`) of the invented players. The game was built with the test helpers in `src/test` and written by `src/test/tenhou-json-serialize.ts`. Every win was checked against standard riichi scoring with Tenhou's three-player rules: the hand, yaku, han, fu, points and payments, plus dora counted the Tenhou way (set-aside Norths inside ドラ). `src/ui/samples.test.ts` pins each round's result and the final scores, and `checkGame` finds no issue.

The root `biome.json` excludes this folder from formatting so the files stay byte-for-byte as published.
