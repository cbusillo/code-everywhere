# Product Goals

## Purpose

Code Everywhere is a structured GUI for Every Code sessions. It should make Every Code useful from the places where an operator actually lives: Mac, iPad, iPhone, and a desktop browser when that is convenient.

It exists because a TUI in a browser is not enough, and Discord is a clever bridge but not the final product surface.

## Core Promise

When Every Code needs attention, Code Everywhere should make the next action obvious.

The operator should be able to:

- see every trusted active session
- know which sessions need attention
- answer requested input
- approve or deny actions
- reply to a running session
- pause, continue, or end a session
- inspect status, recent turns, and important artifacts
- receive useful notifications on iOS, iPadOS, and macOS

## Non-Goals

- Do not rebuild a terminal emulator as the primary UI.
- Do not require pairing every new session.
- Do not make Discord the product architecture.
- Do not make the user design their own cockpit from primitives.
- Do not depend on Codex CLI app-server as the backend; Every Code is the runtime.

## Product Shape

The product should feel like an operator cockpit:

- sessions list on the left
- active turn/feed in the center
- pending approvals, requested input, and session actions on the right
- notification center for blocked, completed, failed, and disconnected sessions

The UI should optimize for scanning and action, not spectacle.

## Apple Platform Expectations

iOS, iPadOS, and macOS are first-class targets. A PWA can be useful for fast iteration, but the product should be ready for a native wrapper or native client because notifications, deep links, Keychain, and OS integration are part of the experience.

The first Apple checkpoint is a native Apple wrapper around the shared web
cockpit rather than a PWA-only path or full native rewrite. Native code should
start by owning platform concerns such as Keychain storage, notification
routing, notification actions, deep links, and device identity while the React
cockpit remains the shared session and operator workflow surface. APNs
registration and device-token upload should follow only after local
notification routes and device identity are explicit.
