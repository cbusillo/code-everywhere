import { describe, expect, it } from "vitest"

import { cockpitFixture } from "./cockpitData"
import {
    canManageTrust,
    createTrustUrl,
    fetchLocalTrustRegistry,
    postRevokedDeviceId,
    postRevokedHost,
    postRevokedHostId,
    postTrustedDevice,
    postTrustedHost,
} from "./cockpitTrust"

describe("cockpit trust client", () => {
    const session = getFixtureSession()
    const now = () => new Date("2026-04-29T19:50:00.000Z")
    const trustSnapshot = {
        version: 1,
        operator: null,
        hosts: [
            {
                hostId: session.hostId,
                label: session.hostLabel,
                createdAt: "2026-04-29T19:50:00.000Z",
                lastSeenAt: "2026-04-29T19:50:00.000Z",
                status: "trusted",
            },
        ],
        devices: [],
    }
    const device = {
        deviceId: "apple-device-1",
        label: "Casey's iPad",
        platform: "apple",
        createdAt: "2026-04-29T19:49:00.000Z",
        lastSeenAt: "2026-04-29T19:50:00.000Z",
        status: "trusted" as const,
    }

    it("builds trust URLs from a configured transport root", () => {
        expect(createTrustUrl("http://127.0.0.1:4789")).toBe("http://127.0.0.1:4789/trust")
        expect(createTrustUrl("http://127.0.0.1:4789/", "/hosts")).toBe("http://127.0.0.1:4789/trust/hosts")
    })

    it("allows trust management only for live HTTP snapshots", () => {
        expect(canManageTrust({ mode: "fixture", url: null, updatedAt: null, error: null })).toBe(false)
        expect(canManageTrust({ mode: "connecting", url: "http://127.0.0.1:4789", updatedAt: null, error: null })).toBe(false)
        expect(canManageTrust({ mode: "fallback", url: "http://127.0.0.1:4789", updatedAt: null, error: "offline" })).toBe(false)
        expect(canManageTrust({ mode: "live", url: "http://127.0.0.1:4789", updatedAt: "now", error: null })).toBe(true)
    })

    it("posts trusted host records as JSON", async () => {
        const requests: { url: string; init: RequestInit | undefined }[] = []
        const fetchImpl: Parameters<typeof postTrustedHost>[3] = (input, init) => {
            requests.push({ url: toRequestUrl(input), init })
            return Promise.resolve(new Response(JSON.stringify(trustSnapshot), { status: 200 }))
        }

        await expect(postTrustedHost("http://127.0.0.1:4789", session, now, fetchImpl)).resolves.toMatchObject({
            hosts: [{ hostId: session.hostId, status: "trusted" }],
        })
        expect(requests[0]?.url).toBe("http://127.0.0.1:4789/trust/hosts")
        expect(requests[0]?.init).toMatchObject({
            method: "POST",
            body: JSON.stringify({
                host: {
                    hostId: session.hostId,
                    label: session.hostLabel,
                    createdAt: "2026-04-29T19:50:00.000Z",
                    lastSeenAt: "2026-04-29T19:50:00.000Z",
                    status: "trusted",
                },
            }),
        })
    })

    it("posts host revocations as JSON", async () => {
        const requests: { url: string; init: RequestInit | undefined }[] = []
        const fetchImpl: Parameters<typeof postRevokedHost>[3] = (input, init) => {
            requests.push({ url: toRequestUrl(input), init })
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        ...trustSnapshot,
                        hosts: [{ ...trustSnapshot.hosts[0], status: "revoked" }],
                    }),
                    { status: 200 },
                ),
            )
        }

        await expect(postRevokedHost("http://127.0.0.1:4789", session, now, fetchImpl)).resolves.toMatchObject({
            hosts: [{ hostId: session.hostId, status: "revoked" }],
        })
        expect(requests[0]?.url).toBe("http://127.0.0.1:4789/trust/hosts/revoke")
        expect(requests[0]?.init).toMatchObject({
            method: "POST",
            body: JSON.stringify({ hostId: session.hostId, revokedAt: "2026-04-29T19:50:00.000Z" }),
        })
    })

    it("fetches and revokes known host records by host id", async () => {
        const requests: { url: string; init: RequestInit | undefined }[] = []
        const fetchImpl: Parameters<typeof fetchLocalTrustRegistry>[1] = (input, init) => {
            requests.push({ url: toRequestUrl(input), init })
            return Promise.resolve(new Response(JSON.stringify(trustSnapshot), { status: 200 }))
        }

        await expect(fetchLocalTrustRegistry("http://127.0.0.1:4789", fetchImpl)).resolves.toMatchObject({
            hosts: [{ hostId: session.hostId, status: "trusted" }],
        })
        await expect(postRevokedHostId("http://127.0.0.1:4789", " host-alpha ", now, fetchImpl)).resolves.toMatchObject({
            hosts: [{ hostId: session.hostId, status: "trusted" }],
        })
        await expect(postRevokedHostId("http://127.0.0.1:4789", " ", now, fetchImpl)).rejects.toThrow("Host id is required")

        expect(requests.map((request) => request.url)).toEqual([
            "http://127.0.0.1:4789/trust",
            "http://127.0.0.1:4789/trust/hosts/revoke",
        ])
        expect(requests[1]?.init).toMatchObject({
            method: "POST",
            body: JSON.stringify({ hostId: "host-alpha", revokedAt: "2026-04-29T19:50:00.000Z" }),
        })
    })

    it("posts and revokes trusted device records", async () => {
        const requests: { url: string; init: RequestInit | undefined }[] = []
        const fetchImpl: Parameters<typeof postTrustedDevice>[2] = (input, init) => {
            requests.push({ url: toRequestUrl(input), init })
            return Promise.resolve(new Response(JSON.stringify({ ...trustSnapshot, devices: [device] }), { status: 200 }))
        }

        await expect(postTrustedDevice("http://127.0.0.1:4789", device, fetchImpl)).resolves.toMatchObject({
            devices: [{ deviceId: "apple-device-1", platform: "apple", status: "trusted" }],
        })
        await expect(postRevokedDeviceId("http://127.0.0.1:4789", " apple-device-1 ", now, fetchImpl)).resolves.toMatchObject({
            devices: [{ deviceId: "apple-device-1" }],
        })
        await expect(postRevokedDeviceId("http://127.0.0.1:4789", " ", now, fetchImpl)).rejects.toThrow("Device id is required")

        expect(requests.map((request) => request.url)).toEqual([
            "http://127.0.0.1:4789/trust/devices",
            "http://127.0.0.1:4789/trust/devices/revoke",
        ])
        expect(requests[0]?.init).toMatchObject({
            method: "POST",
            body: JSON.stringify({ device }),
        })
        expect(requests[1]?.init).toMatchObject({
            method: "POST",
            body: JSON.stringify({ deviceId: "apple-device-1", revokedAt: "2026-04-29T19:50:00.000Z" }),
        })
    })

    it("rejects missing host ids and malformed responses", async () => {
        const missingHostSession = { ...session }
        delete missingHostSession.hostId
        const failingFetch: Parameters<typeof postTrustedHost>[3] = () => Promise.resolve(new Response("Nope", { status: 400 }))
        const malformedFetch: Parameters<typeof postTrustedHost>[3] = () =>
            Promise.resolve(new Response(JSON.stringify({ version: 1, hosts: [] }), { status: 200 }))

        await expect(postTrustedHost("http://127.0.0.1:4789", missingHostSession, now, failingFetch)).rejects.toThrow(
            "Session does not publish a host id",
        )
        await expect(postTrustedHost("http://127.0.0.1:4789", session, now, failingFetch)).rejects.toThrow(
            "Cockpit trust request failed with 400",
        )
        await expect(postTrustedHost("http://127.0.0.1:4789", session, now, malformedFetch)).rejects.toThrow(
            "Cockpit trust response did not match the expected shape",
        )
        await expect(fetchLocalTrustRegistry("http://127.0.0.1:4789", failingFetch)).rejects.toThrow(
            "Cockpit trust request failed with 400",
        )
        await expect(fetchLocalTrustRegistry("http://127.0.0.1:4789", malformedFetch)).rejects.toThrow(
            "Cockpit trust response did not match the expected shape",
        )
        await expect(
            fetchLocalTrustRegistry("http://127.0.0.1:4789", () =>
                Promise.resolve(
                    new Response(JSON.stringify({ ...trustSnapshot, devices: [{ deviceId: "apple-device-1" }] }), { status: 200 }),
                ),
            ),
        ).rejects.toThrow("Cockpit trust response did not match the expected shape")
    })
})

const getFixtureSession = () => {
    const session = cockpitFixture.sessions[0]
    if (session === undefined) {
        throw new Error("expected fixture session")
    }

    return session
}

const toRequestUrl = (input: RequestInfo | URL): string => {
    if (typeof input === "string") {
        return input
    }

    return input instanceof URL ? input.toString() : input.url
}
