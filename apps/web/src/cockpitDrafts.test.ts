import { describe, expect, it } from "vitest"

import type { RequestedInput } from "@code-everywhere/contracts"

import {
    getDraftValue,
    getRequestedInputAnswers,
    getRequestedInputAnswerValues,
    getRequestedInputDefault,
    setDraftValue,
    setRequestedInputAnswerValue,
} from "./cockpitDrafts"

describe("cockpit draft state", () => {
    it("keeps draft values keyed by active work", () => {
        const drafts = setDraftValue(setDraftValue({}, "session-a", "first reply"), "session-b", "second reply")

        expect(getDraftValue(drafts, "session-a")).toBe("first reply")
        expect(getDraftValue(drafts, "session-b")).toBe("second reply")
        expect(getDraftValue(drafts, "session-c", "fallback")).toBe("fallback")
    })

    it("builds answers for every requested-input question", () => {
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
                {
                    id: "question-2",
                    label: "Scope",
                    prompt: "Pick a scope",
                    required: true,
                    options: [
                        { label: "Current task", value: "current" },
                        { label: "Whole project", value: "project" },
                    ],
                },
            ],
        }
        const drafts = setRequestedInputAnswerValue({}, "input-1", "question-2", "project")
        const values = getRequestedInputAnswerValues(drafts, input)

        expect(getRequestedInputDefault(input.questions[0])).toBe("recommended")
        expect(getRequestedInputDefault(undefined)).toBe("")
        expect(values).toEqual({
            "question-1": "recommended",
            "question-2": "project",
        })
        expect(getRequestedInputAnswers(input, values)).toEqual([
            { questionId: "question-1", value: "recommended" },
            { questionId: "question-2", value: "project" },
        ])
    })
})
