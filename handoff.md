# Burn After Reading

This file is a temporary handoff prompt for the next session. Read it once, create a durable plan in `docs/` or the repository's planning location, then delete `handoff.md` in the same first change.

Do not preserve this file as project documentation. Its job is to transfer context into the first implementation session and then disappear.

## First Prompt

Read `AGENTS.md` and the docs under `docs/`, especially:

- `docs/product-goals.md`
- `docs/architecture.md`
- `docs/every-code-integration.md`
- `docs/ui-reference.md`
- `docs/style/ui-ux.md`
- `docs/style/typescript.md`
- `docs/style/testing.md`

Then create a durable implementation plan for the first Code Everywhere spike and commit it somewhere permanent, such as `docs/plans/first-cockpit-spike.md`.

After the plan exists, delete this `handoff.md` file.

The first spike should build a fake-data structured cockpit for Every Code sessions. Do not build a terminal stream. The cockpit should show:

- session list with running, idle, blocked, waiting-for-input, waiting-for-approval, ended, and error states
- active session detail
- turn timeline
- pending approval surface
- requested-input form surface
- reply, pause, continue, status, and end controls
- enough fake protocol-shaped data to exercise the UI states

Use the current Every Code references:

- local Every Code fork: `../code`
- Every Code fork remote: `https://github.com/cbusillo/code`
- Discord DUI bridge reference: `../discord-blue/discord_blue/doodads/every_code`
- Discord DUI tests: `../discord-blue/tests/test_every_code.py`

Use the UI reference hierarchy in `docs/ui-reference.md`:

- Linear for the main cockpit and triage model
- Sentry for blocked/error/session detail pages
- GitHub Actions for turn timelines, expandable steps, and artifacts/logs
- Raycast for command palette and quick actions
- Apple HIG for iOS/iPadOS/macOS behavior and notifications
- T3 Code only as a domain reference for coding-agent sessions, turns, approvals, and diffs

Implementation direction:

- React + TypeScript
- shadcn/ui-style composition
- Radix primitives
- Tailwind styling
- lucide-react icons
- fake data first, live Every Code bridge later

Validation expectations:

- run `pnpm validate`
- run the app locally if an app is added
- review in a real browser
- capture desktop and narrow/mobile screenshots or describe what was checked
- if the visual design is the hard part, prepare a clear handoff to an outside Claude/Codex GUI app session rather than relying on this harness alone
