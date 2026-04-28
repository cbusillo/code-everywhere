import { describe, expect, it } from "vitest"

import { cockpitFixtureSnapshot, createCockpitFixtureFromSnapshot } from "./cockpitData"
import {
    createCockpitPollScheduler,
    createSnapshotUrl,
    describeTransportStatus,
    fetchCockpitSnapshot,
    normalizePollIntervalMs,
    normalizeTransportUrl,
} from "./cockpitTransport"

describe("cockpit HTTP transport client", () => {
    it("builds snapshot URLs from a configured transport root", () => {
        expect(createSnapshotUrl("http://127.0.0.1:4789")).toBe("http://127.0.0.1:4789/snapshot")
        expect(createSnapshotUrl("http://127.0.0.1:4789/")).toBe("http://127.0.0.1:4789/snapshot")
    })

    it("normalizes optional transport configuration", () => {
        expect(normalizeTransportUrl(undefined)).toBeNull()
        expect(normalizeTransportUrl("  ")).toBeNull()
        expect(normalizeTransportUrl(" http://127.0.0.1:4789 ")).toBe("http://127.0.0.1:4789")
    })

    it("normalizes optional poll interval configuration", () => {
        expect(normalizePollIntervalMs(undefined)).toBeNull()
        expect(normalizePollIntervalMs("  ")).toBeNull()
        expect(normalizePollIntervalMs("500")).toBe(500)
        expect(normalizePollIntervalMs("250.9")).toBe(250)
        expect(normalizePollIntervalMs("0")).toBeNull()
        expect(normalizePollIntervalMs("0.5")).toBeNull()
        expect(normalizePollIntervalMs("nope")).toBeNull()
    })

    it("fetches and validates cockpit snapshots", async () => {
        const requests: string[] = []
        const fetchImpl: Parameters<typeof fetchCockpitSnapshot>[1] = (input) => {
            requests.push(toRequestUrl(input))
            return Promise.resolve(new Response(JSON.stringify(cockpitFixtureSnapshot), { status: 200 }))
        }

        await expect(fetchCockpitSnapshot("http://127.0.0.1:4789", fetchImpl)).resolves.toMatchObject({
            eventCount: cockpitFixtureSnapshot.eventCount,
            attentionSessionIds: cockpitFixtureSnapshot.attentionSessionIds,
        })
        expect(requests).toEqual(["http://127.0.0.1:4789/snapshot"])
    })

    it("keeps snapshots without command outcomes backward-compatible", async () => {
        const legacyState: Record<string, unknown> = { ...cockpitFixtureSnapshot.state }
        delete legacyState.commandOutcomes
        const legacySnapshot = {
            ...cockpitFixtureSnapshot,
            state: legacyState,
        }

        const fetchImpl: Parameters<typeof fetchCockpitSnapshot>[1] = () =>
            Promise.resolve(new Response(JSON.stringify(legacySnapshot), { status: 200 }))

        await expect(fetchCockpitSnapshot("http://127.0.0.1:4789", fetchImpl)).resolves.toMatchObject({
            state: {
                commandOutcomes: {},
            },
        })
    })

    it("keeps empty snapshots as valid live cockpit state", () => {
        const fixture = createCockpitFixtureFromSnapshot({
            eventCount: 0,
            state: {
                sessions: {},
                turns: {},
                pendingApprovals: {},
                requestedInputs: {},
                commandOutcomes: {},
                notifications: [],
                staleEvents: [],
            },
            sessions: [],
            attentionSessionIds: [],
        })

        expect(fixture).toMatchObject({
            sessions: [],
            approvals: [],
            requestedInputs: [],
            commandOutcomes: [],
            commands: [],
        })
    })

    it("schedules the next poll only after the current request finishes", async () => {
        const scheduledPolls: (() => void)[] = []
        const originalSetTimeout = globalThis.setTimeout
        const originalClearTimeout = globalThis.clearTimeout
        globalThis.setTimeout = ((handler: () => void) => {
            scheduledPolls.push(handler)
            return scheduledPolls.length
        }) as typeof globalThis.setTimeout
        globalThis.clearTimeout = () => undefined

        try {
            const scheduler = createCockpitPollScheduler()
            const completions: (() => void)[] = []
            let loadCount = 0
            const loadSnapshot = () => {
                loadCount += 1
                return new Promise<void>((resolve) => completions.push(resolve))
            }

            scheduler.run(loadSnapshot, 3_000)

            expect(loadCount).toBe(1)
            expect(scheduledPolls).toHaveLength(0)

            completions[0]?.()
            await Promise.resolve()
            expect(scheduledPolls).toHaveLength(1)

            scheduledPolls[0]?.()
            expect(loadCount).toBe(2)
        } finally {
            globalThis.setTimeout = originalSetTimeout
            globalThis.clearTimeout = originalClearTimeout
        }
    })

    it("rejects failed or malformed snapshot responses", async () => {
        const failingFetch: Parameters<typeof fetchCockpitSnapshot>[1] = () => Promise.resolve(new Response("Nope", { status: 503 }))
        const malformedFetch: Parameters<typeof fetchCockpitSnapshot>[1] = () =>
            Promise.resolve(new Response(JSON.stringify({ eventCount: 1 }), { status: 200 }))
        const malformedNestedFetch: Parameters<typeof fetchCockpitSnapshot>[1] = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        ...cockpitFixtureSnapshot,
                        sessions: [
                            {
                                ...cockpitFixtureSnapshot.sessions[0],
                                turnIds: "turn-alpha-3",
                            },
                        ],
                    }),
                    { status: 200 },
                ),
            )
        const malformedOutcomeFetch: Parameters<typeof fetchCockpitSnapshot>[1] = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        ...cockpitFixtureSnapshot,
                        state: {
                            ...cockpitFixtureSnapshot.state,
                            commandOutcomes: {
                                "command-1": {
                                    commandId: "command-1",
                                    sessionId: "ce-alpha",
                                    sessionEpoch: "epoch-34",
                                    commandKind: "teleport",
                                    status: "accepted",
                                    reason: null,
                                    handledAt: "2026-04-27T17:00:00.000Z",
                                },
                            },
                        },
                    }),
                    { status: 200 },
                ),
            )

        await expect(fetchCockpitSnapshot("http://127.0.0.1:4789", failingFetch)).rejects.toThrow(
            "Cockpit snapshot request failed with 503",
        )
        await expect(fetchCockpitSnapshot("http://127.0.0.1:4789", malformedFetch)).rejects.toThrow(
            "Cockpit snapshot response did not match the expected shape",
        )
        await expect(fetchCockpitSnapshot("http://127.0.0.1:4789", malformedNestedFetch)).rejects.toThrow(
            "Cockpit snapshot response did not match the expected shape",
        )
        await expect(fetchCockpitSnapshot("http://127.0.0.1:4789", malformedOutcomeFetch)).rejects.toThrow(
            "Cockpit snapshot response did not match the expected shape",
        )
    })

    it("does not schedule another poll after a pending request is stopped", async () => {
        const scheduledPolls: (() => void)[] = []
        const originalSetTimeout = globalThis.setTimeout
        const originalClearTimeout = globalThis.clearTimeout
        globalThis.setTimeout = ((handler: () => void) => {
            scheduledPolls.push(handler)
            return scheduledPolls.length
        }) as typeof globalThis.setTimeout
        globalThis.clearTimeout = () => undefined

        try {
            const scheduler = createCockpitPollScheduler()
            let completeRequest: (() => void) | undefined
            const loadSnapshot = () => new Promise<void>((resolve) => (completeRequest = resolve))

            scheduler.run(loadSnapshot, 3_000)
            scheduler.stop()
            completeRequest?.()
            await Promise.resolve()

            expect(scheduledPolls).toHaveLength(0)
        } finally {
            globalThis.setTimeout = originalSetTimeout
            globalThis.clearTimeout = originalClearTimeout
        }
    })

    it("labels the visible transport modes", () => {
        expect(describeTransportStatus({ mode: "fixture", url: null, updatedAt: null, error: null })).toBe("Fake data")
        expect(describeTransportStatus({ mode: "live", url: "http://127.0.0.1:4789", updatedAt: null, error: null })).toBe(
            "Live HTTP",
        )
        expect(describeTransportStatus({ mode: "fallback", url: "http://127.0.0.1:4789", updatedAt: null, error: "offline" })).toBe(
            "HTTP fallback",
        )
    })
})

const toRequestUrl = (input: RequestInfo | URL): string => {
    if (typeof input === "string") {
        return input
    }

    return input instanceof URL ? input.toString() : input.url
}
