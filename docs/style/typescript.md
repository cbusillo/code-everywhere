# TypeScript Style

## Tooling

- Format with Prettier: `pnpm format`
- Lint with ESLint: `pnpm lint`
- Type check with TypeScript: `pnpm typecheck`
- Full gate: `pnpm validate`

## Formatting

- 4-space indentation.
- Double quotes by default.
- No semicolons.
- Trailing commas in multiline arrays, objects, params, and imports.
- Keep line length around 133 characters where practical.

## Types

- Prefer modern, clean TypeScript and JavaScript patterns supported by the repo's configured stable ECMAScript target.
- Keep the toolchain on the latest stable ECMAScript target available to the pinned TypeScript version; reserve `ESNext` for deliberate proposal-level adoption.
- Do not downlevel syntax or APIs out of habit. Choose older patterns only for readability, compatibility, or a concrete runtime constraint.
- Type public APIs, exported functions, component props, and protocol/data shapes explicitly.
- Prefer inference for obvious local variables.
- Avoid `any`; use `unknown` at boundaries and narrow intentionally.
- Use discriminated unions for protocol events, commands, and UI state.
- Keep transport DTOs separate from UI view models when the distinction matters.

## React

- Prefer function components.
- Keep components focused on one responsibility.
- Put reusable domain logic in hooks or plain TypeScript modules.
- Use framework primitives before custom widgets.
- Keep product actions explicit: approval decisions, input responses, session commands, and navigation should have named handlers.

## Imports

- Prefer named exports for shared utilities and domain types.
- Avoid barrel files until a package has enough surface area to justify them.
- Keep dependency direction clear: UI can depend on contracts; contracts should not depend on UI.

## Errors

- Model expected failures as typed states when they affect UI.
- Throw errors for programmer mistakes and impossible states.
- Preserve enough context to debug stale session epochs, rejected commands, and notification delivery issues.
