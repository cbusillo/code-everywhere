import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

import type {
    CommandOutcome,
    CockpitProjectionEvent,
    EveryCodeSession,
    PendingApproval,
    RequestedInput,
    RequestedInputAnswer,
    RequestedInputOption,
    RequestedInputQuestion,
    SessionCommand,
    SessionTurn,
    SessionStatus,
    TurnStatus,
    TurnStep,
} from "@code-everywhere/contracts"

import {
    createCockpitCommandStore,
    createCockpitEventStore,
    type CockpitCommandSnapshot,
    type CockpitCommandStore,
    type CockpitCommandClaim,
    type CockpitEventStore,
    type CockpitIngestionSnapshot,
} from "./index.js"

export type CockpitHttpHandlerOptions = {
    store?: CockpitEventStore
    commandStore?: CockpitCommandStore
    maxBodyBytes?: number
    authToken?: string | null
}

export type CockpitHttpServerOptions = CockpitHttpHandlerOptions

type JsonResponse = CockpitIngestionSnapshot | CockpitCommandSnapshot | CockpitCommandClaim | { error: string }

const defaultMaxBodyBytes = 1024 * 1024
const sessionStatusValues = [
    "running",
    "idle",
    "blocked",
    "waiting-for-input",
    "waiting-for-approval",
    "ended",
    "error",
] as const satisfies readonly SessionStatus[]
const turnStatusValues = [
    "running",
    "completed",
    "blocked",
    "waiting-for-input",
    "waiting-for-approval",
    "error",
] as const satisfies readonly TurnStatus[]
const turnActorValues = ["operator", "assistant", "system"] as const satisfies readonly SessionTurn["actor"][]
const turnStepKindValues = ["message", "tool", "status", "diff", "artifact", "error"] as const satisfies readonly TurnStep["kind"][]
const turnStepStateValues = ["pending", "running", "completed", "blocked", "error"] as const satisfies readonly TurnStep["state"][]
const approvalRiskValues = ["low", "medium", "high"] as const satisfies readonly PendingApproval["risk"][]
const approvalDecisionValues = ["approve", "deny", "expired"] as const
const commandApprovalDecisionValues = ["approve", "deny"] as const
const sessionCommandKindValues = [
    "reply",
    "continue_autonomously",
    "pause_current_turn",
    "end_session",
    "status_request",
    "approval_decision",
    "request_user_input_response",
] as const satisfies readonly SessionCommand["kind"][]
const commandOutcomeStatusValues = ["accepted", "rejected"] as const satisfies readonly CommandOutcome["status"][]

export const createCockpitHttpHandler = (options: CockpitHttpHandlerOptions = {}) => {
    const store = options.store ?? createCockpitEventStore()
    const commandStore = options.commandStore ?? createCockpitCommandStore()
    const maxBodyBytes = options.maxBodyBytes ?? defaultMaxBodyBytes
    const authToken = normalizeAuthToken(options.authToken)

    return (request: IncomingMessage, response: ServerResponse): void => {
        void routeRequest(request, response, store, commandStore, maxBodyBytes, authToken).catch((error: unknown) => {
            if (error instanceof HttpInputError) {
                writeJson(response, error.statusCode, { error: error.message })
                return
            }

            writeJson(response, 500, { error: error instanceof Error ? error.message : "Unexpected server error" })
        })
    }
}

export const createCockpitHttpServer = (options: CockpitHttpServerOptions = {}): Server =>
    createServer(createCockpitHttpHandler(options))

const routeRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    store: CockpitEventStore,
    commandStore: CockpitCommandStore,
    maxBodyBytes: number,
    authToken: string | null,
): Promise<void> => {
    setCorsHeaders(response)

    if (request.method === "OPTIONS") {
        response.statusCode = 204
        response.end()
        return
    }

    const url = parseRequestUrl(request)

    if (!isAuthorizedRequest(request, authToken)) {
        response.setHeader("www-authenticate", 'Bearer realm="code-everywhere"')
        writeJson(response, 401, { error: "Unauthorized" })
        return
    }

    if (url.pathname === "/snapshot") {
        if (request.method !== "GET") {
            writeMethodNotAllowed(response, "GET")
            return
        }

        writeJson(response, 200, store.getSnapshot())
        return
    }

    if (url.pathname === "/events") {
        if (request.method !== "POST") {
            writeMethodNotAllowed(response, "POST")
            return
        }

        const body = await readJsonBody(request, maxBodyBytes)
        const events = normalizeEventPayload(body)
        if (events === null || events.length === 0) {
            writeJson(response, 400, { error: "Expected one or more cockpit projection events" })
            return
        }

        writeJson(response, 200, store.ingestMany(events))
        return
    }

    if (url.pathname === "/commands/claim") {
        if (request.method !== "POST") {
            writeMethodNotAllowed(response, "POST")
            return
        }

        const body = await readJsonBody(request, maxBodyBytes, true)
        const filter = normalizeCommandClaimPayload(body)
        if (filter === null) {
            writeJson(response, 400, { error: "Expected command claim payload to be empty or contain a sessionId" })
            return
        }

        writeJson(response, 200, commandStore.claimUndelivered(filter))
        return
    }

    if (url.pathname === "/commands") {
        if (request.method === "GET") {
            writeJson(response, 200, commandStore.getSnapshot())
            return
        }

        if (request.method !== "POST") {
            writeMethodNotAllowed(response, "GET, POST")
            return
        }

        const body = await readJsonBody(request, maxBodyBytes)
        const command = normalizeCommandPayload(body)
        if (command === null) {
            writeJson(response, 400, { error: "Expected one cockpit session command" })
            return
        }

        writeJson(response, 200, commandStore.enqueue(command))
        return
    }

    if (url.pathname === "/reset") {
        if (request.method !== "POST") {
            writeMethodNotAllowed(response, "POST")
            return
        }

        const body = await readJsonBody(request, maxBodyBytes, true)
        const events = body === undefined ? [] : normalizeEventPayload(body)
        if (events === null) {
            writeJson(response, 400, { error: "Expected reset payload to be empty or contain cockpit projection events" })
            return
        }

        writeJson(response, 200, store.reset(events))
        return
    }

    writeJson(response, 404, { error: "Not found" })
}

const parseRequestUrl = (request: IncomingMessage): URL => new URL(request.url ?? "/", "http://localhost")

const normalizeAuthToken = (token: string | null | undefined): string | null => {
    const normalized = token?.trim()
    return normalized === undefined || normalized === "" ? null : normalized
}

const isAuthorizedRequest = (request: IncomingMessage, authToken: string | null): boolean => {
    if (authToken === null) {
        return true
    }

    return getBearerToken(request) === authToken || getHeaderValue(request, "x-code-everywhere-token") === authToken
}

const getBearerToken = (request: IncomingMessage): string | null => {
    const authorization = getHeaderValue(request, "authorization")
    const match = /^Bearer\s+(.+)$/i.exec(authorization)
    return match?.[1]?.trim() ?? null
}

const getHeaderValue = (request: IncomingMessage, name: string): string => {
    const value = request.headers[name]
    if (Array.isArray(value)) {
        return value[0]?.trim() ?? ""
    }

    return value?.trim() ?? ""
}

const readJsonBody = async (request: IncomingMessage, maxBodyBytes: number, allowEmpty = false): Promise<unknown> => {
    const chunks: Uint8Array[] = []
    let byteLength = 0

    for await (const chunk of request as AsyncIterable<Buffer | string>) {
        const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk
        byteLength += buffer.byteLength

        if (byteLength > maxBodyBytes) {
            throw new HttpInputError(413, "Request body is too large")
        }

        chunks.push(buffer)
    }

    if (chunks.length === 0) {
        return allowEmpty ? undefined : null
    }

    const rawBody = Buffer.concat(chunks).toString("utf8").trim()
    if (rawBody === "") {
        return allowEmpty ? undefined : null
    }

    try {
        return JSON.parse(rawBody) as unknown
    } catch {
        throw new HttpInputError(400, "Request body must be valid JSON")
    }
}

class HttpInputError extends Error {
    constructor(
        readonly statusCode: number,
        message: string,
    ) {
        super(message)
    }
}

const normalizeEventPayload = (payload: unknown): CockpitProjectionEvent[] | null => {
    const candidateEvents = selectEventPayload(payload)

    if (candidateEvents === null) {
        return null
    }

    return candidateEvents.every(isCockpitProjectionEvent) ? candidateEvents : null
}

const selectEventPayload = (payload: unknown): unknown[] | null => {
    if (Array.isArray(payload)) {
        return payload as unknown[]
    }
    if (isRecord(payload) && "events" in payload && Array.isArray(payload.events)) {
        return payload.events as unknown[]
    }
    if (isRecord(payload) && "event" in payload) {
        return [payload.event]
    }
    if (isCockpitProjectionEvent(payload)) {
        return [payload]
    }

    return null
}

