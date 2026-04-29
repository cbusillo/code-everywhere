import type { RequestedInputAnswer, SessionCommand } from "@code-everywhere/contracts"
import type { CockpitCommandRecord, CockpitCommandSnapshot } from "@code-everywhere/server"

import type { CockpitTransportStatus } from "./cockpitTransport"

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const configuredAuthToken = (() => {
    const authToken: unknown = import.meta.env.VITE_COCKPIT_AUTH_TOKEN
    return typeof authToken === "string" ? normalizeAuthToken(authToken) : null
})()

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
            ...createAuthHeaders(configuredAuthToken),
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

export const fetchCockpitCommands = async (
    transportUrl: string,
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<CockpitCommandSnapshot> => {
    const response = await fetchImpl(createCommandUrl(transportUrl), {
        cache: "no-store",
        headers: {
            accept: "application/json",
            ...createAuthHeaders(configuredAuthToken),
        },
    })

    if (!response.ok) {
        throw new Error(`Cockpit command history request failed with ${String(response.status)}`)
    }

    const body = (await response.json()) as unknown
    if (!isCockpitCommandSnapshot(body)) {
        throw new Error("Cockpit command history response did not match the expected shape")
    }

    return body
}

export const createCommandUrl = (transportUrl: string): string => `${transportUrl.replace(/\/+$/, "")}/commands`

function normalizeAuthToken(authToken: string): string | null {
    const normalized = authToken.trim()
    return normalized === "" ? null : normalized
}

function createAuthHeaders(authToken: string | null): Record<string, string> {
    return authToken === null ? {} : { authorization: `Bearer ${authToken}` }
}

export const canPostCockpitCommand = (
    transport: CockpitTransportStatus,
): transport is CockpitTransportStatus & { mode: "live"; url: string } => transport.mode === "live" && transport.url !== null

export const isCockpitCommandSnapshot = (value: unknown): value is CockpitCommandSnapshot =>
    isRecord(value) && typeof value.commandCount === "number" && isArrayOf(value.commands, isCockpitCommandRecord)

const isCockpitCommandRecord = (value: unknown): value is CockpitCommandRecord =>
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.receivedAt === "string" &&
    (value.deliveredAt === null || typeof value.deliveredAt === "string") &&
    isSessionCommand(value.command)

const isSessionCommand = (value: unknown): value is SessionCommand => {
    if (!isRecord(value) || typeof value.kind !== "string") {
        return false
    }

    switch (value.kind) {
        case "reply":
            return hasCommandScope(value) && typeof value.content === "string"
        case "continue_autonomously":
        case "pause_current_turn":
        case "end_session":
        case "status_request":
            return hasCommandScope(value)
        case "approval_decision":
            return hasCommandScope(value) && typeof value.approvalId === "string" && isOneOf(value.decision, ["approve", "deny"])
        case "request_user_input_response":
            return (
                hasCommandScope(value) &&
                (!Object.prototype.hasOwnProperty.call(value, "inputId") || typeof value.inputId === "string") &&
                typeof value.turnId === "string" &&
                isArrayOf(value.answers, isRequestedInputAnswer)
            )
        default:
            return false
    }
}

const hasCommandScope = (value: Record<string, unknown>): boolean =>
    typeof value.sessionId === "string" && typeof value.sessionEpoch === "string"

const isRequestedInputAnswer = (value: unknown): value is RequestedInputAnswer =>
    isRecord(value) && typeof value.questionId === "string" && typeof value.value === "string"

const isArrayOf = <Value>(value: unknown, guard: (entry: unknown) => entry is Value): value is Value[] =>
    Array.isArray(value) && value.every(guard)

const isOneOf = <Value extends string>(value: unknown, values: readonly Value[]): value is Value =>
    typeof value === "string" && values.includes(value as Value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
