# Every Code Integration

## References

- Every Code fork: `../code`
- Fork remote: `https://github.com/cbusillo/code`
- Upstream Code project: `https://github.com/just-every/code`
- OpenAI Codex upstream: `https://github.com/openai/codex`
- Discord bridge reference: `../discord-blue/discord_blue/doodads/every_code`
- Discord bridge tests: `../discord-blue/tests/test_every_code.py`

## Current Source of Truth

The Discord bridge currently defines the clearest working version of the Every Code remote-control product. Code Everywhere should extract the product model from that implementation while avoiding Discord-specific assumptions.

Important existing concepts:

- `SessionHello` identifies a session with `session_id`, `session_epoch`, optional stable `host_id`, host label, cwd, branch, and pid.
- Session epoch protects against stale commands after reconnects.
- `RemoteCommand` covers reply, continue, pause, end, status, and requested-input responses.
- Approval requests are explicit and require approve/deny decisions.
- `request_user_input` supports structured questions, choices, and free-form input.

## Integration Goals

- Every Code sessions should phone home to a trusted Code Everywhere server or local broker.
- Clients should see sessions automatically after host/device/account trust.
- The UI should show pending approvals and requested input as first-class work items.
- Discord can remain a projection/adapter, but it should not be the only product surface.
- The protocol should support web and Apple-native clients without duplicating session logic.

## Trust And Identity Model

Broker authorization is not product identity. `--auth-token`,
`CODE_EVERYWHERE_AUTH_TOKEN`, `VITE_COCKPIT_AUTH_TOKEN`, bearer auth, and
`X-Code-Everywhere-Token` only decide whether a caller may use broker HTTP
routes. They do not identify a durable host, operator, device, or Every Code
session by themselves.

Code Everywhere should use separate identity concepts:

- **Broker authority**: permission to call local broker routes. Today this is
  loopback-only by default, or a configured shared token when protected or bound
  beyond loopback.
- **Host identity**: the machine or runtime installation that launches trusted
  Every Code sessions. Current projections support optional `hostId` alongside
  `hostLabel`, cwd, branch, pid, and model so legacy publishers can continue
  without host trust while newer publishers can provide stable host identity.
  Broker snapshots derive each session's trust status from `hostId` and the
  local trust registry: `trusted`, `unknown`, `revoked`, or `unidentified` when
  a legacy publisher has no host id.
- **Session identity**: the runtime session represented by `sessionId` and the
  reconnect/staleness scope represented by `sessionEpoch`. Commands and pending
  work must keep using both values.
- **Operator identity**: the human or account allowed to act from a client. The
  web cockpit does not model this yet; future native or relay modes should add it
  before multi-user or remote operation.
- **Device identity**: a trusted web/native client installation. Device trust is
  distinct from host trust: a phone may operate several trusted hosts, and a host
  may publish sessions without being the operator device.

The product rule is automatic trusted-session appearance: once a host and
operator/device trust boundary exists, sessions from that trusted host should
appear without per-session pairing. Pairing every transient session would fight
the Every Code workflow and should remain a diagnostic or recovery path, not the
default interaction model.

The first local trust persistence checkpoint is broker-mediated and file-backed:
keep trusted host/device/operator records in a separate local trust registry such
as `.code-everywhere/trust.json`, while leaving broker auth tokens as route
authorization only. The trust registry stores non-secret ids, labels,
timestamps, and revocation state. Native clients can keep device secrets in OS
storage such as Keychain later, but the broker-owned registry remains the local
source of trusted records.

Before LAN, hosted relay, or Apple notification work, the missing durable fields
to add are:

- an operator/account identifier for clients that can enqueue commands
- a device identifier for native clients and notification routing

Apple clients create a local install-scoped device identity before APNs work.
That identity is non-secret metadata: a stable device id, display label,
platform, creation timestamp, and last-seen timestamp. It can later be mirrored
into the broker trust registry as a trusted device record. Push tokens,
device-held credentials, and any signing or registration secrets must stay out
of user defaults and behind Keychain or another `SecretStore` implementation.

The first Apple-client shell should be a native wrapper around the shared web
cockpit. It should use the same broker snapshot, command, and trust APIs as the
web client while native code handles device-held secrets, notification
registration, notification action routing, and deep links into session or
pending-work state.

## What Not To Port

Avoid carrying Discord-specific concepts into the core model:

- Discord thread IDs
- control message IDs
- reaction names
- message length limits
- Discord role/mention behavior

Those belong in an adapter only.

## First Integration Spike

The first useful spike should render fake or recorded Every Code events into a cockpit:

1. active sessions list
2. one session timeline
3. one approval request
4. one requested-input form
5. reply, pause, continue, and end commands as inert or mocked actions

Only after that should we wire the live bridge.

## Local Command Consumption

The local HTTP transport now separates clients that produce commands from the
Every Code adapter that consumes them:

- start the local broker with `pnpm cockpit:server`; it listens on
  `http://127.0.0.1:4789` by default
- the broker persists local state to `.code-everywhere/cockpit-broker.json` by
  default; pass `--memory` for an ephemeral run or `--data-file <path>` to use a
  different file
- the broker has a separate local trust registry at `.code-everywhere/trust.json`
  by default; pass `--trust-file <path>` or set `CODE_EVERYWHERE_TRUST_FILE` to
  use a different registry file
- `--memory` disables both broker state and trust registry file persistence for
  the run
- loopback-only broker usage remains tokenless by default for local development
- when `--auth-token <token>` or `CODE_EVERYWHERE_AUTH_TOKEN` is set, all broker
  routes require `Authorization: Bearer <token>` or `X-Code-Everywhere-Token`
