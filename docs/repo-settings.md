# Repository Settings

## Local Repository

This repository should use `main` as the default branch.

## Recommended GitHub Settings

When the GitHub repository is created, use these settings unless the operator chooses otherwise:

- Enable Dependabot alerts.
- Enable Dependabot security updates.
- Enable Dependabot version updates from `.github/dependabot.yml`.
- Enable secret scanning and push protection.
- Enable CodeQL/code scanning.
- Require pull requests before merging to `main` once the first working client exists.
- Require the `CI` workflow before merging to `main`.
- Prefer merge commits by default for auditability.
- Delete head branches after merge.
- Keep Actions permissions read-only by default; grant write permissions per workflow only when needed.

## CI/CD

The repo starts with validation CI only:

- format check
- lint
- type check
- tests
- CodeQL
- Apple Swift package build/test for `apps/apple`
- Apple generated iOS/iPadOS app target build for the simulator

CD is intentionally deferred until the first deploy target is clear. Likely future targets:

- web preview/deploy for the cockpit
- TestFlight build for iOS/iPadOS
- macOS signed build or notarized release

## Dependabot

Dependabot is configured for:

- npm/pnpm dependencies
- GitHub Actions

Add Docker, uv, or other ecosystems only after the repo actually owns those files.
