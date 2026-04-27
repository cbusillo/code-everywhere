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

This repository is a new product shell. It intentionally starts with documentation, repo hygiene, and a small contracts package so we can build the first client deliberately.

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

## References

- Every Code fork: `../code` locally, `https://github.com/cbusillo/code`
- Every Code Discord bridge reference: `../discord-blue/discord_blue/doodads/every_code`
- Existing tests for the Discord bridge: `../discord-blue/tests/test_every_code.py`
