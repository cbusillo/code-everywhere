# Testing Style

## Goals

Tests should protect protocol behavior, state projection, and operator actions.

High-value areas:

- Every Code event normalization
- stale epoch handling
- approval and requested-input workflows
- reconnect/resync behavior
- notification routing decisions
- UI rendering for blocked, running, completed, and failed sessions

## Commands

- Test: `pnpm test`
- Full gate: `pnpm validate`

## Style

- Prefer small deterministic tests over broad snapshots.
- Use fixtures for representative Every Code sessions and events.
- Keep UI tests focused on visible state and operator actions.
- Add regression tests when fixing protocol, state, or notification bugs.
- Avoid tests that require live APNs, Apple credentials, or a real Every Code process unless they are explicitly marked as integration/manual validation.
