import { describe, expect, it } from "vitest"

import { cockpitFixture, getAttentionSessions, statusLabels } from "./cockpitData"

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
