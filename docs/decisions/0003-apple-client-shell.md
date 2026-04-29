# 0003: Apple Client Shell

## Status

Accepted

## Context

Code Everywhere is Apple-first, but the first working client is the React web
cockpit. That cockpit now carries the product model for sessions, turns,
pending work, commands, local broker state, and local trust records.

The next Apple checkpoint needs native behavior for notifications, deep links,
and device-held credentials without forking the cockpit UI or duplicating the
session projection model before the product shape is stable.

The realistic first-shell choices are:

- PWA bridge: fastest to try, but weak for APNs, Keychain, notification actions,
  and platform-correct deep-link behavior.
- Full SwiftUI client: strongest native feel, but likely duplicates the React
  cockpit and slows iteration before the session model is finished.
- Native Apple wrapper around the shared web cockpit: preserves the current UI
  investment while adding native integration points where the web cannot.

## Decision

The first Apple client checkpoint should be a native Apple wrapper around the
shared web cockpit, not a PWA-only path and not a full native rewrite.

The wrapper should be SwiftUI-based and host the cockpit in a native web view
while keeping the broker/client protocol shared with the web app. Native code
should own only Apple-specific concerns at first:

- storing device-held secrets or broker credentials in Keychain
- registering for APNs and routing notification actions
- handling universal links or custom deep links into a session or pending item
- exposing platform shell behavior such as windows, sidebars, menu commands, and
  share/open affordances where useful
- identifying the client device for future broker-mediated device trust

The React cockpit remains the source for session presentation and operator
workflows until there is a clear reason to replace individual surfaces with
native SwiftUI views.

The first implementation checkpoint should be a minimal `apps/apple` shell that
can load the existing cockpit against a configured local broker, persist local
connection credentials in Keychain, and prove one deep-link route into a session
or pending item. APNs registration and notification actions can follow once the
device identity path is in place.

## Consequences

- Product iteration remains centered on the shared cockpit instead of splitting
  web and native UI logic immediately.
- Apple-native work can start where it matters most: credentials, device
  identity, notifications, and deep links.
- The repo can add Apple build/test/release metadata only when the shell lands,
  rather than adding inactive native infrastructure now.
- A future full SwiftUI client remains possible if repeated wrapper limitations
  appear, but that decision should be based on actual native integration needs.
- A PWA can still be useful for fast web testing, but it is not the production
  Apple-client strategy.
