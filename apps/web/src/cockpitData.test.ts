import { describe, expect, it } from "vitest"

import {
    cockpitFixture,
    cockpitFixtureEvents,
    cockpitFixtureSnapshot,
    createCockpitFixtureFromSnapshot,
    getAttentionSessions,
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
        })
        const approvalSession = fixture.sessions.find((session) => session.sessionId === "ce-alpha")

        expect(fixture.generatedAt).toBe("2026-04-27T17:00:00.000Z")
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
})
