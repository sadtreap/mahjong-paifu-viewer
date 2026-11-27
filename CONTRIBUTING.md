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
- Persist browser state only through `src/storage.ts`, which namespaces localStorage keys (all project sites on `sadtreap.github.io` share one origin). User preferences go in the one versioned settings blob of `src/ui/settings/settings.ts`: version 2 holds `view` (`"3d"` or `"flat"`), `showAllHands`, `showWaits`, `charKeys` and `autoplaySpeed`. A version 1 blob is read for those fields and rewritten as version 2; a new field means a new version and a migration there.
- Code comments, docs and commit messages are written in English.

## Internationalization

Every user-visible string goes through `src/i18n`. Never hard-code UI text in components.

1. Add the key to `src/i18n/messages/en.ts`; it defines the `Messages` type.
2. Add the same key to `ko.ts` and `ja.ts`; the typecheck fails until every locale has it.
3. Read it in components with `const { m } = useI18n()`, e.g. `m.app.title`.

Strings that need values are functions, e.g. `` round: (n: number) => `Round ${n}` ``.

Text the parsers take from a log (player names, unknown yaku) is shown as it is. Anything the app itself knows, such as yaku, limit hands and the reasons for a draw, comes from structured model fields and is localized. Korean and Japanese use the usual mahjong terms of each language.

## Layout and look

- The viewer has three arrangements of the same elements: `wide` (desktops and tablets in landscape: the table fills the window, the toolbar and the info chip float over its top corners and the transport bar lies on the felt), `short` (a phone on its side: a column on the right) and `stack` (portrait screens and squarish windows: a top bar, the table, the controls under it). Their media queries live in `src/ui/arrangement.ts`, `useArrangement()` reads them, and every stylesheet that depends on them repeats the strings verbatim (`src/ui/theme.test.ts` checks it). The document order is the same in all three and is the focus order; never reorder with CSS `order`.
- The table's numbers (cameras, console, ponds, hand rows, rails, the places of the seat tags) live only in `src/ui/table/geometry.ts`. The stage writes them as inline custom properties and the table's stylesheets only read `var()`, so the code that needs them too (the discard flight, the captions, the seat tags, the height of the table in the stack arrangement) and the CSS cannot disagree.
- Colours, sizes and motion are custom properties in `src/index.css`, in three labelled blocks: base, chrome (the floating surfaces, the controls and the viewer's page sizes such as `--top-bar`) and table. There is one dark theme. Colours are written `#rrggbb` or `rgb(r g b / a)`; add a token only when something uses it, and delete it with its last use.
- Buttons get their look from the one `button` rule in `src/index.css` and its attributes: `data-variant="primary"` or `"ghost"`, `data-size="lg"`, `data-icon`, and the states `aria-pressed`, `aria-expanded` and `aria-disabled`. A component gives a button its place and size, never its border or colours.
- Checks in a real browser rely on a few hooks in the DOM: `[data-stage]` on the stage, `[data-side="bottom|right|top|left"]` on the seat layers, `img[data-d="seat:index"]` on pond tiles, `[data-own-hand]` on the viewed player's hand, and `data-gesture="ignore"` on the chrome over the stage. Keep them.

## Accessibility

- Text needs a contrast of 4.5:1 on every surface it sits on, including the translucent chrome over each tone of the felt; `src/ui/theme.test.ts` checks the color tokens in `src/index.css`. Focus rings and other marks need 3:1.
- Anything drawn only with backgrounds (the scrubber, the turn bar, sticks, highlights, a pressed toggle, tile backs) needs a `@media (forced-colors: active)` rule, or it disappears in Windows High Contrast mode.
- A button that can reach its limit when pressed (Next step at the end of the game) uses `aria-disabled`, not `disabled`, so it keeps the focus.
- When a view or message replaces the control that had the focus, move the focus on purpose (see `src/ui/shell/Shell.tsx`, `src/ui/Viewer.tsx` and `src/ui/ErrorMessage.tsx`).
- Announce each change once: `src/ui/controls/LiveStatus.tsx`, which is not shown on screen, is the only live region of the viewer. It reads the current step (never a draw the viewer cannot see) and stays quiet during autoplay, holds, wheel bursts and scrubs. Messages such as "Link copied" show as a toast that is `aria-hidden`, and LiveStatus reads them; so does a notice the shell passes in (a download over the game).
- Keep clicks on the table for stepping. The centre console is the one button on the felt: a tap on it toggles the score differences, while a swipe that starts on it and the wheel still step. Hover aids never take the pointer. Chrome over the stage (the toolbar, the info chip, the transport bar, popovers and the result card's layer) carries `data-gesture="ignore"`.
- Every mouse or touch action needs a keyboard or button equivalent. The keyboard map lives in one table, `src/ui/viewer/shortcuts.ts`, which both the key handler and the help dialog read.
- Check layout changes in a browser in all three arrangements, at 320 px wide, on a phone in landscape and at desktop width; the tests run in happy-dom, which does not lay out CSS.

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
- The sample logs offered on the landing card and in the Open dialog live in `public/samples` (listed in `src/ui/samples.ts`) and follow the same rules.

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
