# UI/UX Style

## Direction

Design for operation, not marketing.

The UI should answer, in order:

1. What sessions exist?
2. What needs attention?
3. What changed or failed?
4. What should I do next?

## Framework Direction

Prefer existing UI systems and primitives:

- React for the web cockpit
- shadcn/ui for component composition
- Radix UI for accessible primitives
- Tailwind for styling
- lucide-react for icons
- Capacitor or SwiftUI for Apple-native client capabilities

## Layout

Use a stable cockpit layout before inventing new surfaces:

```text
Sessions list | Active session and turn timeline | Pending work and actions
```

The center region is the primary working surface. The right region is for decisions and immediate action. The left region is for navigation and triage.

## Visual Rules

- Keep the palette restrained.
- Use semantic status colors consistently.
- Prefer dividers, spacing, and typography before adding decorative cards.
- Cards are acceptable for real units of work: approval request, input request, session summary, notification item.
- Do not use landing-page hero patterns inside the app.
- Do not make every panel the same weight.
- Do not hide critical state in low-contrast text.

## Interaction Rules

- Pending approvals and requested input must be obvious and actionable.
- Buttons should name real commands: approve, deny, reply, pause, continue, end.
- Destructive actions need confirmation when they can end or interrupt work.
- Stale commands should fail visibly with a useful explanation.
- Notifications should deep-link to the relevant session and pending item.

## Mobile

On iPhone, prioritize:

- attention queue
- active session detail
- approval/input forms
- concise reply flow

On iPad and Mac, prioritize the full three-region cockpit.
