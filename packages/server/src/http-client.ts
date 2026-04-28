import type { CockpitCommandClaim } from "./index"

type FetchLike = typeof globalThis.fetch

export type ClaimCockpitCommandsOptions = {
    sessionId?: string
    fetch?: FetchLike
}

export const claimCockpitCommands = async (
    transportUrl: string,
    options: ClaimCockpitCommandsOptions = {},
): Promise<CockpitCommandClaim> => {
    const response = await (options.fetch ?? globalThis.fetch)(createCommandClaimUrl(transportUrl), {
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

export const createCommandClaimUrl = (transportUrl: string): string => {
    const url = new URL(transportUrl)
    url.pathname = `${url.pathname.replace(/\/$/, "")}/commands/claim`
    return url.toString()
}

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
