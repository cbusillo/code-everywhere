# Code Everywhere

Code Everywhere is the planned first-class control surface for Every Code sessions.

The goal is not to put a terminal in a browser. The goal is a structured cockpit where trusted Every Code sessions appear automatically and the operator can see status, answer prompts, approve or deny actions, reply to turns, pause/resume work, and get useful notifications on Apple devices.

## Product Direction

- Every Code remains the runtime and source of truth for agent sessions.
- Code Everywhere is the GUI/client layer for those sessions.
- Sessions should appear in the client after host/device/account trust, without pairing each session.
- The interface should be structured around sessions, turns, approvals, requested input, diffs, status, and notifications.
- iOS, iPadOS, and macOS should be treated as first-class clients.

## Current Status

This repository is a new product shell. It currently has shared contracts, an
in-memory server ingestion/projection package with a lightweight local HTTP
transport, and a web cockpit that can use either projected fake data or a local
HTTP snapshot and command inbox.

Workspace packages:

- `packages/contracts`: shared session, turn, approval, requested-input, command, and projection types/helpers.
- `packages/server`: in-memory cockpit event ingestion, command inbox, snapshot
  projection, and local HTTP transport boundary.
- `apps/web`: React/Vite cockpit UI for projected fake data or local HTTP
  snapshots and command dispatch.

Useful entry points:

- [Product Goals](docs/product-goals.md)
- [Architecture](docs/architecture.md)
- [Every Code Integration](docs/every-code-integration.md)
- [Code Style](docs/style/coding-standards.md)
- [Repository Settings](docs/repo-settings.md)

## Local Setup

```sh
corepack enable
pnpm install
pnpm validate
```

The web cockpit uses projected fake data by default. To point it at a local
cockpit HTTP server, run Vite with `VITE_COCKPIT_HTTP_URL` set to the server
root:

```sh
pnpm cockpit:server
VITE_COCKPIT_HTTP_URL=http://127.0.0.1:4789 pnpm --filter @code-everywhere/web dev
```

For faster local smoke polling, set `VITE_COCKPIT_POLL_INTERVAL_MS` to a
positive millisecond interval.

The local server binds to `127.0.0.1:4789` by default. Override it with
`CODE_EVERYWHERE_HOST`, `CODE_EVERYWHERE_PORT`, `--host`, or `--port` when a
different local endpoint is needed.

## References

- Every Code fork: `../code` locally, `https://github.com/cbusillo/code`
- Every Code Discord bridge reference: `../discord-blue/discord_blue/doodads/every_code`
- Existing tests for the Discord bridge: `../discord-blue/tests/test_every_code.py`