const normalizeCommandPayload = (payload: unknown): SessionCommand | null => {
    const command = selectCommandPayload(payload)
    return isSessionCommand(command) ? command : null
}

const normalizeCommandClaimPayload = (payload: unknown): { sessionId?: string } | null => {
    if (payload === undefined) {
        return {}
    }

    if (!isRecord(payload)) {
        return null
    }

    if (Object.keys(payload).length === 0) {
        return {}
    }

    const sessionId = payload.sessionId
    if (Object.keys(payload).length === 1 && typeof sessionId === "string") {
        return { sessionId }
    }

    return null
}

const selectCommandPayload = (payload: unknown): unknown => {
    if (isRecord(payload) && "command" in payload) {
        return payload.command
    }

    return payload
}

export const isSessionCommand = (value: unknown): value is SessionCommand => {
    if (!isRecord(value) || typeof value.kind !== "string") {
        return false
    }

    switch (value.kind) {
        case "reply":
            return hasCommandScope(value) && hasString(value, "content")
        case "continue_autonomously":
        case "pause_current_turn":
        case "end_session":
        case "status_request":
            return hasCommandScope(value)
        case "approval_decision":
            return (
                hasCommandScope(value) && hasString(value, "approvalId") && hasEnum(value, "decision", commandApprovalDecisionValues)
            )
        case "request_user_input_response":
            return (
                hasCommandScope(value) &&
                (!Object.prototype.hasOwnProperty.call(value, "inputId") || hasString(value, "inputId")) &&
                hasString(value, "turnId") &&
                Array.isArray(value.answers) &&
                value.answers.every(isRequestedInputAnswer)
            )
        default:
            return false
    }
}

const hasCommandScope = (value: Record<string, unknown>): boolean =>
    hasString(value, "sessionId") && hasString(value, "sessionEpoch")

const isRequestedInputAnswer = (value: unknown): value is RequestedInputAnswer =>
    isRecord(value) && hasString(value, "questionId") && hasString(value, "value")

