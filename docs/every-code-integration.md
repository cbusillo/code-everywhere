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

- `SessionHello` identifies a session with `session_id`, `session_epoch`, host label, cwd, branch, and pid.
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
- web and native clients enqueue operator actions with `POST /commands`
- local adapters claim undelivered work with `POST /commands/claim`
- `POST /commands/claim` accepts an optional `sessionId` filter and marks
  returned commands delivered before responding
- adapter code should prefer the typed `claimCockpitCommands` helper exported
  from `@code-everywhere/server/http-client`
- adapter code should publish session events with the typed `postCockpitEvents`
  helper exported from the same module

The Every Code HTTP remote-inbox adapter claims commands for its active
`sessionId`, translates `SessionCommand` values into the runtime's existing
remote-command handling, and emits projection events as session status and
pending work change.

## Local Smoke Loop

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
5. Exercise reply, status, approval, and requested-input commands from the web
   cockpit and confirm they are claimed by the active Every Code session.
