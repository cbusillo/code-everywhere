import { describe, expect, it } from "vitest"

import type { SessionCommand } from "@code-everywhere/contracts"

import { canPostCockpitCommand, createCommandUrl, postCockpitCommand } from "./cockpitCommands"

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

    it("posts commands whenever a transport URL is configured", () => {
        expect(canPostCockpitCommand(null)).toBe(false)
        expect(canPostCockpitCommand("http://127.0.0.1:4789")).toBe(true)
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

    it("rejects failed or malformed command responses", async () => {
        const failingFetch: Parameters<typeof postCockpitCommand>[2] = () => Promise.resolve(new Response("Nope", { status: 400 }))
        const malformedFetch: Parameters<typeof postCockpitCommand>[2] = () =>
            Promise.resolve(new Response(JSON.stringify({ commandCount: 1 }), { status: 200 }))

        await expect(postCockpitCommand("http://127.0.0.1:4789", command, failingFetch)).rejects.toThrow(
            "Cockpit command request failed with 400",
        )
        await expect(postCockpitCommand("http://127.0.0.1:4789", command, malformedFetch)).rejects.toThrow(
            "Cockpit command response did not match the expected shape",
        )
    })
})

const toRequestUrl = (input: RequestInfo | URL): string => {
    if (typeof input === "string") {
        return input
    }

    return input instanceof URL ? input.toString() : input.url
}
