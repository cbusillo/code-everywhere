import type { SessionCommand } from "@code-everywhere/contracts"
import type { CockpitCommandSnapshot } from "@code-everywhere/server"

import type { CockpitTransportStatus } from "./cockpitTransport"

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export const postCockpitCommand = async (
    transportUrl: string,
    command: SessionCommand,
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<CockpitCommandSnapshot> => {
    const response = await fetchImpl(createCommandUrl(transportUrl), {
        method: "POST",
        cache: "no-store",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
        },
        body: JSON.stringify({ command }),
    })

    if (!response.ok) {
        throw new Error(`Cockpit command request failed with ${String(response.status)}`)
    }

    const body = (await response.json()) as unknown
    if (!isCockpitCommandSnapshot(body)) {
        throw new Error("Cockpit command response did not match the expected shape")
    }

    return body
}

export const createCommandUrl = (transportUrl: string): string => `${transportUrl.replace(/\/+$/, "")}/commands`

export const canPostCockpitCommand = (
    transport: CockpitTransportStatus,
): transport is CockpitTransportStatus & { mode: "live"; url: string } => transport.mode === "live" && transport.url !== null

const isCockpitCommandSnapshot = (value: unknown): value is CockpitCommandSnapshot =>
    isRecord(value) && typeof value.commandCount === "number" && Array.isArray(value.commands)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
