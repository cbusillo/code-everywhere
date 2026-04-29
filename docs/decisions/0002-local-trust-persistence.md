# 0002: Local Trust Persistence

## Status

Accepted

## Context

Code Everywhere now has a local broker authorization boundary, but route
authorization is not product identity. The product still needs a durable local
model for trusted hosts, operator devices, and automatic session appearance
before Apple clients, LAN mode, or a hosted relay.

The first trust persistence choice should keep local development simple without
making token strings carry host, device, and operator meaning.

## Decision

The first production checkpoint should use a broker-mediated, file-backed local
trust registry.

- The local broker is the authority for local trusted host and device records.
- The registry should live beside broker state under `.code-everywhere/`, using
  a separate file such as `.code-everywhere/trust.json` instead of embedding
  trust records in the event-log persistence file.
- The registry should store non-secret identity and trust metadata: schema
  version, local operator id, trusted host ids, trusted device ids, labels,
  creation time, last-seen time, and revocation state.
- Session trust should be derived from trusted host identity plus current
  `sessionId` and `sessionEpoch`; the registry should not create per-session
  pairing records as the default path.
- Broker auth tokens remain HTTP route authorization. They should not become the
  durable host id, operator id, device id, or trust record.
- Native clients should store device secrets or private credentials in platform
  storage, such as Keychain on Apple platforms. Those secrets may prove device
  identity to the broker later, but the broker-owned registry remains the local
  list of trusted records.
- Loopback-only development may continue without a trust registry until a host,
  device, or non-loopback mode needs durable trust. When the registry is present,
  sessions from trusted hosts should appear automatically.

## Consequences

- Code Everywhere can add stable `hostId`, `operatorId`, and `deviceId` fields
  without binding them to a shared HTTP token.
- The local broker has a clear migration path from JSON development state to
  SQLite or a service-backed store later: trust records are already separated
  from event replay state.
- Apple clients can use Keychain for device-held secrets without forcing the
  Node broker to own platform credential storage in the first checkpoint.
- Revocation becomes a broker state change instead of a session-by-session
  pairing cleanup.
- The next implementation slice should add the smallest typed trust store and
  config surface before adding host/device protocol fields.
