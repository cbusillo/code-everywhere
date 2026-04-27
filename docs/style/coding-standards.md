# Coding Standards

## Purpose

Define project-wide rules and guardrails for Code Everywhere.

## Core Rules

- Use `pnpm` for Node and TypeScript tasks.
- Keep docs, tests, and implementation in the same change when behavior shifts.
- Prefer framework components and established patterns over custom UI invention.
- Prefer clear, descriptive names over abbreviations.
- Keep functions small and single-purpose.
- Extract shared logic when duplication becomes meaningful.
- Prefer code that needs no comments. Use comments for why, constraints, or decision links.
- Do not commit secrets, local tokens, APNs keys, provisioning profiles, or operator-local environment files.
- Fix root causes instead of adding workaround-only behavior.
- Fail clearly when the right behavior is blocked by missing credentials, missing trust, or stale session state.

## Naming

- TypeScript variables/functions: `camelCase`
- TypeScript classes/components/types: `PascalCase`
- Files: prefer `kebab-case` for non-component files and `PascalCase` for React components when the framework convention benefits from it.
- Avoid cryptic abbreviations. Allowed common tokens: `id`, `api`, `ui`, `ux`, `url`, `http`, `json`, `ws`, `ios`, `macos`, `apns`.

## Product Guardrails

- The primary UI is a structured cockpit, not a terminal stream.
- Every Code session identity and epoch semantics must be preserved.
- Stale commands should be rejected visibly.
- Notifications must point to actionable product state whenever possible.

## Style Pages

- [TypeScript](typescript.md)
- [Testing](testing.md)
- [UI/UX](ui-ux.md)