- binding beyond loopback, such as `--host 0.0.0.0`, requires an auth token
- web and native clients enqueue operator actions with `POST /commands`
- local adapters claim undelivered work with `POST /commands/claim`
- `POST /commands/claim` accepts an optional `sessionId` filter and marks
  returned commands delivered before responding
- local adapters publish `command_outcome` events after runtime command
  handling accepts or rejects claimed work
- adapter code should prefer the typed `claimCockpitCommands` helper exported
  from `@code-everywhere/server/http-client`
- adapter code should publish session events with the typed `postCockpitEvents`
  helper exported from the same module
- `/snapshot` returns projected sessions with `trust.status`; route auth tokens
  authorize broker access but never mark a session trusted
- local trust records can be inspected with `GET /trust`; trusted host records
  can be upserted with `POST /trust/hosts`, and hosts can be revoked with
  `POST /trust/hosts/revoke`
- trusted Apple/native device records can be upserted with
  `POST /trust/devices`, and devices can be revoked with
  `POST /trust/devices/revoke`; these records must not include APNs tokens or
  device-held secrets
- the Apple wrapper has a native device-trust client for `GET /trust`,
  `POST /trust/devices`, and `POST /trust/devices/revoke`; it uses the stored
  broker URL/auth token and local device identity while leaving session
  projection and command handling in the shared cockpit
- web clients pass broker auth with `VITE_COCKPIT_AUTH_TOKEN` when the broker is
  started with a token

The Every Code HTTP remote-inbox adapter claims commands for its active
`sessionId`, translates `SessionCommand` values into the runtime's existing
remote-command handling, and emits projection events as session status and
pending work change. Claimed commands should progress from queued to delivered
to accepted or rejected in the cockpit so operators can tell whether the local
session actually handled them.

## Operator Cockpit States

The web cockpit is a structured operator surface rather than a terminal stream.
It should keep the next action visible and make transport health explicit:

- The top `Next action` strip is derived from live projection state: pending
  approvals, actionable requested input, blocked/error sessions, stale command
  outcomes, and rejected command outcomes.
- Attention items for approvals and requested input keep their pending item id,
  so selecting the strip targets the exact approval/input when a session has
  more than one pending item.
- Requested-input records without questions are not actionable and are excluded
  from the attention queue and active pending-work card.
- Session detail starts with a current-turn summary that shows the active or
  latest turn title, summary, total projected steps, blocked/error signals, and
  step-kind counts before lower-priority metadata and history.
- Session control includes a compact command outcome summary above recent
  command history so retained rejected/stale outcomes remain visible without
  taking over the pending-work surface.
- A compact state banner explains fixture mode, first live connection, broker
  fallback/reconnect, healthy-but-empty live broker snapshots, and retained
  stale-event evidence.
- Stale epoch evidence from `state.staleEvents` is carried into the web fixture
  model so the cockpit can surface stale projection events as operator context,
  not only rejected stale commands.

## Local Smoke Loop

For a quick broker/projection check without launching a TUI, run:

```sh
pnpm smoke:cockpit:turns
```

That smoke starts an in-memory local broker, publishes a live-shaped session
hello, turn start, assistant message step, and turn completion, then verifies
the projected snapshot.

For a browser-backed broker/web reliability check, run:

```sh
pnpm smoke:cockpit:web
```

That smoke starts an in-memory local broker and Vite web cockpit, points the web
app at the broker with `VITE_COCKPIT_HTTP_URL`, first verifies the healthy
no-live-session state, publishes a live session plus stale-epoch evidence,
verifies the cockpit state banner and live session in a real browser, enqueues
status/pause/continue commands from the cockpit, stops the broker to confirm
HTTP fallback, then restarts the broker and verifies live recovery. It requires
the local `ui-browser` helper.

To verify retained/pruned broker state in the browser, run:

```sh
pnpm smoke:cockpit:retained-pruned
```

That smoke seeds a persistent broker with high-volume and stale-epoch events,
restarts the broker from compacted JSON, verifies the retained projection, opens
the web cockpit in a browser, checks post-pruning rendering and fallback copy,
and asserts no horizontal overflow in desktop and constrained-width layouts.

To exercise the local broker and web cockpit with a real trusted Every Code TUI,
run:

```sh
pnpm smoke:cockpit:real-tui
```

That smoke starts a real interactive `code` TUI with Code Everywhere HTTP
enabled, waits for its `session_hello`, verifies it in the web cockpit, sends a
status command from the browser, and waits for the TUI to publish the accepted
command outcome. It requires `code`, `expect`, and `ui-browser` on `PATH`. Set
`CODE_EVERYWHERE_CODE_BINARY=/absolute/path/to/code` to test a specific local
Every Code build when multiple `code` binaries are installed.

For the full live Every Code loop:

1. Start the cockpit server with `pnpm cockpit:server`.
2. Start the web cockpit with:

    ```sh
    VITE_COCKPIT_HTTP_URL=http://127.0.0.1:4789 pnpm --filter @code-everywhere/web dev
    ```

3. Configure Every Code with:

    ```toml
    [remote_inbox]
    code_everywhere_url = "http://127.0.0.1:4789"
    ```

4. Launch `code` and confirm the session appears in the web cockpit.
5. Start a turn and confirm the web cockpit shows the live turn timeline.
6. Exercise reply, status, approval, and requested-input commands from the web
   cockpit and confirm they are claimed by the active Every Code session.
