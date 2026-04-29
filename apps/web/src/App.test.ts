import type { PendingApproval, RequestedInput } from "@code-everywhere/contracts"
import { describe, expect, it } from "vitest"

import { getActivePendingWork, getCockpitStateSurface, parseCockpitFragmentRoute } from "./App"

describe("cockpit state surface", () => {
    it("keeps retained stale-event evidence visible before empty live-session state", () => {
        const surface = getCockpitStateSurface(
            {
                sessions: [],
                staleEvents: [
                    {
                        eventKind: "turn_step_added",
                        sessionId: "session-1",
                        eventEpoch: "epoch-1",
                        currentEpoch: "epoch-2",
                        receivedAt: "2026-04-27T16:10:00.000Z",
                    },
                ],
            },
            {
                mode: "live",
                url: "http://127.0.0.1:4789",
                updatedAt: "2026-04-27T16:10:00.000Z",
                error: null,
            },
        )

        expect(surface).toMatchObject({
            tone: "warning",
            title: "Stale event evidence retained",
        })
    })
})

describe("cockpit fragment routing", () => {
    it("parses Apple deep-link fragments for sessions and pending work", () => {
        expect(parseCockpitFragmentRoute("#/session/session-123?pending=approval-9")).toEqual({
            sessionId: "session-123",
            pendingItemId: "approval-9",
        })
        expect(parseCockpitFragmentRoute("#/pending/input-7?session=session-123")).toEqual({
            sessionId: "session-123",
            pendingItemId: "input-7",
        })
    })

    it("ignores unsupported or malformed fragments", () => {
        expect(parseCockpitFragmentRoute("")).toBeNull()
        expect(parseCockpitFragmentRoute("#/settings")).toBeNull()
    })
})

describe("active pending work selection", () => {
    const approval: PendingApproval = {
        id: "approval-1",
        sessionId: "session-1",
        sessionEpoch: "epoch-1",
        turnId: "turn-1",
        title: "Approval required",
        body: "Run command?",
        command: "pnpm validate",
        cwd: "/tmp/project",
        risk: "medium",
        requestedAt: "2026-04-29T20:00:00.000Z",
    }
    const requestedInput: RequestedInput = {
        id: "input-1",
        sessionId: "session-1",
        sessionEpoch: "epoch-1",
        turnId: "turn-1",
        title: "Input requested",
        requestedAt: "2026-04-29T20:01:00.000Z",
        questions: [
            {
                id: "mode",
                label: "Mode",
                prompt: "Choose a mode.",
                required: true,
                options: [{ label: "Continue", value: "continue" }],
            },
        ],
    }

    it("falls back to current requested input when a selected approval has resolved", () => {
        expect(getActivePendingWork("approval-1", [], [requestedInput])).toEqual({
            approval: undefined,
            requestedInput,
        })
    })

    it("preserves an explicitly selected pending item when it is still actionable", () => {
        expect(getActivePendingWork("approval-1", [approval], [requestedInput])).toEqual({
            approval,
            requestedInput: undefined,
        })
        expect(getActivePendingWork("input-1", [approval], [requestedInput])).toEqual({
            approval: undefined,
            requestedInput,
        })
    })
})
