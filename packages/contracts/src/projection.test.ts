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

    it("keeps replayed turn steps idempotent", () => {
        const step = {
            id: "step-1",
            kind: "message" as const,
            title: "Assistant reply",
            detail: "The same snapshot was replayed after reconnect.",
            timestamp: "2026-04-27T16:02:00.000Z",
            state: "completed" as const,
        }

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
                step,
            },
            {
                kind: "turn_step_added",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                step,
            },
        ])

        expect(state.turns["turn-1"]?.steps).toEqual([step])
        expect(state.sessions["session-1"]?.updatedAt).toBe("2026-04-27T16:02:00.000Z")
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

    it("preserves waiting status while pending items remain", () => {
        const state = projectCockpitEvents([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "approval_requested",
                approval: {
                    id: "approval-1",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    turnId: "turn-1",
                    title: "Approve install",
                    body: "Install dependencies.",
                    command: "pnpm install",
                    cwd: "~/code/code-everywhere",
                    risk: "medium",
                    requestedAt: "2026-04-27T16:04:00.000Z",
                },
            },
            {
                kind: "approval_requested",
                approval: {
                    id: "approval-2",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    turnId: "turn-1",
                    title: "Approve test",
                    body: "Run validation.",
                    command: "pnpm validate",
                    cwd: "~/code/code-everywhere",
                    risk: "medium",
                    requestedAt: "2026-04-27T16:04:15.000Z",
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
        ])

        expect(state.sessions["session-1"]?.status).toBe("waiting-for-approval")
        expect(state.sessions["session-1"]?.attention).toBe("approval")
        expect(state.sessions["session-1"]?.pendingApprovalIds).toEqual(["approval-2"])
    })

    it("returns to the next pending surface after resolving mixed pending work", () => {
        const state = projectCockpitEvents([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "approval_requested",
                approval: {
                    id: "approval-1",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    turnId: "turn-1",
                    title: "Approve install",
                    body: "Install dependencies.",
                    command: "pnpm install",
                    cwd: "~/code/code-everywhere",
                    risk: "medium",
                    requestedAt: "2026-04-27T16:04:00.000Z",
                },
            },
            {
                kind: "user_input_requested",
                input: baseInput,
            },
            {
                kind: "user_input_resolved",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                inputId: "input-1",
                resolvedAt: "2026-04-27T16:05:30.000Z",
            },
        ])

        expect(state.sessions["session-1"]?.status).toBe("waiting-for-approval")
        expect(state.sessions["session-1"]?.attention).toBe("approval")
        expect(state.sessions["session-1"]?.pendingApprovalIds).toEqual(["approval-1"])
        expect(state.sessions["session-1"]?.pendingInputIds).toEqual([])
    })

    it("keeps pending work authoritative when status snapshots arrive", () => {
        const state = projectCockpitEvents([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "approval_requested",
                approval: {
                    id: "approval-1",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    turnId: "turn-1",
                    title: "Approve install",
                    body: "Install dependencies.",
                    command: "pnpm install",
                    cwd: "~/code/code-everywhere",
                    risk: "medium",
                    requestedAt: "2026-04-27T16:04:00.000Z",
                },
            },
            {
                kind: "session_status_changed",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                status: "running",
                summary: "Snapshot says running, but approval remains pending.",
                updatedAt: "2026-04-27T16:04:30.000Z",
            },
        ])

        expect(state.sessions["session-1"]?.status).toBe("waiting-for-approval")
        expect(state.sessions["session-1"]?.attention).toBe("approval")
        expect(state.sessions["session-1"]?.pendingApprovalIds).toEqual(["approval-1"])
    })

    it("preserves authoritative waiting snapshots before pending work arrives", () => {
        const state = projectCockpitEvents([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "session_status_changed",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                status: "waiting-for-input",
                summary: "Waiting for a prompt event that has not arrived yet.",
                updatedAt: "2026-04-27T16:04:30.000Z",
            },
        ])

        expect(state.sessions["session-1"]?.status).toBe("waiting-for-input")
        expect(state.sessions["session-1"]?.attention).toBe("input")
        expect(state.sessions["session-1"]?.pendingInputIds).toEqual([])
    })

    it("does not mark a session idle when a turn completes with pending work", () => {
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
                    title: "Approve install",
                    body: "Install dependencies.",
                    command: "pnpm install",
                    cwd: "~/code/code-everywhere",
                    risk: "medium",
                    requestedAt: "2026-04-27T16:04:00.000Z",
                },
            },
            {
                kind: "turn_status_changed",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                status: "completed",
                completedAt: "2026-04-27T16:06:00.000Z",
            },
        ])

        expect(state.sessions["session-1"]?.status).toBe("waiting-for-approval")
        expect(state.sessions["session-1"]?.attention).toBe("approval")
        expect(state.sessions["session-1"]?.pendingApprovalIds).toEqual(["approval-1"])
        expect(state.turns["turn-1"]?.status).toBe("completed")
    })

    it("emits notifications for turn-driven blocked and error states", () => {
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
                kind: "turn_status_changed",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                status: "blocked",
                summary: "Waiting for sandbox approval",
            },
        ])

        expect(state.sessions["session-1"]?.status).toBe("blocked")
        expect(state.sessions["session-1"]?.summary).toBe("Waiting for sandbox approval")
        expect(state.notifications[state.notifications.length - 1]).toMatchObject({
            kind: "blocked",
            title: "Waiting for sandbox approval",
        })
    })

    it("projects accepted and rejected command outcomes", () => {
        const state = projectCockpitEvents([
            {
                kind: "session_hello",
                session: baseSession,
            },
            {
                kind: "command_outcome",
                outcome: {
                    commandId: "command-1",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    commandKind: "status_request",
                    status: "accepted",
                    reason: null,
                    handledAt: "2026-04-27T16:07:00.000Z",
                },
            },
            {
                kind: "command_outcome",
                outcome: {
                    commandId: "command-2",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    commandKind: "reply",
                    status: "rejected",
                    reason: "No active turn is waiting for a reply.",
                    handledAt: "2026-04-27T16:08:00.000Z",
                },
            },
        ])

        expect(state.commandOutcomes["command-1"]?.status).toBe("accepted")
        expect(state.commandOutcomes["command-2"]?.reason).toBe("No active turn is waiting for a reply.")
        expect(state.sessions["session-1"]?.updatedAt).toBe("2026-04-27T16:08:00.000Z")
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
            {
                kind: "command_outcome",
                outcome: {
                    commandId: "command-stale",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    commandKind: "status_request",
                    status: "accepted",
                    reason: null,
                    handledAt: "2026-04-27T16:11:30.000Z",
                },
            },
        ])

        expect(state.pendingApprovals).toEqual({})
        expect(state.commandOutcomes).toEqual({})
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
            {
                eventKind: "command_outcome",
                sessionId: "session-1",
                eventEpoch: "epoch-1",
                currentEpoch: "epoch-2",
                receivedAt: "2026-04-27T16:11:30.000Z",
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
                kind: "turn_started",
                sessionEpoch: "epoch-1",
                turn: baseTurn,
            },
            {
                kind: "user_input_requested",
                input: baseInput,
            },
            {
                kind: "command_outcome",
                outcome: {
                    commandId: "command-1",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    commandKind: "status_request",
                    status: "accepted",
                    reason: null,
                    handledAt: "2026-04-27T16:11:00.000Z",
                },
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
        expect(state.commandOutcomes).toEqual({})
        expect(state.turns).toEqual({})
        expect(state.sessions["session-1"]?.sessionEpoch).toBe("epoch-2")
        expect(state.sessions["session-1"]?.turnIds).toEqual([])
        expect(state.sessions["session-1"]?.pendingInputIds).toEqual([])
        expect(state.sessions["session-1"]?.attention).toBe("none")
    })
})
