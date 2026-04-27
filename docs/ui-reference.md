# UI References

## Purpose

Code Everywhere should not depend on the operator or this harness inventing UI/UX from scratch. Use mature product references, real screenshots, and established component systems.

The product should feel like a calm operator cockpit for Every Code sessions, not a terminal emulator, generic AI chat app, or marketing dashboard.

## Reference Hierarchy

### North Star: Linear

Use Linear as the primary product-quality reference.

Why it matters:

- dense but calm workspace
- left navigation with clear state groupings
- focused detail surfaces
- triage/inbox mental model
- keyboard-friendly actions
- clear status transitions
- mobile and desktop versions that still feel like the same product

Map this to Code Everywhere as:

- session list instead of issue list
- attention queue instead of triage inbox
- active session detail instead of issue detail
- status and pending work instead of issue workflow state

### Operational Detail: Sentry

Use Sentry as the reference for detail pages where something needs attention.

Why it matters:

- high-signal issue headers
- main diagnostic content
- metadata and actions in a side rail
- activity/history that supports decisions
- clear distinction between urgent state and supporting context

Map this to Code Everywhere as:

- blocked session detail
- approval/requested-input detail
- error and disconnection detail
- session metadata, host, cwd, branch, turn, and epoch context

### Timeline And Logs: GitHub Actions

Use GitHub Actions as the reference for expandable timelines, run state, logs, and artifacts.

Why it matters:

- workflow status is visible at a glance
- steps can be expanded only when needed
- failure context is easy to find
- artifacts and logs are related to the run rather than floating elsewhere

Map this to Code Everywhere as:

- turn timeline
- tool/action steps
- summaries and expandable details
- command output as supporting detail, not the primary UI

### Fast Actions: Raycast

Use Raycast as the reference for command palette and quick action ergonomics.

Why it matters:

- action names are clear
- keyboard flow is fast
- search and command execution are unified
- power features do not crowd the main interface

Map this to Code Everywhere as:

- quick jump to session
- approve/deny/reply/pause/continue/end actions
- command palette for frequent operator actions

### Apple Clients: Apple Human Interface Guidelines

Use Apple HIG for iOS, iPadOS, and macOS behavior.

Why it matters:

- notifications are part of the core product loop
- native navigation, sheets, sidebars, split views, and deep links should feel platform-correct
- Keychain, APNs, and notification actions need native interaction design

Map this to Code Everywhere as:

- notification actions for approval and requested input where appropriate
- deep links into exact session/pending item
- iPad split-view cockpit
- macOS menu/window behavior when useful

### Visual Research: Real App Screenshots

Use real production app screenshots and pattern libraries such as Mobbin when visual judgment is the hard part.

Why it matters:

- real products reveal spacing, hierarchy, and mobile compromises better than abstract prose
- production screenshots avoid fantasy-dashboard drift
- references can be compared directly against our rendered UI

## Domain Reference: T3 Code

T3 Code is a useful domain reference, not the visual north star and not the backend plan.

Study it for:

- agent session sidebar ideas
- turn timeline and assistant output patterns
- approval surfaces
- diff/status presentation
- coding-agent vocabulary

Do not copy:

- Codex app-server dependency assumptions
- provider lifecycle assumptions
- desktop-only product assumptions
- visual direction when stronger product references apply

## Implementation System

Use established UI primitives before custom design:

- React for the initial web cockpit
- shadcn/ui for component composition and dashboard blocks
- Radix UI for accessible primitives
- Tailwind for styling
- lucide-react for icons
- Capacitor or SwiftUI when native Apple behavior matters

## Review Rule

For visually significant UI work:

1. Build from these references, not from a blank page.
2. Review the rendered app in a browser.
3. Capture screenshots for desktop and narrow/mobile widths.
4. Compare the screenshots to the reference hierarchy above.
5. If visual judgment is the hard part, hand the rendered state to an outside Claude/Codex GUI app session for design iteration.
