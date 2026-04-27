import { describe, expect, it } from "vitest"

import type { CockpitProjectionEvent, EveryCodeSession, PendingApproval, SessionTurn } from "@code-everywhere/contracts"

import { createCockpitEventStore } from "./index"

const baseSession: EveryCodeSession = {
    sessionId: "session-1",
    sessionEpoch: "epoch-1",
    hostLabel: "workhorse-mac",
    cwd: "~/code/code-everywhere",
    branch: "main",
    pid: 1234,
    model: "code-gpt-5.4",
    status: "idle",
    summary: "Waiting for work",
    startedAt: "2026-04-27T16:00:00.000Z",
    updatedAt: "2026-04-27T16:00:00.000Z",
    currentTurnId: null,
}

const baseTurn: SessionTurn = {
    id: "turn-1",
    sessionId: "session-1",
    title: "Implement ingestion",
    status: "running",
    actor: "assistant",
    startedAt: "2026-04-27T16:01:00.000Z",
    completedAt: null,
    summary: "Ingesting events into projected state.",
    steps: [],
}

const baseApproval: PendingApproval = {
    id: "approval-1",
    sessionId: "session-1",
    sessionEpoch: "epoch-1",
    turnId: "turn-1",
    title: "Approve dependency install",
    body: "Install dependencies for validation.",
    command: "pnpm install",
    cwd: "~/code/code-everywhere",
    risk: "medium",
    requestedAt: "2026-04-27T16:04:00.000Z",
}

describe("cockpit event store", () => {
    it("starts with an empty projected snapshot", () => {
        const store = createCockpitEventStore()
        const snapshot = store.getSnapshot()

        expect(snapshot.eventCount).toBe(0)
        expect(snapshot.sessions).toEqual([])
        expect(snapshot.attentionSessionIds).toEqual([])
        expect(snapshot.state.staleEvents).toEqual([])
    })

    it("ingests events into projected session state", () => {
        const store = createCockpitEventStore([
            {
                kind: "session_hello",
                session: baseSession,
            },
        ])

        const snapshot = store.ingestMany([
            {
                kind: "turn_started",
                sessionEpoch: "epoch-1",
                turn: baseTurn,
            },
            {
                kind: "approval_requested",
                approval: baseApproval,
            },
        ])

        expect(snapshot.eventCount).toBe(3)
        expect(snapshot.sessions.map((session) => session.sessionId)).toEqual(["session-1"])
        expect(snapshot.sessions[0]?.status).toBe("waiting-for-approval")
        expect(snapshot.attentionSessionIds).toEqual(["session-1"])
        expect(snapshot.state.pendingApprovals["approval-1"]).toEqual(baseApproval)
    })

    it("keeps stale epoch evidence in the snapshot", () => {
        const store = createCockpitEventStore([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "session_hello",
                session: {
                    ...baseSession,
                    sessionEpoch: "epoch-2",
                    updatedAt: "2026-04-27T16:10:00.000Z",
                },
            },
        ])

        const snapshot = store.ingest({
            kind: "approval_requested",
            approval: baseApproval,
        })

        expect(snapshot.state.pendingApprovals).toEqual({})
        expect(snapshot.state.staleEvents).toEqual([
            {
                eventKind: "approval_requested",
                sessionId: "session-1",
                eventEpoch: "epoch-1",
                currentEpoch: "epoch-2",
                receivedAt: "2026-04-27T16:04:00.000Z",
            },
        ])
        expect(snapshot.state.notifications[snapshot.state.notifications.length - 1]?.kind).toBe("stale-event")
    })

    it("resets event history and projection state", () => {
        const store = createCockpitEventStore([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "approval_requested",
                approval: baseApproval,
            },
        ])

        const snapshot = store.reset([
            {
                kind: "session_hello",
                session: {
                    ...baseSession,
                    sessionId: "session-2",
                    sessionEpoch: "epoch-1",
                },
            },
        ])

        expect(snapshot.eventCount).toBe(1)
        expect(snapshot.sessions.map((session) => session.sessionId)).toEqual(["session-2"])
        expect(snapshot.state.pendingApprovals).toEqual({})
        expect(store.getEvents()).toHaveLength(1)
    })

    it("returns defensive copies of snapshots and ingested events", () => {
        const events: CockpitProjectionEvent[] = [
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "approval_requested",
                approval: baseApproval,
            },
        ]
        const store = createCockpitEventStore(events)
        const snapshot = store.getSnapshot()

        snapshot.state.sessions["session-1"]?.pendingApprovalIds.push("mutated")

        const eventLog = store.getEvents()
        const helloEvent = eventLog[0]
        if (helloEvent?.kind === "session_hello") {
            helloEvent.session.summary = "mutated summary"
        }

        expect(store.getSnapshot().state.sessions["session-1"]?.pendingApprovalIds).toEqual(["approval-1"])
        const freshEventLog = store.getEvents()
        expect(freshEventLog[0]?.kind).toBe("session_hello")
        expect(freshEventLog[0]?.kind === "session_hello" ? freshEventLog[0].session.summary : null).toBe("Waiting for work")
    })
})
