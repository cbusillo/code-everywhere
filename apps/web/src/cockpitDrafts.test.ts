import { describe, expect, it } from "vitest"

import type { RequestedInput } from "@code-everywhere/contracts"

import { getDraftValue, getRequestedInputDefault, setDraftValue } from "./cockpitDrafts"

describe("cockpit draft state", () => {
    it("keeps draft values keyed by active work", () => {
        const drafts = setDraftValue(setDraftValue({}, "session-a", "first reply"), "session-b", "second reply")

        expect(getDraftValue(drafts, "session-a")).toBe("first reply")
        expect(getDraftValue(drafts, "session-b")).toBe("second reply")
        expect(getDraftValue(drafts, "session-c", "fallback")).toBe("fallback")
    })

    it("uses the first requested-input option as the empty draft default", () => {
        const input: RequestedInput = {
            id: "input-1",
            sessionId: "session-1",
            sessionEpoch: "epoch-1",
            turnId: "turn-1",
            requestedAt: "2026-04-27T16:20:00.000Z",
            title: "Pick a mode",
            questions: [
                {
                    id: "question-1",
                    label: "Mode",
                    prompt: "Pick a mode",
                    required: true,
                    options: [
                        { label: "Recommended", value: "recommended" },
                        { label: "Conservative", value: "conservative" },
                    ],
                },
            ],
        }

        expect(getRequestedInputDefault(input)).toBe("recommended")
        expect(getRequestedInputDefault(undefined)).toBe("")
    })
})
