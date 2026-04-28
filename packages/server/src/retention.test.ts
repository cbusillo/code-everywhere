import { describe, expect, it } from "vitest"

import type { CockpitProjectionEvent, EveryCodeSession, PendingApproval, SessionTurn, TurnStep } from "@code-everywhere/contracts"
import { projectCockpitEvents } from "@code-everywhere/contracts"

import { compactCockpitEvents, type CockpitEventRetentionPolicy } from "./retention"

const retentionPolicy: CockpitEventRetentionPolicy = {
    maxEndedSessions: 1,
    maxTurnsPerSession: 1,
    maxStepsPerTurn: 2,
    maxCommandOutcomes: 1,
    maxStaleEvents: 1,
}

describe("cockpit event retention", () => {
    it("compacts ended sessions while preserving active pending work", () => {
        const activeApproval = approval("active-approval", "active-session", "active-epoch", "active-turn")
        const compacted = compactCockpitEvents(
            [
                ...endedSessionEvents("ended-old", "2026-04-27T10:00:00.000Z"),
                ...endedSessionEvents("ended-new", "2026-04-27T11:00:00.000Z"),
                sessionHello(session("active-session", "active-epoch", "idle", "2026-04-27T12:00:00.000Z", "active-turn")),
                turnStarted(
                    "active-epoch",
                    turn("active-session", "active-turn", "2026-04-27T12:01:00.000Z", [
                        step("active-step-1", "2026-04-27T12:01:10.000Z"),
                        step("active-step-2", "2026-04-27T12:01:20.000Z"),
                        step("active-step-3", "2026-04-27T12:01:30.000Z"),
                    ]),
                ),
                { kind: "approval_requested", approval: activeApproval },
            ],
            retentionPolicy,
        )
        const state = projectCockpitEvents(compacted)

        expect(Object.keys(state.sessions).sort()).toEqual(["active-session", "ended-new"])
        expect(state.sessions["active-session"]?.pendingApprovalIds).toEqual(["active-approval"])
        expect(state.pendingApprovals["active-approval"]).toEqual(activeApproval)
        expect(state.turns["active-turn"]?.steps.map((candidate) => candidate.id)).toEqual([
            "active-step-3",
            "approval:active-approval",
        ])
    })

    it("retains bounded stale-event evidence after epoch changes", () => {
        const compacted = compactCockpitEvents(
            [
                sessionHello(session("session-1", "epoch-1", "idle", "2026-04-27T10:00:00.000Z", null)),
                sessionHello(session("session-1", "epoch-2", "idle", "2026-04-27T10:10:00.000Z", null)),
                { kind: "approval_requested", approval: approval("approval-1", "session-1", "epoch-1", "turn-1") },
                { kind: "approval_requested", approval: approval("approval-2", "session-1", "epoch-1", "turn-1") },
            ],
            retentionPolicy,
        )
        const state = projectCockpitEvents(compacted)

        expect(state.staleEvents).toEqual([
            {
                eventKind: "approval_requested",
                sessionId: "session-1",
                eventEpoch: "epoch-1",
                currentEpoch: "epoch-2",
                receivedAt: "2026-04-27T12:04:00.000Z",
            },
        ])
    })

    it("drops stale-event evidence when the stale retention limit is zero", () => {
        const compacted = compactCockpitEvents(
            [
                sessionHello(session("session-1", "epoch-1", "idle", "2026-04-27T10:00:00.000Z", null)),
                sessionHello(session("session-1", "epoch-2", "idle", "2026-04-27T10:10:00.000Z", null)),
                { kind: "approval_requested", approval: approval("approval-1", "session-1", "epoch-1", "turn-1") },
            ],
            {
                ...retentionPolicy,
                maxStaleEvents: 0,
            },
        )

        expect(projectCockpitEvents(compacted).staleEvents).toEqual([])
    })

    it("keeps only the newest command outcomes for retained sessions", () => {
        const compacted = compactCockpitEvents(
            [
                sessionHello(session("session-1", "epoch-1", "idle", "2026-04-27T10:00:00.000Z", null)),
                commandOutcome("command-1", "2026-04-27T10:01:00.000Z"),
                commandOutcome("command-2", "2026-04-27T10:02:00.000Z"),
            ],
            retentionPolicy,
        )
        const state = projectCockpitEvents(compacted)

        expect(Object.keys(state.commandOutcomes)).toEqual(["command-2"])
    })
})

const session = (
    sessionId: string,
    sessionEpoch: string,
    status: EveryCodeSession["status"],
    updatedAt: string,
    currentTurnId: string | null,
): EveryCodeSession => ({
    sessionId,
    sessionEpoch,
    hostLabel: "workhorse-mac",
    cwd: "~/code/code-everywhere",
    branch: "main",
    pid: 1234,
    model: "code-gpt-5.4",
    status,
    summary: status === "ended" ? "Session ended." : "Waiting for work.",
    startedAt: updatedAt,
    updatedAt,
    currentTurnId,
})

const turn = (sessionId: string, turnId: string, startedAt: string, steps: TurnStep[] = []): SessionTurn => ({
    id: turnId,
    sessionId,
    title: `Turn ${turnId}`,
    status: "completed",
    actor: "assistant",
    startedAt,
    completedAt: startedAt,
    summary: "Turn complete.",
    steps,
})

const step = (id: string, timestamp: string): TurnStep => ({
    id,
    kind: "tool",
    title: "Shell command",
    detail: "pnpm test",
    timestamp,
    state: "completed",
})

const approval = (id: string, sessionId: string, sessionEpoch: string, turnId: string): PendingApproval => ({
    id,
    sessionId,
    sessionEpoch,
    turnId,
    title: "Approve command",
    body: "Run a command.",
    command: "pnpm test",
    cwd: "~/code/code-everywhere",
    risk: "low",
    requestedAt: "2026-04-27T12:04:00.000Z",
})

const sessionHello = (nextSession: EveryCodeSession): CockpitProjectionEvent => ({
    kind: "session_hello",
    session: nextSession,
})

const turnStarted = (sessionEpoch: string, nextTurn: SessionTurn): CockpitProjectionEvent => ({
    kind: "turn_started",
    sessionEpoch,
    turn: nextTurn,
})

const endedSessionEvents = (sessionId: string, timestamp: string): CockpitProjectionEvent[] => [
    sessionHello(session(sessionId, "epoch-1", "idle", timestamp, `${sessionId}-turn`)),
    turnStarted(
        "epoch-1",
        turn(sessionId, `${sessionId}-turn`, timestamp, [
            step(`${sessionId}-step-1`, timestamp),
            step(`${sessionId}-step-2`, timestamp),
            step(`${sessionId}-step-3`, timestamp),
        ]),
    ),
    {
        kind: "session_status_changed",
        sessionId,
        sessionEpoch: "epoch-1",
        status: "ended",
        summary: "Session ended.",
        updatedAt: timestamp,
    },
]

const commandOutcome = (commandId: string, handledAt: string): CockpitProjectionEvent => ({
    kind: "command_outcome",
    outcome: {
        commandId,
        sessionId: "session-1",
        sessionEpoch: "epoch-1",
        commandKind: "status_request",
        status: "accepted",
        reason: null,
        handledAt,
    },
})
