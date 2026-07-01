# jakeforge — Claude Overrides

`AGENTS.md` is the canonical guide. It is imported below, so its rules load
into context every session — no separate read step. `CONTINUITY.md` is **not**
imported (it changes constantly); read it fresh before acting. This file adds
Claude-specific behavior; when it conflicts with `AGENTS.md`, this file wins.

@AGENTS.md

## Tool Use

- `Read` before `Edit`/`Write`. Never `Write` without reading first.
- Prefer `Edit` for targeted changes; use `Write` only for new files or
  intentional full-file replacements.
- Prefer `Glob`/`Grep` for codebase searches; otherwise use `rg`.
- Use `Bash` for project commands, tests, builds, and git. Do not use shell write
  tricks to overwrite files when `Edit`/`Write` is safer.
- Keep command output focused. Do not dump broad environments, secrets, or large
  generated logs into chat.

- Run all commands from the project root. `npm run dev` runs `server.mjs`
  (frontend + LaTeX API together); there is no separate Vite process to start.
- A bound port 5186 means the app is already running — connect to it, do not
  start a second server.
- LaTeX PDF (`/api/render-resume-latex` with `wantsPdf`) needs a local Tectonic
  binary; when it is absent the server returns a `pdfError` and the UI falls back
  to browser-print "PDF · clean". Don't treat a missing-Tectonic failure as a
  code bug.

## Visual QA

Verify major UI changes in a browser when feasible (`AGENTS.md` default).
Pick the tool by what you're verifying:

- **Layout / responsive / visual fidelity** → **Claude in Chrome**
  (`mcp__Claude_in_Chrome`): real window, accurate at any width
  (`resize_window`, e.g. 1440 / 768 / 375), faithful screenshots.
- **Content / computed styles / tokens / console** → **Claude Preview**
  (`mcp__Claude_Preview`): `preview_snapshot` / `preview_inspect` are
  deterministic (no pixel-guessing); `preview_screenshot` for a glance, fall
  back to snapshot/inspect if blank.
- If the chosen tool's bridge isn't connected, use the other and note the gap.

Default: **Claude in Chrome** — `npm run dev`, then navigate to
`http://localhost:5186`. The editor is a layout-and-typography surface (an
on-page resume), so prioritize a real-window screenshot; for a LaTeX change, also
open "Preview PDF" and confirm the Tectonic render. Expect a harmless Vite HMR
websocket line only if a sibling Vite already holds port 24686.

## Communication

Think privately; do not print raw reasoning. Report actions, blockers,
verification, skipped checks, and final outputs, and skip preambles unless they
help the user act. After material work, open with a brief ledger snapshot
(Goal, Now, Next, Open Questions).
