# CLAUDE.md

Browser-based viewer for Tenhou and mjai mahjong game logs, deployed to GitHub Pages as a static site.

Project conventions (stack, style, i18n, tests, commits, deploy) are in @CONTRIBUTING.md. Follow them.

## Rules for Claude

- Never add a `Co-Authored-By` trailer, a "Generated with Claude Code" line or any other attribution to commits or PR descriptions. `.claude/settings.json` turns attribution off and commitlint rejects co-author trailers.
- Never hard-wrap commit message bodies. Each paragraph or bullet is one line.
- Before committing, run `pnpm lint && pnpm typecheck && pnpm test`.
- Only commit or push when asked.
- Every user-visible string goes through i18n: add it to `src/i18n/messages/en.ts`, then `ko.ts` and `ja.ts`.
