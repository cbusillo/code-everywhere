import { describe, expect, it } from "vitest"

import type { SessionCommand } from "@code-everywhere/contracts"

import { claimCockpitCommands, createCockpitEventsUrl, createCommandClaimUrl, postCockpitEvents } from "./http-client"

describe("cockpit HTTP client", () => {
    const command: SessionCommand = {
        kind: "status_request",
        sessionId: "session-1",
        sessionEpoch: "epoch-1",
    }

    it("builds command claim URLs from a configured transport root", () => {
        expect(createCommandClaimUrl("http://127.0.0.1:4789")).toBe("http://127.0.0.1:4789/commands/claim")
        expect(createCommandClaimUrl("http://127.0.0.1:4789/")).toBe("http://127.0.0.1:4789/commands/claim")
        expect(createCommandClaimUrl("http://127.0.0.1:4789/local/")).toBe("http://127.0.0.1:4789/local/commands/claim")
        expect(createCockpitEventsUrl("http://127.0.0.1:4789/local/")).toBe("http://127.0.0.1:4789/local/events")
    })

    it("claims commands with an optional session filter", async () => {
        const requests: { url: string; init: RequestInit | undefined }[] = []
        const fetchImpl: typeof globalThis.fetch = (input, init) => {
            requests.push({ url: toRequestUrl(input), init })
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        claimedAt: "2026-04-27T16:20:00.000Z",
                        commandCount: 1,
                        commands: [
                            {
                                id: "command-1",
                                receivedAt: "2026-04-27T16:19:00.000Z",
                                deliveredAt: "2026-04-27T16:20:00.000Z",
                                command,
                            },
                        ],
                    }),
                    { status: 200 },
                ),
            )
        }

        await expect(
            claimCockpitCommands("http://127.0.0.1:4789", { sessionId: "session-1", fetch: fetchImpl }),
        ).resolves.toMatchObject({ commandCount: 1 })
        expect(requests[0]).toMatchObject({
            url: "http://127.0.0.1:4789/commands/claim",
            init: {
                method: "POST",
                body: JSON.stringify({ sessionId: "session-1" }),
            },
        })
    })

    it("rejects failed or malformed claim responses", async () => {
        const failingFetch: typeof globalThis.fetch = () => Promise.resolve(new Response("Nope", { status: 503 }))
        const malformedFetch: typeof globalThis.fetch = () =>
            Promise.resolve(new Response(JSON.stringify({ commandCount: 1 }), { status: 200 }))

        await expect(claimCockpitCommands("http://127.0.0.1:4789", { fetch: failingFetch })).rejects.toThrow(
            "Cockpit command claim request failed with 503",
        )
        await expect(claimCockpitCommands("http://127.0.0.1:4789", { fetch: malformedFetch })).rejects.toThrow(
            "Cockpit command claim response did not match the expected shape",
        )
    })

    it("publishes one or more cockpit events", async () => {
        const requests: { url: string; init: RequestInit | undefined }[] = []
        const event = {
            kind: "session_hello",
            session: {
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
            },
        } as const
        const fetchImpl: typeof globalThis.fetch = (input, init) => {
            requests.push({ url: toRequestUrl(input), init })
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        eventCount: 1,
                        state: {
                            sessions: {},
                            turns: {},
                            pendingApprovals: {},
                            requestedInputs: {},
                            notifications: [],
                            staleEvents: [],
                        },
                        sessions: [],
                        attentionSessionIds: [],
                    }),
                    { status: 200 },
                ),
            )
        }

        await expect(postCockpitEvents("http://127.0.0.1:4789", event, fetchImpl)).resolves.toMatchObject({ eventCount: 1 })
        expect(requests[0]).toMatchObject({
            url: "http://127.0.0.1:4789/events",
            init: {
                method: "POST",
                body: JSON.stringify({ event }),
            },
        })

        await postCockpitEvents("http://127.0.0.1:4789", [event], fetchImpl)
        expect(requests[1]?.init?.body).toBe(JSON.stringify({ events: [event] }))
    })

    it("rejects failed or malformed event publish responses", async () => {
        const failingFetch: typeof globalThis.fetch = () => Promise.resolve(new Response("Nope", { status: 400 }))
        const malformedFetch: typeof globalThis.fetch = () =>
            Promise.resolve(new Response(JSON.stringify({ eventCount: 1 }), { status: 200 }))

        await expect(postCockpitEvents("http://127.0.0.1:4789", [], failingFetch)).rejects.toThrow(
            "Cockpit event publish request failed with 400",
        )
        await expect(postCockpitEvents("http://127.0.0.1:4789", [], malformedFetch)).rejects.toThrow(
            "Cockpit event publish response did not match the expected shape",
        )
    })
})

const toRequestUrl = (input: Parameters<typeof globalThis.fetch>[0]): string => {
    if (typeof input === "string") {
        return input
    }

    return input instanceof URL ? input.toString() : input.url
}
