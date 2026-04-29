# Architecture

## Shape

```text
Every Code session
    -> Every Code bridge protocol
    -> Code Everywhere server/projection layer
    -> web and native clients
    -> notifications through APNs or Web Push where appropriate
```

Every Code owns runtime execution. Code Everywhere owns presentation, persistence/projection for client state, device registration, and operator actions.

## Components

### Every Code Runtime

The Every Code fork is the agent runtime. It emits structured session events and accepts structured remote commands.

Local reference: `../code`

Remote reference: `https://github.com/cbusillo/code`

### Existing Discord Bridge Reference

The current Discord DUI lives in `../discord-blue/discord_blue/doodads/every_code`. It is the best reference for the current protocol shape and product behavior:

- session hello and reconnect behavior
- status updates
- replies into active sessions
- approval requests and decisions
- requested user input
- pause, continue, and end commands
- stale epoch rejection
- pending command acknowledgement

### Code Everywhere Server

The server should normalize Every Code session events into client-facing state:

- active sessions
- session metadata
- turn timeline
- pending approvals
- pending requested input
- status and error state
- notification-worthy events
- trusted devices and hosts

The server may begin embedded in a local desktop process or as a small
standalone service. Keep the client protocol stable enough that the deployment
choice can evolve.

The first server checkpoint lives in `packages/server`. It is intentionally
in-memory: callers ingest typed cockpit projection events and read projected
snapshots.

A lightweight local HTTP transport exposes snapshot, event-ingest, reset, and
command-inbox endpoints for development and adapter spikes. Web and native
clients enqueue operator actions with `POST /commands`; a local Every Code
adapter can claim undelivered commands with `POST /commands/claim`, optionally
filtered by `sessionId`, which marks those commands delivered before returning
them. The adapter reports runtime acceptance or rejection with `command_outcome`
projection events. The local broker persists its event log and command records
to a repo-ignored JSON file by default. It does not yet provide streaming,
authentication, direct runtime command execution, or notification delivery.

Local trust should use a separate broker-owned registry beside broker state,
such as `.code-everywhere/trust.json`, for non-secret trusted host, device, and
operator records. Broker auth tokens remain route authorization only. Apple
clients can keep device-held secrets in Keychain later, while the local broker
continues to own the trusted-record list for the local deployment mode. Broker
snapshots derive session trust from projected `hostId` and the host registry;
sessions without a host id remain explicit unverified legacy sessions. The local
broker exposes a narrow trust API for inspecting the registry and upserting or
revoking host records; it does not store route auth tokens in trust records.

### Clients

Expected client surfaces:

- web cockpit for development and desktop use
- iOS/iPadOS app or native wrapper for mobile operation
- macOS app or menu-bar companion when useful

The first client should prove the structured cockpit, not every platform concern at once.

## Protocol Principles

- Use explicit event types and command types.
- Preserve Every Code session identity and epoch semantics.
- Commands should be idempotent or reject stale state clearly.
- Clients should be able to resync from server state after reconnect.
- Notifications should link to a specific session and pending item when possible.
