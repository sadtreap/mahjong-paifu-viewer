# convlog test data

These tenhou.net/6 JSON logs are the test data of convlog, the tenhou.net/6 to mjai converter in [Equim-chan/mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer) (`convlog/tests/testdata`). They cover the tricky cases of the format: chankan, ambiguous calls, double ron, four riichi, kyuushu kyuuhai, rinshan, ryukyoku and suukantsu.

They are licensed under the Apache License 2.0; the full text is in [LICENSE](LICENSE).

Modifications: player names are replaced with "A", "B", "C" and "D", and the `ref` field (the Tenhou log id) is removed. Everything else is unchanged.

The root `biome.json` excludes `__fixtures__` folders from formatting so these files stay byte-for-byte as published.
