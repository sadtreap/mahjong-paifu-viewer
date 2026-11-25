# Mahjong Paifu Viewer

A browser-based viewer for riichi mahjong game logs (paifu) from [Tenhou](https://tenhou.net/) and [mjai](https://github.com/gimite/mjai). It runs entirely client-side as a static site on GitHub Pages.

**Live site:** https://sadtreap.github.io/mahjong-paifu-viewer/

> Status: early development. The project scaffold is in place; log loading and replay are not implemented yet.

## Features

- UI in English, Korean and Japanese

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

## License

[MIT](LICENSE)
