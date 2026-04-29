import type { LocalDeviceTrustRecord, LocalHostTrustRecord, LocalTrustRegistrySnapshot } from "@code-everywhere/server/trust"

import type { CockpitSession } from "./cockpitData"
import type { CockpitTransportStatus } from "./cockpitTransport"

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const configuredAuthToken = (() => {
    const authToken: unknown = import.meta.env.VITE_COCKPIT_AUTH_TOKEN
    return typeof authToken === "string" ? normalizeAuthToken(authToken) : null
})()

export const postTrustedHost = async (
    transportUrl: string,
    session: CockpitSession,
    now: () => Date = () => new Date(),
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<LocalTrustRegistrySnapshot> => {
    if (session.hostId === undefined || session.hostId.trim() === "") {
        throw new Error("Session does not publish a host id")
    }

    const timestamp = now().toISOString()
    const host: LocalHostTrustRecord = {
        hostId: session.hostId,
        label: session.hostLabel,
        createdAt:
            session.trust.status === "trusted" || session.trust.status === "revoked"
                ? (session.trust.lastSeenAt ?? timestamp)
                : timestamp,
        lastSeenAt: timestamp,
        status: "trusted",
    }

    return postTrustJson(transportUrl, "hosts", { host }, fetchImpl)
}

export const postRevokedHost = async (
    transportUrl: string,
    session: CockpitSession,
    now: () => Date = () => new Date(),
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<LocalTrustRegistrySnapshot> => {
    if (session.hostId === undefined || session.hostId.trim() === "") {
        throw new Error("Session does not publish a host id")
    }

    return postTrustJson(transportUrl, "hosts/revoke", { hostId: session.hostId, revokedAt: now().toISOString() }, fetchImpl)
}

export const postRevokedHostId = async (
    transportUrl: string,
    hostId: string,
    now: () => Date = () => new Date(),
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<LocalTrustRegistrySnapshot> => {
    const normalizedHostId = hostId.trim()
    if (normalizedHostId === "") {
        throw new Error("Host id is required")
    }

    return postTrustJson(transportUrl, "hosts/revoke", { hostId: normalizedHostId, revokedAt: now().toISOString() }, fetchImpl)
}

export const postTrustedDevice = async (
    transportUrl: string,
    device: LocalDeviceTrustRecord,
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<LocalTrustRegistrySnapshot> => postTrustJson(transportUrl, "devices", { device }, fetchImpl)

export const postRevokedDeviceId = async (
    transportUrl: string,
    deviceId: string,
    now: () => Date = () => new Date(),
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<LocalTrustRegistrySnapshot> => {
    const normalizedDeviceId = deviceId.trim()
    if (normalizedDeviceId === "") {
        throw new Error("Device id is required")
    }

    return postTrustJson(transportUrl, "devices/revoke", { deviceId: normalizedDeviceId, revokedAt: now().toISOString() }, fetchImpl)
}

export const fetchLocalTrustRegistry = async (
    transportUrl: string,
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<LocalTrustRegistrySnapshot> => {
    const response = await fetchImpl(createTrustUrl(transportUrl), {
        cache: "no-store",
        headers: {
            accept: "application/json",
            ...createAuthHeaders(configuredAuthToken),
        },
    })

    if (!response.ok) {
        throw new Error(`Cockpit trust request failed with ${String(response.status)}`)
    }

    const payload = (await response.json()) as unknown
    if (!isLocalTrustRegistrySnapshot(payload)) {
        throw new Error("Cockpit trust response did not match the expected shape")
    }

    return payload
}

export const createTrustUrl = (transportUrl: string, path = ""): string => {
    const normalizedPath = path.replace(/^\/+/, "")
    return `${transportUrl.replace(/\/+$/, "")}/trust${normalizedPath === "" ? "" : `/${normalizedPath}`}`
}

export const canManageTrust = (
    transport: CockpitTransportStatus,
): transport is CockpitTransportStatus & { mode: "live"; url: string } => transport.mode === "live" && transport.url !== null

const postTrustJson = async (
    transportUrl: string,
    path: string,
    body: unknown,
    fetchImpl: FetchLike,
): Promise<LocalTrustRegistrySnapshot> => {
    const response = await fetchImpl(createTrustUrl(transportUrl, path), {
        method: "POST",
        cache: "no-store",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
            ...createAuthHeaders(configuredAuthToken),
        },
        body: JSON.stringify(body),
    })

    if (!response.ok) {
        throw new Error(`Cockpit trust request failed with ${String(response.status)}`)
    }

    const payload = (await response.json()) as unknown
    if (!isLocalTrustRegistrySnapshot(payload)) {
        throw new Error("Cockpit trust response did not match the expected shape")
    }

    return payload
}

function normalizeAuthToken(authToken: string): string | null {
    const normalized = authToken.trim()
    return normalized === "" ? null : normalized
}

function createAuthHeaders(authToken: string | null): Record<string, string> {
    return authToken === null ? {} : { authorization: `Bearer ${authToken}` }
}

const isLocalTrustRegistrySnapshot = (value: unknown): value is LocalTrustRegistrySnapshot =>
    isRecord(value) &&
    value.version === 1 &&
    (value.operator === null || isRecord(value.operator)) &&
    isArrayOf(value.hosts, isHostTrustRecord) &&
    isArrayOf(value.devices, isDeviceTrustRecord)

const isHostTrustRecord = (value: unknown): value is LocalHostTrustRecord =>
    isRecord(value) &&
    typeof value.hostId === "string" &&
    typeof value.label === "string" &&
    typeof value.createdAt === "string" &&
    (value.lastSeenAt === null || typeof value.lastSeenAt === "string") &&
    (value.status === "trusted" || value.status === "revoked")

const isDeviceTrustRecord = (value: unknown): value is LocalDeviceTrustRecord =>
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.label === "string" &&
    (value.platform === undefined || typeof value.platform === "string") &&
    typeof value.createdAt === "string" &&
    (value.lastSeenAt === null || typeof value.lastSeenAt === "string") &&
    (value.status === "trusted" || value.status === "revoked")

const isArrayOf = <Value>(value: unknown, guard: (entry: unknown) => entry is Value): value is Value[] =>
    Array.isArray(value) && value.every(guard)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