export const isCockpitProjectionEvent = (value: unknown): value is CockpitProjectionEvent => {
    if (!isRecord(value) || typeof value.kind !== "string") {
        return false
    }

    switch (value.kind) {
        case "session_hello":
            return isEveryCodeSession(value.session)
        case "session_status_changed":
            return (
                hasString(value, "sessionId") &&
                hasString(value, "sessionEpoch") &&
                hasEnum(value, "status", sessionStatusValues) &&
                hasOptionalString(value, "summary") &&
                hasString(value, "updatedAt")
            )
        case "turn_started":
            return hasString(value, "sessionEpoch") && isSessionTurn(value.turn)
        case "turn_step_added":
            return (
                hasString(value, "sessionId") &&
                hasString(value, "sessionEpoch") &&
                hasString(value, "turnId") &&
                isTurnStep(value.step)
            )
        case "turn_status_changed":
            return (
                hasString(value, "sessionId") &&
                hasString(value, "sessionEpoch") &&
                hasString(value, "turnId") &&
                hasEnum(value, "status", turnStatusValues) &&
                hasOptionalString(value, "summary") &&
                hasOptionalNullableString(value, "completedAt")
            )
        case "approval_requested":
            return isPendingApproval(value.approval)
        case "approval_resolved":
            return (
                hasString(value, "sessionId") &&
                hasString(value, "sessionEpoch") &&
                hasString(value, "approvalId") &&
                hasEnum(value, "decision", approvalDecisionValues) &&
                hasString(value, "resolvedAt")
            )
        case "user_input_requested":
            return isRequestedInput(value.input)
        case "user_input_resolved":
            return (
                hasString(value, "sessionId") &&
                hasString(value, "sessionEpoch") &&
                hasString(value, "inputId") &&
                hasString(value, "resolvedAt")
            )
        case "command_outcome":
            return isCommandOutcome(value.outcome)
        default:
            return false
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const isEveryCodeSession = (value: unknown): value is EveryCodeSession =>
    isRecord(value) &&
    hasString(value, "sessionId") &&
    hasString(value, "sessionEpoch") &&
    hasOptionalString(value, "hostId") &&
    hasString(value, "hostLabel") &&
    hasString(value, "cwd") &&
    hasNullableString(value, "branch") &&
    hasNumber(value, "pid") &&
    hasString(value, "model") &&
    hasEnum(value, "status", sessionStatusValues) &&
    hasString(value, "summary") &&
    hasString(value, "startedAt") &&
    hasString(value, "updatedAt") &&
    hasNullableString(value, "currentTurnId")

const isSessionTurn = (value: unknown): value is SessionTurn =>
    isRecord(value) &&
    hasString(value, "id") &&
    hasString(value, "sessionId") &&
    hasString(value, "title") &&
    hasEnum(value, "status", turnStatusValues) &&
    hasEnum(value, "actor", turnActorValues) &&
    hasString(value, "startedAt") &&
    hasNullableString(value, "completedAt") &&
    hasString(value, "summary") &&
    Array.isArray(value.steps) &&
    value.steps.every(isTurnStep)

const isTurnStep = (value: unknown): value is TurnStep =>
    isRecord(value) &&
    hasString(value, "id") &&
    hasEnum(value, "kind", turnStepKindValues) &&
    hasString(value, "title") &&
    hasString(value, "detail") &&
    hasString(value, "timestamp") &&
    hasEnum(value, "state", turnStepStateValues)

const isPendingApproval = (value: unknown): value is PendingApproval =>
    isRecord(value) &&
    hasString(value, "id") &&
    hasString(value, "sessionId") &&
    hasString(value, "sessionEpoch") &&
    hasString(value, "turnId") &&
    hasString(value, "title") &&
    hasString(value, "body") &&
    hasString(value, "command") &&
    hasString(value, "cwd") &&
    hasEnum(value, "risk", approvalRiskValues) &&
    hasString(value, "requestedAt")

const isRequestedInput = (value: unknown): value is RequestedInput =>
    isRecord(value) &&
    hasString(value, "id") &&
    hasString(value, "sessionId") &&
    hasString(value, "sessionEpoch") &&
    hasString(value, "turnId") &&
    hasString(value, "title") &&
    hasString(value, "requestedAt") &&
    Array.isArray(value.questions) &&
    value.questions.every(isRequestedInputQuestion)

const isCommandOutcome = (value: unknown): value is CommandOutcome =>
    isRecord(value) &&
    hasString(value, "commandId") &&
    hasString(value, "sessionId") &&
    hasString(value, "sessionEpoch") &&
    hasEnum(value, "commandKind", sessionCommandKindValues) &&
    hasEnum(value, "status", commandOutcomeStatusValues) &&
    hasNullableString(value, "reason") &&
    hasString(value, "handledAt")

const isRequestedInputQuestion = (value: unknown): value is RequestedInputQuestion =>
    isRecord(value) &&
    hasString(value, "id") &&
    hasString(value, "label") &&
    hasString(value, "prompt") &&
    hasBoolean(value, "required") &&
    Array.isArray(value.options) &&
    value.options.every(isRequestedInputOption)

const isRequestedInputOption = (value: unknown): value is RequestedInputOption =>
    isRecord(value) &&
    hasString(value, "label") &&
    hasString(value, "value") &&
    (value.description === undefined || typeof value.description === "string")

const hasString = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === "string"

const hasOptionalString = (value: Record<string, unknown>, key: string): boolean =>
    value[key] === undefined || typeof value[key] === "string"

const hasEnum = (value: Record<string, unknown>, key: string, allowedValues: readonly string[]): boolean => {
    const candidate = value[key]
    return typeof candidate === "string" && allowedValues.includes(candidate)
}

const hasNullableString = (value: Record<string, unknown>, key: string): boolean =>
    typeof value[key] === "string" || value[key] === null

const hasOptionalNullableString = (value: Record<string, unknown>, key: string): boolean =>
    value[key] === undefined || typeof value[key] === "string" || value[key] === null

const hasNumber = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === "number"

const hasBoolean = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === "boolean"

const writeMethodNotAllowed = (response: ServerResponse, allow: string): void => {
    response.setHeader("allow", allow)
    writeJson(response, 405, { error: "Method not allowed" })
}

const setCorsHeaders = (response: ServerResponse): void => {
    response.setHeader("access-control-allow-origin", "*")
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS")
    response.setHeader("access-control-allow-headers", "authorization, content-type, accept, x-code-everywhere-token")
}

const writeJson = (response: ServerResponse, statusCode: number, payload: JsonResponse): void => {
    response.statusCode = statusCode
    response.setHeader("content-type", "application/json; charset=utf-8")
    response.end(`${JSON.stringify(payload)}\n`)
}
