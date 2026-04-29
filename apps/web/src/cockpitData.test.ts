import { describe, expect, it } from "vitest"

import {
    cockpitFixture,
    cockpitFixtureEvents,
    cockpitFixtureSnapshot,
    createCockpitFixtureFromSnapshot,
    getAttentionSessions,
    getOperatorAttentionSummary,
    statusLabels,
} from "./cockpitData"

describe("cockpit fake data", () => {
    it("covers every required first-spike session state", () => {
        const statuses = new Set(cockpitFixture.sessions.map((session) => session.status))

        expect(statuses).toEqual(
            new Set(["running", "idle", "blocked", "waiting-for-input", "waiting-for-approval", "ended", "error"]),
        )
    })

    it("keeps approvals and requested input attached to real sessions", () => {
        const sessionIds = new Set(cockpitFixture.sessions.map((session) => session.sessionId))

        expect(cockpitFixture.approvals.every((approval) => sessionIds.has(approval.sessionId))).toBe(true)
        expect(cockpitFixture.requestedInputs.every((input) => sessionIds.has(input.sessionId))).toBe(true)
    })

    it("derives UI sessions from projected contract state", () => {
        const approvalSession = cockpitFixture.sessions.find((session) => session.sessionId === "ce-alpha")
        const endedSession = cockpitFixture.sessions.find((session) => session.sessionId === "ce-zeta")

        expect(cockpitFixtureSnapshot.eventCount).toBe(cockpitFixtureEvents.length)
        expect(cockpitFixtureSnapshot.attentionSessionIds).toEqual(["ce-alpha", "ce-beta", "ce-delta", "ce-eta"])
        expect(approvalSession?.pendingApprovalIds).toEqual(["approval-install-deps"])
        expect(approvalSession?.pendingInputIds).toEqual([])
        expect(approvalSession?.currentTurnId).toBe("turn-alpha-3")
        expect(endedSession?.currentTurnId).toBeNull()
        expect(approvalSession?.turnIds).toEqual(["turn-alpha-1", "turn-alpha-2", "turn-alpha-3"])
        expect(approvalSession?.turns.map((turn) => turn.id)).toEqual(approvalSession?.turnIds)
    })

    it("converts transport snapshots without fake-only metadata", () => {
        const fixture = createCockpitFixtureFromSnapshot(cockpitFixtureSnapshot, {
            generatedAt: "2026-04-27T17:00:00.000Z",
            commands: [
                {
                    id: "command-1",
                    receivedAt: "2026-04-27T17:00:00.000Z",
                    deliveredAt: null,
                    command: {
                        kind: "status_request",
                        sessionId: "ce-alpha",
                        sessionEpoch: "epoch-34",
                    },
                },
            ],
        })
        const approvalSession = fixture.sessions.find((session) => session.sessionId === "ce-alpha")

        expect(fixture.generatedAt).toBe("2026-04-27T17:00:00.000Z")
        expect(fixture.commands.map((command) => command.id)).toEqual(["command-1"])
        expect(approvalSession?.unreadCount).toBe(0)
        expect(approvalSession?.currentTurnId).toBe("turn-alpha-3")
        expect(approvalSession?.turns.map((turn) => turn.id)).toEqual(["turn-alpha-1", "turn-alpha-2", "turn-alpha-3"])
    })

    it("puts attention-needed sessions first in the operator queue", () => {
        const attentionSessions = getAttentionSessions(cockpitFixture.sessions)

        expect(attentionSessions.map((session) => statusLabels[session.status])).toEqual([
            "Needs approval",
            "Needs input",
            "Blocked",
            "Error",
        ])
    })

    it("derives operator attention items from pending work, sessions, and command outcomes", () => {
        const summary = getOperatorAttentionSummary({
            ...cockpitFixture,
            commandOutcomes: [
                {
                    commandId: "command-stale",
                    sessionId: "ce-alpha",
                    sessionEpoch: "epoch-34",
                    commandKind: "approval_decision",
                    status: "rejected",
                    reason: "stale session scope: command targeted an old epoch",
                    handledAt: "2026-04-27T16:06:00.000Z",
                },
                {
                    commandId: "command-rejected",
                    sessionId: "ce-gamma",
                    sessionEpoch: "epoch-7",
                    commandKind: "pause_current_turn",
                    status: "rejected",
                    reason: "no active turn is running",
                    handledAt: "2026-04-27T16:07:00.000Z",
                },
            ],
        })

        expect(summary.nextItem).toMatchObject({
            kind: "approval",
            pendingItemId: "approval-install-deps",
            sessionId: "ce-alpha",
        })
        expect(summary.counts).toMatchObject({
            approval: 1,
            input: 1,
            error: 1,
            blocked: 1,
            "stale-command": 1,
            "rejected-command": 1,
        })
        expect(summary.items.map((item) => item.kind)).toEqual([
            "approval",
            "input",
            "error",
            "blocked",
            "stale-command",
            "rejected-command",
        ])
    })

    it("excludes requested inputs without actionable questions from operator attention", () => {
        const emptyInput = {
            id: "input-empty",
            sessionId: "ce-alpha",
            sessionEpoch: "epoch-34",
            turnId: "turn-alpha-3",
            title: "No questions available",
            requestedAt: "2026-04-27T16:08:00.000Z",
            questions: [],
        }
        const summary = getOperatorAttentionSummary({
            ...cockpitFixture,
            requestedInputs: [...cockpitFixture.requestedInputs, emptyInput],
        })

        expect(summary.counts.input).toBe(1)
        expect(summary.items.some((item) => item.id === "input:input-empty")).toBe(false)
    })
})
