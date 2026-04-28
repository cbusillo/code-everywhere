import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import type { EveryCodeSession, PendingApproval, SessionCommand } from "@code-everywhere/contracts"

import { createPersistentCockpitStores } from "./persistence"

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

const baseCommand: SessionCommand = {
    kind: "status_request",
    sessionId: "session-1",
    sessionEpoch: "epoch-1",
}

describe("cockpit persistence wrapper", () => {
    it("rolls back event mutations when persistence writes fail", () => {
        const stores = createPersistentCockpitStores(unusedPath(), {
            writeSnapshot: () => {
                throw new Error("disk full")
            },
        })

        expect(() =>
            stores.store.ingest({
                kind: "session_hello",
                session: baseSession,
            }),
        ).toThrow("disk full")

        expect(stores.store.getEvents()).toEqual([])
        expect(stores.store.getSnapshot()).toMatchObject({ eventCount: 0, sessions: [] })
    })

    it("rolls back later event mutations to the last persisted snapshot", () => {
        let shouldFail = false
        const stores = createPersistentCockpitStores(unusedPath(), {
            writeSnapshot: () => {
                if (shouldFail) {
                    throw new Error("disk full")
                }
            },
        })

        stores.store.ingest({
            kind: "session_hello",
            session: baseSession,
        })
        shouldFail = true

        expect(() => stores.store.ingest({ kind: "approval_requested", approval: baseApproval })).toThrow("disk full")

        expect(stores.store.getEvents()).toHaveLength(1)
        expect(stores.store.getSnapshot().state.pendingApprovals).toEqual({})
    })

    it("rolls back command mutations when persistence writes fail", () => {
        const stores = createPersistentCockpitStores(unusedPath(), {
            writeSnapshot: () => {
                throw new Error("disk full")
            },
        })

        expect(() => stores.commandStore.enqueue(baseCommand)).toThrow("disk full")

        expect(stores.commandStore.getCommands()).toEqual([])
        expect(stores.commandStore.getSnapshot()).toEqual({ commandCount: 0, commands: [] })
    })
})

const unusedPath = (): string => `/tmp/code-everywhere-unused-${String(process.pid)}-${randomUUID()}.json`
