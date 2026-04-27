import { describe, expect, it } from "vitest"

import {
    type CockpitProjectionEvent,
    type EveryCodeSession,
    projectCockpitEvents,
    type RequestedInput,
    type SessionTurn,
} from "./index"

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
    title: "Implement projector",
    status: "running",
    actor: "assistant",
    startedAt: "2026-04-27T16:01:00.000Z",
    completedAt: null,
    summary: "Projecting events into cockpit state.",
    steps: [],
}

const baseInput: RequestedInput = {
    id: "input-1",
    sessionId: "session-1",
    sessionEpoch: "epoch-1",
    turnId: "turn-1",
    title: "Choose compact priority",
    requestedAt: "2026-04-27T16:05:00.000Z",
    questions: [
        {
            id: "priority",
            label: "Priority",
            prompt: "Which surface should come first?",
            required: true,
            options: [
                {
                    label: "Pending work",
                    value: "pending-work",
                },
            ],
        },
    ],
}

describe("cockpit projection", () => {
    it("projects session lifecycle and turn timeline events", () => {
        const state = projectCockpitEvents([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "turn_started",
                sessionEpoch: "epoch-1",
                turn: baseTurn,
            },
            {
                kind: "turn_step_added",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                step: {
                    id: "step-1",
                    kind: "tool",
                    title: "Read package metadata",
                    detail: "Inspected package.json.",
                    timestamp: "2026-04-27T16:02:00.000Z",
                    state: "completed",
                },
            },
            {
                kind: "turn_status_changed",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                status: "completed",
                completedAt: "2026-04-27T16:03:00.000Z",
            },
        ])

        expect(state.sessions["session-1"]?.status).toBe("idle")
        expect(state.sessions["session-1"]?.currentTurnId).toBe("turn-1")
        expect(state.sessions["session-1"]?.turnIds).toEqual(["turn-1"])
        expect(state.turns["turn-1"]?.status).toBe("completed")
        expect(state.turns["turn-1"]?.steps).toHaveLength(1)
    })

    it("projects approval and requested-input attention surfaces", () => {
        const state = projectCockpitEvents([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "turn_started",
                sessionEpoch: "epoch-1",
                turn: baseTurn,
            },
            {
                kind: "approval_requested",
                approval: {
                    id: "approval-1",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    turnId: "turn-1",
                    title: "Approve pnpm install",
                    body: "Install dependencies for validation.",
                    command: "pnpm install",
                    cwd: "~/code/code-everywhere",
                    risk: "medium",
                    requestedAt: "2026-04-27T16:04:00.000Z",
                },
            },
            {
                kind: "approval_resolved",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                approvalId: "approval-1",
                decision: "approve",
                resolvedAt: "2026-04-27T16:04:30.000Z",
            },
            {
                kind: "user_input_requested",
                input: baseInput,
            },
        ])

        expect(state.pendingApprovals["approval-1"]).toBeUndefined()
        expect(state.requestedInputs["input-1"]).toEqual(baseInput)
        expect(state.sessions["session-1"]?.attention).toBe("input")
        expect(state.sessions["session-1"]?.pendingApprovalIds).toEqual([])
        expect(state.sessions["session-1"]?.pendingInputIds).toEqual(["input-1"])
        expect(state.notifications.map((notification) => notification.kind)).toEqual(["approval", "input"])
    })

    it("records stale epoch events without mutating pending work", () => {
        const state = projectCockpitEvents([
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
            {
                kind: "approval_requested",
                approval: {
                    id: "approval-stale",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    turnId: "turn-1",
                    title: "Stale approval",
                    body: "This should be rejected.",
                    command: "pnpm install",
                    cwd: "~/code/code-everywhere",
                    risk: "medium",
                    requestedAt: "2026-04-27T16:11:00.000Z",
                },
            },
        ])

        expect(state.pendingApprovals).toEqual({})
        expect(state.sessions["session-1"]?.sessionEpoch).toBe("epoch-2")
        expect(state.sessions["session-1"]?.attention).toBe("none")
        expect(state.staleEvents).toEqual([
            {
                eventKind: "approval_requested",
                sessionId: "session-1",
                eventEpoch: "epoch-1",
                currentEpoch: "epoch-2",
                receivedAt: "2026-04-27T16:11:00.000Z",
            },
        ])
        expect(state.notifications[state.notifications.length - 1]?.kind).toBe("stale-event")
    })

    it("clears pending epoch-scoped work when a session reconnects", () => {
        const events: CockpitProjectionEvent[] = [
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "user_input_requested",
                input: baseInput,
            },
            {
                kind: "session_hello",
                session: {
                    ...baseSession,
                    sessionEpoch: "epoch-2",
                    updatedAt: "2026-04-27T16:12:00.000Z",
                },
            },
        ]

        const state = projectCockpitEvents(events)

        expect(state.requestedInputs).toEqual({})
        expect(state.sessions["session-1"]?.sessionEpoch).toBe("epoch-2")
        expect(state.sessions["session-1"]?.pendingInputIds).toEqual([])
        expect(state.sessions["session-1"]?.attention).toBe("none")
    })
})
