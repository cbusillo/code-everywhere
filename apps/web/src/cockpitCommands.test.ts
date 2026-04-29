import { describe, expect, it } from "vitest"

import type { SessionCommand } from "@code-everywhere/contracts"

import { canPostCockpitCommand, createCommandUrl, fetchCockpitCommands, postCockpitCommand } from "./cockpitCommands"

describe("cockpit command client", () => {
    const command: SessionCommand = {
        kind: "status_request",
        sessionId: "session-1",
        sessionEpoch: "epoch-1",
    }

    it("builds command URLs from a configured transport root", () => {
        expect(createCommandUrl("http://127.0.0.1:4789")).toBe("http://127.0.0.1:4789/commands")
        expect(createCommandUrl("http://127.0.0.1:4789/")).toBe("http://127.0.0.1:4789/commands")
    })

    it("posts commands only after a live HTTP snapshot is available", () => {
        expect(canPostCockpitCommand({ mode: "fixture", url: null, updatedAt: null, error: null })).toBe(false)
        expect(canPostCockpitCommand({ mode: "connecting", url: "http://127.0.0.1:4789", updatedAt: null, error: null })).toBe(false)
        expect(canPostCockpitCommand({ mode: "fallback", url: "http://127.0.0.1:4789", updatedAt: null, error: "offline" })).toBe(
            false,
        )
        expect(canPostCockpitCommand({ mode: "live", url: "http://127.0.0.1:4789", updatedAt: "now", error: null })).toBe(true)
    })

    it("posts commands as JSON and validates the response", async () => {
        const requests: { url: string; init: RequestInit | undefined }[] = []
        const fetchImpl: Parameters<typeof postCockpitCommand>[2] = (input, init) => {
            requests.push({ url: toRequestUrl(input), init })
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        commandCount: 1,
                        commands: [
                            {
                                id: "command-1",
                                receivedAt: "2026-04-27T16:20:00.000Z",
                                deliveredAt: null,
                                command,
                            },
                        ],
                    }),
                    { status: 200 },
                ),
            )
        }

        await expect(postCockpitCommand("http://127.0.0.1:4789", command, fetchImpl)).resolves.toMatchObject({
            commandCount: 1,
        })
        expect(requests[0]?.url).toBe("http://127.0.0.1:4789/commands")
        expect(requests[0]?.init).toMatchObject({
            method: "POST",
            body: JSON.stringify({ command }),
        })
    })

    it("fetches and validates retained command history", async () => {
        const fetchImpl: Parameters<typeof fetchCockpitCommands>[1] = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        commandCount: 1,
                        commands: [
                            {
                                id: "command-1",
                                receivedAt: "2026-04-27T16:20:00.000Z",
                                deliveredAt: "2026-04-27T16:20:05.000Z",
                                command,
                            },
                        ],
                    }),
                    { status: 200 },
                ),
            )

        await expect(fetchCockpitCommands("http://127.0.0.1:4789", fetchImpl)).resolves.toMatchObject({
            commandCount: 1,
            commands: [{ id: "command-1", deliveredAt: "2026-04-27T16:20:05.000Z" }],
        })
    })

    it("accepts every retained session command shape", async () => {
        const commands: SessionCommand[] = [
            {
                kind: "reply",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                content: "Keep going.",
            },
            {
                kind: "continue_autonomously",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
            },
            {
                kind: "pause_current_turn",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
            },
            {
                kind: "end_session",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
            },
            {
                kind: "status_request",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
            },
            {
                kind: "approval_decision",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                approvalId: "approval-1",
                decision: "deny",
            },
            {
                kind: "request_user_input_response",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                answers: [{ questionId: "question-1", value: "timeline" }],
            },
        ]
        const fetchImpl: Parameters<typeof fetchCockpitCommands>[1] = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        commandCount: commands.length,
                        commands: commands.map((retainedCommand, index) => ({
                            id: `command-${String(index + 1)}`,
                            receivedAt: "2026-04-27T16:20:00.000Z",
                            deliveredAt: null,
                            command: retainedCommand,
                        })),
                    }),
                    { status: 200 },
                ),
            )

        await expect(fetchCockpitCommands("http://127.0.0.1:4789", fetchImpl)).resolves.toMatchObject({
            commandCount: commands.length,
            commands: commands.map((retainedCommand) => ({ command: retainedCommand })),
        })
    })

    it("rejects failed or malformed command responses", async () => {
        const failingFetch: Parameters<typeof postCockpitCommand>[2] = () => Promise.resolve(new Response("Nope", { status: 400 }))
        const malformedFetch: Parameters<typeof postCockpitCommand>[2] = () =>
            Promise.resolve(new Response(JSON.stringify({ commandCount: 1 }), { status: 200 }))
        const malformedHistoryFetch: Parameters<typeof fetchCockpitCommands>[1] = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        commandCount: 1,
                        commands: [
                            {
                                id: "command-1",
                                receivedAt: "2026-04-27T16:20:00.000Z",
                                deliveredAt: null,
                                command: {
                                    ...command,
                                    kind: "teleport",
                                },
                            },
                        ],
                    }),
                    { status: 200 },
                ),
            )

        await expect(postCockpitCommand("http://127.0.0.1:4789", command, failingFetch)).rejects.toThrow(
            "Cockpit command request failed with 400",
        )
        await expect(postCockpitCommand("http://127.0.0.1:4789", command, malformedFetch)).rejects.toThrow(
            "Cockpit command response did not match the expected shape",
        )
        await expect(fetchCockpitCommands("http://127.0.0.1:4789", malformedHistoryFetch)).rejects.toThrow(
            "Cockpit command history response did not match the expected shape",
        )
    })
})

const toRequestUrl = (input: RequestInfo | URL): string => {
    if (typeof input === "string") {
        return input
    }

    return input instanceof URL ? input.toString() : input.url
}
