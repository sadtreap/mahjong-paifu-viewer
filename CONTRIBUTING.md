# Contributing

## Stack

- React 19 + TypeScript (strict) + Vite
- CSS Modules for styling
- Vitest for unit tests
- Biome for linting and formatting
- pnpm 12, Node.js 22.12+, 24 or 26+ (odd-numbered releases are not supported by Vitest)

## Setup

```sh
pnpm install
```

`pnpm install` runs the `prepare` script, which installs the git hooks (lefthook):

| Hook         | Runs                                                    |
| ------------ | ------------------------------------------------------- |
| `pre-commit` | `biome check --write` on staged files, re-staging fixes |
| `commit-msg` | commitlint                                              |
| `pre-push`   | `pnpm lint`, `pnpm typecheck` and `pnpm test`           |

## Code style

Biome enforces formatting and lint rules (`biome.json`); run `pnpm lint:fix` to apply them.

- 2-space indentation, double quotes, semicolons, trailing commas, 100-column lines, LF line endings.
- Prefer named exports. Default exports are only for files a tool requires them in (e.g. `vite.config.ts`).
- Component styles live next to the component as `Component.module.css`.
- Persist browser state only through `src/storage.ts`, which namespaces localStorage keys (all project sites on `sadtreap.github.io` share one origin). User preferences go in the one versioned settings blob of `src/ui/settings/settings.ts`.
- Code comments, docs and commit messages are written in English.

## Internationalization

Every user-visible string goes through `src/i18n`. Never hard-code UI text in components.

1. Add the key to `src/i18n/messages/en.ts`; it defines the `Messages` type.
2. Add the same key to `ko.ts` and `ja.ts`; the typecheck fails until every locale has it.
3. Read it in components with `const { m } = useI18n()`, e.g. `m.app.title`.

Strings that need values are functions, e.g. `` round: (n: number) => `Round ${n}` ``.

Text the parsers take from a log (player names, unknown yaku, rule text they cannot read) is shown as it is. Anything the app itself knows, such as Tenhou's rooms and ranks, comes from structured model fields and is localized.

## Accessibility

- Text needs a contrast of 4.5:1 in both themes; `src/ui/theme.test.ts` checks the color tokens in `src/index.css`.
- Anything drawn only with backgrounds (sticks, highlights) needs a `@media (forced-colors: active)` rule, or it disappears in Windows High Contrast mode.
- A button that can reach its limit when pressed (Last step) uses `aria-disabled`, not `disabled`, so it keeps the focus.
- When a view or message replaces the control that had the focus, move the focus on purpose (see `src/ui/shell/Shell.tsx`, `src/ui/Viewer.tsx` and `src/ui/ErrorMessage.tsx`).
- Announce each change once: the dock's status line (`src/ui/controls/StatusLine.tsx`) is the only live region of the viewer, and it stays quiet during autoplay, holds, wheel bursts and scrubs.
- Keep clicks on the table for stepping: nothing on the felt is a button (the plates are display only), and hover aids never take the pointer. Anything clickable over the stage (cards, menus, sheets) carries `data-gesture="ignore"`.
- Every mouse or touch action needs a keyboard or button equivalent. The keyboard map lives in one table, `src/ui/viewer/shortcuts.ts`, which both the key handler and the help dialog read.
- Check layout changes in a browser at 320 px, a phone in landscape and desktop width; the tests run in happy-dom, which does not lay out CSS. The page layouts are the breakpoints of `src/ui/breakpoints.ts`, repeated verbatim in `src/ui/Viewer.module.css` (`theme.test.ts` checks it).

## Tests

Tests are colocated with the code as `*.test.ts(x)` and run with `pnpm test`. Parsers and replay logic should be covered by unit tests, ideally with real log fixtures whose license allows it.

- Tests run in Node by default; component tests start with `// @vitest-environment happy-dom`.
- Tests are typechecked with `tsconfig.test.json`, which adds the Node.js types, so tests can read files with `node:fs`. App code (`tsconfig.app.json`) cannot use Node APIs.
- Fixtures live in a `__fixtures__` folder next to the code that uses them; shared test helpers live in `src/test`.
- Anonymize real logs before committing them: replace the player names with "A", "B", "C" and "D" and remove the log id. Third-party data keeps its license text and a README naming the source and the changes next to it.
- Tenhou's mjlog game records carry no license and are never committed. The mjlog parser is tested on XML written by `src/test/mjlog-serialize.ts`, a test-only encoder that turns hand-built games and the tenhou.net/6 fixtures into Tenhou-style mjlog; `parseMjlog(toMjlogXml(game))` must give back `stripMjlogUnsupported(game)`, which lists what mjlog cannot carry.
- The other formats have test-only writers too: `src/test/tenhou-json-serialize.ts` (tenhou.net/6 as Tenhou exports it) and `src/test/mjai-serialize.ts` (convlog's mjai, and two three-player shapes). Each has a `strip…Unsupported` function listing what its format cannot carry. `src/formats/cross-format.test.ts` sends the same games through all three formats, including the synthetic three-player game in `src/test/sanma-game.ts`, whose scoring is real.
- To check the parsers and writers against real games, point these variables at folders of real logs (several folders are separated by `:`, or `;` on Windows). Such corpora are never committed, and the tests that read them are skipped when the variables are unset (`src/test/corpus.ts`):
  - `MJLOG_CORPUS_DIR`: mjlog XML files of any games.
  - `SANMA_MJLOG_CORPUS_DIR`: mjlog XML files of three-player games.
  - `TENHOU_JSON_SANMA_CORPUS_DIR`: Tenhou's own tenhou.net/6 exports of three-player games.

  For example, `MJLOG_CORPUS_DIR=~/tenhou-logs pnpm test src/formats`. Each mjlog game is compared with Tenhou's own scores and hands, replayed with `checkGame`, and must come back unchanged from `toMjlogXml`, tag for tag. It must also give the same game written as tenhou.net/6 JSON and as mjai. The tenhou.net/6 exports must come back entry for entry from `toTenhouJson`.
- The sample logs offered on the welcome card and in the Open dialog live in `public/samples` (listed in `src/ui/samples.ts`) and follow the same rules.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked by commitlint, both locally (`commit-msg` hook) and in CI.

```
<type>(<optional scope>): <subject>

<optional body>
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Subject: imperative mood, lowercase start, no trailing period. Example: `feat(parser): add tenhou mjlog parser`.
- **No line-length limit.** Do not hard-wrap; write each paragraph or bullet on a single line.
- **No `Co-authored-by` trailers** or other attribution lines. commitlint rejects them.

## Branching and deployment

- Work is pushed directly to `main`. The `pre-push` hook runs lint, the typecheck and tests first.
- CI (`.github/workflows/ci.yml`) runs on every push to `main`, on pull requests and on manual runs. It lints the commit messages a push or pull request adds (on the first push or after a force-push, every commit on the branch), then runs Biome, the typecheck, tests and the build.
- On `main`, a passing CI run deploys `dist/` to GitHub Pages.
