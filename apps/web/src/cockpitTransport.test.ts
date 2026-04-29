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

    it("keeps legacy snapshots without host identity backward-compatible", async () => {
        const legacySnapshot = {
            ...cockpitFixtureSnapshot,
            sessions: cockpitFixtureSnapshot.sessions.map((session) => {
                const legacySession: Record<string, unknown> = { ...session }
                delete legacySession.hostId
                delete legacySession.trust
                return legacySession
            }),
            state: {
                ...cockpitFixtureSnapshot.state,
                sessions: Object.fromEntries(
                    Object.entries(cockpitFixtureSnapshot.state.sessions).map(([sessionId, session]) => {
                        const legacySession: Record<string, unknown> = { ...session }
                        delete legacySession.hostId
                        delete legacySession.trust
                        return [sessionId, legacySession]
                    }),
                ),
            },
        }
        const fetchImpl: Parameters<typeof fetchCockpitSnapshot>[1] = () =>
            Promise.resolve(new Response(JSON.stringify(legacySnapshot), { status: 200 }))

        const snapshot = await fetchCockpitSnapshot("http://127.0.0.1:4789", fetchImpl)

        expect(snapshot.sessions).toHaveLength(cockpitFixtureSnapshot.sessions.length)
        expect(snapshot.sessions.every((session) => session.hostLabel === "Callisto MBP")).toBe(true)
        expect(snapshot.sessions.every((session) => session.hostId === undefined)).toBe(true)
        expect(snapshot.sessions.every((session) => session.trust.status === "unidentified")).toBe(true)
        expect(Object.values(snapshot.state.sessions).every((session) => session.trust.hostId === null)).toBe(true)
    })

    it("validates trust-aware snapshot sessions", async () => {
        const trustedSnapshot = {
            ...cockpitFixtureSnapshot,
            sessions: cockpitFixtureSnapshot.sessions.map((session) => ({
                ...session,
                trust: {
                    status: "trusted",
                    hostId: session.hostId,
                    hostLabel: session.hostLabel,
                    trustedHostLabel: "Callisto MBP",
                    lastSeenAt: "2026-04-27T16:04:00.000Z",
                },
            })),
            state: {
                ...cockpitFixtureSnapshot.state,
                sessions: Object.fromEntries(
                    Object.entries(cockpitFixtureSnapshot.state.sessions).map(([sessionId, session]) => [
                        sessionId,
                        {
                            ...session,
                            trust: {
                                status: "trusted",
                                hostId: session.hostId,
                                hostLabel: session.hostLabel,
                                trustedHostLabel: "Callisto MBP",
                                lastSeenAt: "2026-04-27T16:04:00.000Z",
                            },
                        },
                    ]),
                ),
            },
        }
        const fetchImpl: Parameters<typeof fetchCockpitSnapshot>[1] = () =>
            Promise.resolve(new Response(JSON.stringify(trustedSnapshot), { status: 200 }))

        const snapshot = await fetchCockpitSnapshot("http://127.0.0.1:4789", fetchImpl)

        expect(snapshot.sessions).toHaveLength(cockpitFixtureSnapshot.sessions.length)
        expect(snapshot.sessions.every((session) => session.trust.status === "trusted")).toBe(true)
        expect(snapshot.sessions.every((session) => session.trust.trustedHostLabel === "Callisto MBP")).toBe(true)
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
            staleEvents: [],
        })
    })

    it("exposes stale event evidence to the cockpit fixture", () => {
        const fixture = createCockpitFixtureFromSnapshot({
            ...cockpitFixtureSnapshot,
            state: {
                ...cockpitFixtureSnapshot.state,
                staleEvents: [
                    {
                        eventKind: "turn_step_added",
                        sessionId: "ce-alpha",
                        eventEpoch: "old-epoch",
                        currentEpoch: "epoch-34",
                        receivedAt: "2026-04-27T16:10:00.000Z",
                    },
                ],
            },
        })

        expect(fixture.staleEvents).toEqual([
            {
                eventKind: "turn_step_added",
                sessionId: "ce-alpha",
                eventEpoch: "old-epoch",
                currentEpoch: "epoch-34",
                receivedAt: "2026-04-27T16:10:00.000Z",
            },
        ])
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
