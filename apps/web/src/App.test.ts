import { describe, expect, it } from "vitest"

import { getCockpitStateSurface } from "./App"

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
