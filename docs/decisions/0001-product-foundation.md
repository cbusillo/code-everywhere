# 0001 - Product Foundation

## Status

Accepted as initial direction.

## Decision

Code Everywhere will start as an Every Code-native structured cockpit rather than a terminal streaming client or Codex app-server GUI.

The product will use existing UI frameworks and patterns instead of asking the operator to invent UI/UX from scratch.

## Rationale

The existing Discord DUI proves the product need and the protocol shape: sessions, turns, approvals, requested input, replies, and session controls. Discord is useful as a bridge, but it cannot provide the first-class Apple client, notification behavior, or structured operator interface we want.

T3 Code and similar tools are valuable references, but Every Code is the runtime and should remain the source of truth.

## Consequences

- Build around Every Code's protocol and session model.
- Treat T3 Code-style UX as reference material, not a mandatory fork.
- Keep iOS, iPadOS, and macOS in the product design from the start.
- Defer deployment/CD decisions until the first client and host model are clearer.
