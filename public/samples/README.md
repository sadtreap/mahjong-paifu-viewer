# Sample logs

The viewer opens this log from the **Try a sample** button on its start page and from links such as `?sample=tenhou-json` (see `src/ui/samples.ts`).

| Sample id     | File               | Format            | Source                                                                                       | License            |
| ------------- | ------------------ | ----------------- | -------------------------------------------------------------------------------------------- | ------------------ |
| `tenhou-json` | `ranked_game.json` | tenhou.net/6 JSON | convlog test data in [Equim-chan/mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer) | Apache License 2.0 |

## `ranked_game.json`

`convlog/tests/testdata/ranked_game.json` from [Equim-chan/mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer), the test data of convlog, its tenhou.net/6 to mjai converter. It is licensed under the Apache License 2.0; the full text is in [LICENSE-apache-2.0.txt](LICENSE-apache-2.0.txt). The same file is a test fixture in `src/formats/tenhou-json/__fixtures__/convlog`.

Modifications: player names are replaced with "A", "B", "C" and "D", and the `ref` field (the Tenhou log id) is removed. Everything else is unchanged.

The root `biome.json` excludes this folder from formatting so the files stay byte-for-byte as published.
