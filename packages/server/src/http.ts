import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

import type {
    CockpitProjectionEvent,
    EveryCodeSession,
    PendingApproval,
    RequestedInput,
    RequestedInputOption,
    RequestedInputQuestion,
    SessionTurn,
    TurnStep,
} from "@code-everywhere/contracts"

import { createCockpitEventStore, type CockpitEventStore, type CockpitIngestionSnapshot } from "./index"

export type CockpitHttpHandlerOptions = {
    store?: CockpitEventStore
    maxBodyBytes?: number
}

export type CockpitHttpServerOptions = CockpitHttpHandlerOptions

type JsonResponse = CockpitIngestionSnapshot | { error: string }

const defaultMaxBodyBytes = 1024 * 1024

export const createCockpitHttpHandler = (options: CockpitHttpHandlerOptions = {}) => {
    const store = options.store ?? createCockpitEventStore()
    const maxBodyBytes = options.maxBodyBytes ?? defaultMaxBodyBytes

    return (request: IncomingMessage, response: ServerResponse): void => {
        void routeRequest(request, response, store, maxBodyBytes).catch((error: unknown) => {
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
    maxBodyBytes: number,
): Promise<void> => {
    setCorsHeaders(response)

    if (request.method === "OPTIONS") {
        response.statusCode = 204
        response.end()
        return
    }

    const url = parseRequestUrl(request)

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

const isCockpitProjectionEvent = (value: unknown): value is CockpitProjectionEvent => {
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
                hasString(value, "status") &&
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
                hasString(value, "status")
            )
        case "approval_requested":
            return isPendingApproval(value.approval)
        case "approval_resolved":
            return (
                hasString(value, "sessionId") &&
                hasString(value, "sessionEpoch") &&
                hasString(value, "approvalId") &&
                hasString(value, "decision") &&
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
    hasString(value, "hostLabel") &&
    hasString(value, "cwd") &&
    hasNullableString(value, "branch") &&
    hasNumber(value, "pid") &&
    hasString(value, "model") &&
    hasString(value, "status") &&
    hasString(value, "summary") &&
    hasString(value, "startedAt") &&
    hasString(value, "updatedAt") &&
    hasNullableString(value, "currentTurnId")

const isSessionTurn = (value: unknown): value is SessionTurn =>
    isRecord(value) &&
    hasString(value, "id") &&
    hasString(value, "sessionId") &&
    hasString(value, "title") &&
    hasString(value, "status") &&
    hasString(value, "actor") &&
    hasString(value, "startedAt") &&
    hasNullableString(value, "completedAt") &&
    hasString(value, "summary") &&
    Array.isArray(value.steps) &&
    value.steps.every(isTurnStep)

const isTurnStep = (value: unknown): value is TurnStep =>
    isRecord(value) &&
    hasString(value, "id") &&
    hasString(value, "kind") &&
    hasString(value, "title") &&
    hasString(value, "detail") &&
    hasString(value, "timestamp") &&
    hasString(value, "state")

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
    hasString(value, "risk") &&
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

const hasNullableString = (value: Record<string, unknown>, key: string): boolean =>
    typeof value[key] === "string" || value[key] === null

const hasNumber = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === "number"

const hasBoolean = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === "boolean"

const writeMethodNotAllowed = (response: ServerResponse, allow: string): void => {
    response.setHeader("allow", allow)
    writeJson(response, 405, { error: "Method not allowed" })
}

const setCorsHeaders = (response: ServerResponse): void => {
    response.setHeader("access-control-allow-origin", "*")
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS")
    response.setHeader("access-control-allow-headers", "content-type, accept")
}

const writeJson = (response: ServerResponse, statusCode: number, payload: JsonResponse): void => {
    response.statusCode = statusCode
    response.setHeader("content-type", "application/json; charset=utf-8")
    response.end(`${JSON.stringify(payload)}\n`)
}
