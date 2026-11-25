# Mahjong Paifu Viewer

A browser-based viewer for riichi mahjong game logs (paifu) from [Tenhou](https://tenhou.net/) and [mjai](https://github.com/gimite/mjai). It runs entirely client-side as a static site on GitHub Pages: logs are read in your browser and never uploaded. The only other site it contacts is tenhou.net, to download the log of a Tenhou link you paste.

**Live site:** https://sadtreap.github.io/mahjong-paifu-viewer/ ([open a sample game](https://sadtreap.github.io/mahjong-paifu-viewer/?sample=tenhou-json))

> Status: early release. All three log formats load and replay; please report logs that fail to open or show something wrong.

## Features

- Reads Tenhou mjlog XML, tenhou.net/6 JSON and mjai JSONL, detecting the format from the content
- Paste a Tenhou replay link or log id and the viewer downloads the log from tenhou.net
- Square table with hands, melds, discards (riichi tiles sideways, tsumogiri dimmed, called tiles faded), dora indicators, riichi sticks, honba and tiles left
- Step through each round with buttons, a slider or the keyboard, or jump to any round
- Rotate the table to any player's point of view, and show every hand or only that player's; winning hands and the hands revealed at a draw are always shown at the round end
- Round results with the winning hand and its calls, yaku, han, fu, points, ura dora and point changes; draws with their reason and tenpai players; final standings
- Works on narrow screens and follows the system light or dark theme
- UI in English, Korean and Japanese, including Tenhou's room, rule and rank names

Only four-player games are supported; three-player (sanma) logs are rejected with a message.

## Supported logs

- **Tenhou mjlog XML**: Tenhou's own log data. Paste a Tenhou replay link and the viewer downloads it (see [Loading a Tenhou link](#loading-a-tenhou-link)), or open a saved file: the page at `https://tenhou.net/0/log/?<log id>`, or the gzip-compressed `.mjlog` files the Tenhou Windows client keeps. Plain and gzip-compressed files both work.
- **tenhou.net/6 JSON**: the format of the [tenhou.net/6](https://tenhou.net/6/) viewer. A tenhou.net/6 link that contains `#json=` can be pasted as it is.
- **mjai JSONL**: one JSON event per line (a JSON array of events works too), as written by [Mortal](https://github.com/Equim-chan/Mortal), [mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer) and mjai game servers.

Mahjong Soul logs cannot be loaded from a Mahjong Soul link: the viewer can only download logs from tenhou.net. Convert the log to tenhou.net/6 JSON with a tool such as [tensoul](https://github.com/Equim-chan/tensoul) and open or paste the result. When you paste any other link, the viewer explains how to get the log data instead.

## Opening a log

- **Choose a file** with the file picker. Any file can be picked; the extension does not matter.
- **Drop a file** anywhere on the page.
- **Paste** the log data or a Tenhou link into the box on the start page, or press Ctrl+V (⌘V on a Mac) anywhere on the page. Dropping a dragged link works too.

Files larger than 16 MB, far beyond any real log, are refused without being read.

### Loading a Tenhou link

Paste a Tenhou replay link such as `https://tenhou.net/0/?log=2000010100gm-0089-0000-0123abcd&tw=2`, the same link without `https://`, or just the log id (`2000010100gm-0089-0000-0123abcd`). The viewer downloads the log from `https://tenhou.net/0/log/?<log id>`, which Tenhou serves to any site. The request carries only the log id; nothing is uploaded.

If the download fails (for example without a connection, or with a wrong log id), the viewer shows that page's address so you can open it, save it with Ctrl+S (⌘S on a Mac) and drop the file, or copy all of it and paste it. To find a log id by hand, take the part of the replay link after `log=` up to the next `&`.

### Samples

The start page has a **Try a sample** button, and a link can open the sample directly:

- https://sadtreap.github.io/mahjong-paifu-viewer/?sample=tenhou-json: a short ranked game of three rounds with calls and wins up to haneman (tenhou.net/6 JSON)

Add `&round=<n>&step=<n>` to open at a position, e.g. `?sample=tenhou-json&round=3&step=48`. Both count from 1, like the round list and the step counter. Numbers out of range are clamped and invalid values are ignored. The sample and its license are listed in [public/samples/README.md](public/samples/README.md).

## Keyboard shortcuts

| Keys       | Action                         |
| ---------- | ------------------------------ |
| ← / →      | Previous / next step           |
| ↑ / ↓      | Previous / next round          |
| Home / End | First / last step of the round |

The shortcuts work anywhere except while typing in a text field, using a select box or the step slider. The focused slider keeps its own keys, as sliders do: all arrow keys, Page Up / Page Down and Home / End move it within the current round. Page Up and Page Down are not shortcuts, so they scroll the page, for example to the round result below the board on a phone.

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
- The test data of convlog, the tenhou.net/6 to mjai converter in [Equim-chan/mjai-reviewer](https://github.com/Equim-chan/mjai-reviewer), is licensed under the Apache License 2.0. Its tenhou.net/6 logs are the test fixtures in `src/formats/tenhou-json/__fixtures__/convlog` and the sample in `public/samples`. The license text is kept next to each copy.

## License

[MIT](LICENSE)
