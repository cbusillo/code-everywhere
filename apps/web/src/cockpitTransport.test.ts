import { describe, expect, it } from "vitest"

import { cockpitFixtureSnapshot, createCockpitFixtureFromSnapshot } from "./cockpitData"
import {
    createCockpitPollScheduler,
    createSnapshotUrl,
    describeTransportStatus,
    fetchCockpitSnapshot,
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

    it("keeps empty snapshots as valid live cockpit state", () => {
        const fixture = createCockpitFixtureFromSnapshot({
            eventCount: 0,
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
        })

        expect(fixture).toMatchObject({
            sessions: [],
            approvals: [],
            requestedInputs: [],
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

        await expect(fetchCockpitSnapshot("http://127.0.0.1:4789", failingFetch)).rejects.toThrow(
            "Cockpit snapshot request failed with 503",
        )
        await expect(fetchCockpitSnapshot("http://127.0.0.1:4789", malformedFetch)).rejects.toThrow(
            "Cockpit snapshot response did not match the expected shape",
        )
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
