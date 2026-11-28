# Mahjong Paifu Viewer

A browser-based viewer for riichi mahjong game logs (paifu) from [Tenhou](https://tenhou.net/) and [mjai](https://github.com/gimite/mjai). It runs entirely client-side as a static site on GitHub Pages: logs are read in your browser and never uploaded. The only other site it contacts is tenhou.net, to download the log of a Tenhou link you paste.

**Live site:** https://sadtreap.github.io/mahjong-paifu-viewer/ ([open a sample game](https://sadtreap.github.io/mahjong-paifu-viewer/?sample=tenhou-json))

> Status: early release. All three log formats load and replay; please report logs that fail to open or show something wrong.

## Features

- Reads Tenhou mjlog XML, tenhou.net/6 JSON and mjai JSONL, detecting the format from the content
- Paste a Tenhou replay link or log id and the viewer downloads the log from tenhou.net
- A flat table seen from above, like a diagram in a strategy book: every hand and pond around the centre console, with riichi tiles sideways, tsumogiri dimmed, called tiles faded and the last discard outlined; the console shows the round, the dora indicators, the tiles left, the scores and whose turn it is; the hands you do not see lie face down
- A panel beside the table (under it on a phone) with everything that is words: the round, the players and their scores, the list of rounds and, at a round's end, the result. Nothing ever covers the table
- Three-player (sanma) games in all three formats, with the empty seat and the North tiles set aside (kita)
- The table is the step button: click to go forward, right-click to go back, hold to fast-forward, turn the mouse wheel; on a phone, tap, swipe and long press. Every round end is a stop for held keys, wheel bursts and autoplay
- One transport bar under the table: own turns, steps, autoplay at four speeds and a step slider; the round list in the panel (who won and who dealt in) jumps to any round, and jumps are browser history entries, so Back returns to where you were
- View from any player's seat, and show every hand or only that player's; winning hands and the hands revealed at a draw are always shown at the round end
- Waits and shanten: the player list shows each player's waits (with the tiles left, or furiten) or shanten; pointing at a tile outlines every visible copy; the centre console switches to score differences
- Round results with the winning hand and its calls, yaku, han, fu, points, dora and ura dora and the score changes; draws with their reason and each tenpai hand's waits; final standings
- Links to a moment: a sample or Tenhou log opens at the round, step and seat in the address, and Copy link shares it
- A few settings, kept in your browser: waits and shanten, language and single-key shortcuts
- Works from 320 px phones in either orientation to wide screens, in one light theme and in Windows High Contrast mode
- UI in English, Korean and Japanese, with the usual mahjong terms of each language

## Supported logs

- **Tenhou mjlog XML**: Tenhou's own log data. Paste a Tenhou replay link and the viewer downloads it (see [Loading a Tenhou link](#loading-a-tenhou-link)), or open a saved file: the page at `https://tenhou.net/0/log/?<log id>`, or the gzip-compressed `.mjlog` files the Tenhou Windows client keeps. Plain and gzip-compressed files both work.
- **tenhou.net/6 JSON**: the format of the [tenhou.net/6](https://tenhou.net/6/) viewer. A tenhou.net/6 link that contains `#json=` can be pasted as it is.
- **mjai JSONL**: one JSON event per line (a JSON array of events works too), as written by [Mortal](https://github.com/Equim-chan/Mortal), [mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer) and mjai game servers.

Mahjong Soul logs cannot be loaded from a Mahjong Soul link: the viewer can only download logs from tenhou.net. Convert the log to tenhou.net/6 JSON with a tool such as [tensoul](https://github.com/Equim-chan/tensoul) and open or paste the result. When you paste any other link, the viewer explains how to get the log data instead.

## Opening a log

A visit without a log in the address shows a card with every way to open one. While a game is shown, **Open another log** at the foot of the panel offers the same, and dropping or pasting works on the whole page.

- **Choose a file** with the file picker. Any file can be picked; the extension does not matter.
- **Drop a file** anywhere on the page.
- **Paste** the log data or a Tenhou link with Ctrl+V (⌘V on a Mac) anywhere on the page, or into the paste box. Dropping a dragged link works too.

Files larger than 16 MB, far beyond any real log, are refused without being read.

### Loading a Tenhou link

Paste a Tenhou replay link such as `https://tenhou.net/0/?log=2000010100gm-0089-0000-0123abcd&tw=2`, the same link without `https://`, or just the log id (`2000010100gm-0089-0000-0123abcd`). The link's `tw` (the seat it views from) and `ts` (the round it opens at) are kept. The viewer downloads the log from `https://tenhou.net/0/log/?<log id>`, which Tenhou serves to any site. The request carries only the log id; nothing is uploaded.

A download that has not finished after 20 seconds gives up, and the card shows a Cancel button while it runs. If the download fails (for example without a connection, or with a wrong log id), the viewer shows that page's address so you can open it, save it with Ctrl+S (⌘S on a Mac) and drop the file, or copy all of it and paste it; the paste box keeps the replay link, so trying again is one press of Open. To find a log id by hand, take the part of the replay link after `log=` up to the next `&`.

### Samples

The card and the Open dialog have a button for each sample, and a link can open a sample directly:

- https://sadtreap.github.io/mahjong-paifu-viewer/?sample=tenhou-json: a short ranked game of three rounds with calls and wins up to haneman (tenhou.net/6 JSON)
- https://sadtreap.github.io/mahjong-paifu-viewer/?sample=sanma: a three-player East-only game of five rounds with kita, riichi, a draw and wins up to mangan, written for this project (tenhou.net/6 JSON)

The samples and their licenses are listed in [public/samples/README.md](public/samples/README.md).

### Links to a moment

A sample or a downloaded Tenhou log keeps its place in the address: `?sample=<id>` or `?tenhou=<log id>`, plus `round`, `step` and `pov` (the seat you view from), e.g. `?sample=tenhou-json&round=3&step=48&pov=2`. All three count from 1, like the round list, the step slider and the seat keys. Numbers out of range are clamped and invalid values are ignored. **Copy link to this moment** at the foot of the panel copies the link to the current moment. A local file or pasted log data is not in the address, so it has no link; Back and Forward still return to its earlier moments while the page is open.

## Controls

Everything has a labelled control: the transport bar under the table (own turn, step, play and speed buttons, and the step slider) and the panel (Previous round and Next round beside the round's name, Show all hands, a row per player that views the table from that seat, a row per round that jumps to it, and Open another log, Copy link, Settings and Controls at its foot). The **Controls** dialog (`?`) lists the keys, the mouse and touch. On the table, only the centre console is a button: it switches the other players' scores to their differences from yours.

When a round ends, its result appears in the panel (who won, the hand, the yaku and the value, or the kind of draw) and the player list shows how the scores moved and, at a draw, who was tenpai. The table stays in view the whole time; **Next round**, or one more step forward, leaves the round.

### Mouse

| Input                              | Action                                             |
| ---------------------------------- | -------------------------------------------------- |
| Click the table                    | Next step                                          |
| Right-click (Ctrl+click on a Mac)  | Previous step                                      |
| Shift+click / Shift+right-click    | Next / previous own turn                           |
| Press and hold (left / right)      | Fast-forward / rewind, stopping at the round's end |
| Mouse wheel over the table         | Step (with Shift: own turn)                        |
| Point at a tile                    | Outline every visible copy of it                   |
| Alt+click (Option+click) a discard | Go to the moment before it was discarded           |
| Click the centre console           | Score differences on / off                         |

### Touch

| Gesture                | Action                                            |
| ---------------------- | ------------------------------------------------- |
| Tap the table          | Next step                                         |
| Swipe left / right     | Next / previous step (not from the screen's edge) |
| Touch and hold         | Fast-forward                                      |
| Tap the centre console | Score differences on / off                        |

Pinch zoom and page scrolling stay the browser's.

### Keyboard

| Keys              | Action                                          |
| ----------------- | ----------------------------------------------- |
| → / ←             | Next / previous step                            |
| Shift+→ / Shift+← | Next / previous own turn                        |
| ↓                 | Next round                                      |
| ↑                 | Start of this round, then the previous round    |
| Home / End        | Round start / round result                      |
| Space             | Autoplay on / off                               |
| + / −             | Autoplay faster / slower                        |
| 1–4               | View from that seat (1–3 in three-player games) |
| V / Shift+V       | View from the next / previous player            |
| H                 | Show / hide all hands                           |
| W                 | Waits and shanten on / off                      |
| D                 | Score differences on / off                      |
| ?                 | Controls                                        |
| Esc               | Stop autoplay                                   |

The single-key shortcuts (letters, digits, punctuation and Space) can be turned off in the settings; every one of them also has a button. The shortcuts work anywhere except while typing in a text field, in a select box or in a dialog; the focused step slider keeps the arrow keys, Page Up / Page Down and Home / End, as sliders do. Holding a key, fast wheel turns and autoplay stop at each round result; press again to go on. Screen readers hear each step, and what a key changed, from one live region.

## Development

Requirements: Node.js 22.12+, 24 or 26+ (odd-numbered releases are not supported by Vitest) and pnpm 12 (the exact version is pinned in `package.json`).

```sh
pnpm install   # also installs the git hooks
pnpm dev       # start the dev server
```

| Command          | What it does                        |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | Start the Vite dev server           |
| `pnpm build`     | Typecheck and build into `dist/`    |
| `pnpm preview`   | Serve the production build locally  |
| `pnpm lint`      | Lint and format-check with Biome    |
| `pnpm lint:fix`  | Apply Biome fixes and formatting    |
| `pnpm typecheck` | Run the TypeScript compiler         |
| `pnpm test`      | Run the unit tests once with Vitest |

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style, commit rules and the deploy flow.

## Credits

- Tile images: [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles), public domain ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)). See [public/tiles/README.md](public/tiles/README.md).
- The test data of convlog, the tenhou.net/6 to mjai converter in [Equim-chan/mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer), is licensed under the Apache License 2.0. Its tenhou.net/6 logs are the test fixtures in `src/formats/tenhou-json/__fixtures__/convlog` and the `tenhou-json` sample in `public/samples`. The license text is kept next to each copy.

## License

[MIT](LICENSE)
