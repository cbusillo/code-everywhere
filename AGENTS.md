# AGENTS.md - Code Everywhere

Keep this file small. Put durable project knowledge in `docs/` and link to it from here.

## Runtime

- Package manager: `pnpm`
- Language: TypeScript first
- App direction: React + shadcn/ui + Radix + Tailwind for the cockpit, with a native Apple wrapper/client when notifications and device integration matter.

## Commands

- Install: `pnpm install`
- Format check: `pnpm format:check`
- Format: `pnpm format`
- Lint: `pnpm lint`
- Type check: `pnpm typecheck`
- Test: `pnpm test`
- Full gate: `pnpm validate`

## Operating Rules

- Keep living implementation plans in `$HOME/.code/plans`, not in
  the repository. Add, update, and remove those plans as work evolves; only
  commit repo docs when behavior, architecture, commands, or product decisions
  change.
- Do not build a terminal/TUI streaming UI unless the operator explicitly asks for a diagnostic view.
- Model Every Code sessions as structured product objects: sessions, turns, approvals, requested input, status, diffs, messages, and notifications.
- Trusted Every Code sessions should appear automatically in clients; do not introduce per-session pairing as the default flow.
- Prefer framework components and established patterns over custom UI invention.
- Keep Apple clients first-class: iOS, iPadOS, and macOS notification behavior matters to core product design.
- Update docs in the same change when behavior, architecture, commands, or product decisions change.

## Reference Repositories

- Every Code fork: `../code` locally, `https://github.com/cbusillo/code`
- Discord DUI bridge reference: `../discord-blue/discord_blue/doodads/every_code`
- Discord DUI tests: `../discord-blue/tests/test_every_code.py`
