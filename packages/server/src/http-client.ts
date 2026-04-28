import type { CockpitProjectionEvent } from "@code-everywhere/contracts"

import type { CockpitCommandClaim, CockpitIngestionSnapshot } from "./index.js"

type FetchLike = typeof globalThis.fetch

export type ClaimCockpitCommandsOptions = {
    sessionId?: string
    fetch?: FetchLike
}

export const claimCockpitCommands = async (
    transportUrl: string,
    options: ClaimCockpitCommandsOptions = {},
): Promise<CockpitCommandClaim> => {
    const response = await (options.fetch ?? globalThis.fetch)(createLocalHttpUrl(transportUrl, "commands/claim"), {
        method: "POST",
        cache: "no-store",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
        },
        body: JSON.stringify(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    })

    if (!response.ok) {
        throw new Error(`Cockpit command claim request failed with ${String(response.status)}`)
    }

    const body = await response.json()
    if (!isCockpitCommandClaim(body)) {
        throw new Error("Cockpit command claim response did not match the expected shape")
    }

    return body
}

export const postCockpitEvents = async (
    transportUrl: string,
    events: CockpitProjectionEvent | CockpitProjectionEvent[],
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<CockpitIngestionSnapshot> => {
    const response = await fetchImpl(createCockpitEventsUrl(transportUrl), {
        method: "POST",
        cache: "no-store",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
        },
        body: JSON.stringify(Array.isArray(events) ? { events } : { event: events }),
    })

    if (!response.ok) {
        throw new Error(`Cockpit event publish request failed with ${String(response.status)}`)
    }

    const body = await response.json()
    if (!isCockpitIngestionSnapshot(body)) {
        throw new Error("Cockpit event publish response did not match the expected shape")
    }

    return body
}

export const createCommandClaimUrl = (transportUrl: string): string => createLocalHttpUrl(transportUrl, "commands/claim")

export const createCockpitEventsUrl = (transportUrl: string): string => createLocalHttpUrl(transportUrl, "events")

const createLocalHttpUrl = (transportUrl: string, path: string): string => {
    const url = new URL(transportUrl)
    const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname
    url.pathname = `${basePath}/${path}`
    return url.toString()
}

const isCockpitIngestionSnapshot = (value: unknown): value is CockpitIngestionSnapshot =>
    isRecord(value) &&
    typeof value.eventCount === "number" &&
    isRecord(value.state) &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.attentionSessionIds) &&
    value.attentionSessionIds.every((sessionId) => typeof sessionId === "string")

const isCockpitCommandClaim = (value: unknown): value is CockpitCommandClaim =>
    isRecord(value) &&
    typeof value.claimedAt === "string" &&
    typeof value.commandCount === "number" &&
    Array.isArray(value.commands) &&
    value.commands.every(isCockpitCommandRecord)

const isCockpitCommandRecord = (value: unknown): boolean =>
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.receivedAt === "string" &&
    (typeof value.deliveredAt === "string" || value.deliveredAt === null) &&
    isRecord(value.command) &&
    typeof value.command.kind === "string" &&
    typeof value.command.sessionId === "string" &&
    typeof value.command.sessionEpoch === "string"

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
