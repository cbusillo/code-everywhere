import { useEffect, useMemo, useState } from "react"

import type {
    CommandOutcome,
    CockpitNotification,
    CockpitProjectionState,
    PendingApproval,
    ProjectedCockpitSession,
    RequestedInput,
    RequestedInputQuestion,
    SessionStatus,
    SessionTurn,
    StaleCockpitEvent,
    TurnStatus,
    TurnStep,
} from "@code-everywhere/contracts"
import type { CockpitCommandRecord, CockpitCommandSnapshot, CockpitIngestionSnapshot } from "@code-everywhere/server"

import { fetchCockpitCommands } from "./cockpitCommands"
import { cockpitFixture, createCockpitFixtureFromSnapshot, type CockpitFixture } from "./cockpitData"

export type CockpitTransportMode = "fixture" | "connecting" | "live" | "fallback"

export type CockpitTransportStatus = {
    mode: CockpitTransportMode
    url: string | null
    updatedAt: string | null
    error: string | null
}

export type CockpitViewState = {
    fixture: CockpitFixture
    transport: CockpitTransportStatus
}

export type CockpitPollScheduler = {
    run: (loadSnapshot: () => Promise<void>, pollIntervalMs: number) => void
    stop: () => void
}

type UseCockpitViewOptions = {
    transportUrl?: string
    pollIntervalMs?: number
    fetchSnapshot?: (transportUrl: string) => Promise<CockpitIngestionSnapshot>
    fetchCommands?: (transportUrl: string) => Promise<CockpitCommandSnapshot>
    now?: () => Date
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const defaultPollIntervalMs = 3_000
const configuredTransportUrl = (() => {
    const transportUrl: unknown = import.meta.env.VITE_COCKPIT_HTTP_URL
    return typeof transportUrl === "string" ? normalizeTransportUrl(transportUrl) : null
})()

export const useCockpitView = (options: UseCockpitViewOptions = {}): CockpitViewState => {
    const transportUrl = normalizeTransportUrl(options.transportUrl) ?? configuredTransportUrl
    const pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs
    const fetchSnapshot = options.fetchSnapshot ?? fetchCockpitSnapshot
    const fetchCommands = options.fetchCommands ?? fetchCockpitCommands
    const now = options.now

    const initialState = useMemo<CockpitViewState>(
        () => ({
            fixture: cockpitFixture,
            transport: {
                mode: transportUrl === null ? "fixture" : "connecting",
                url: transportUrl,
                updatedAt: transportUrl === null ? cockpitFixture.generatedAt : null,
                error: null,
            },
        }),
        [transportUrl],
    )

    const [state, setState] = useState<CockpitViewState>(initialState)

    useEffect(() => {
        setState(initialState)
    }, [initialState])

    useEffect(() => {
        if (transportUrl === null) {
            return undefined
        }

        const scheduler = createCockpitPollScheduler()
        let isActive = true
        let commandRequestId = 0

        const loadSnapshot = async () => {
            try {
                const snapshot = await fetchSnapshot(transportUrl)
                if (!isActive) {
                    return
                }

                const loadedAt = getNow(now)

                setState((current) => ({
                    fixture: createCockpitFixtureFromSnapshot(snapshot, {
                        generatedAt: loadedAt,
                        commands: current.transport.url === transportUrl ? current.fixture.commands : [],
                    }),
                    transport: {
                        mode: "live",
                        url: transportUrl,
                        updatedAt: loadedAt,
                        error: null,
                    },
                }))

                const requestId = (commandRequestId += 1)
                void fetchCommands(transportUrl)
                    .then((commands) => {
                        if (!isActive || requestId !== commandRequestId) {
                            return
                        }

                        setState((current) => {
                            if (current.transport.url !== transportUrl || current.transport.mode !== "live") {
                                return current
                            }

                            return {
                                ...current,
                                fixture: {
                                    ...current.fixture,
                                    commands: sortCommandRecords(commands.commands),
                                },
                            }
                        })
                    })
                    .catch(() => undefined)
            } catch (error) {
                if (!isActive) {
                    return
                }

                const failedAt = getNow(now)
                setState((current) => ({
                    fixture: current.transport.mode === "live" ? current.fixture : cockpitFixture,
                    transport: {
                        mode: "fallback",
                        url: transportUrl,
                        updatedAt: current.transport.updatedAt ?? failedAt,
                        error: getErrorMessage(error),
                    },
                }))
            }
        }

        scheduler.run(loadSnapshot, pollIntervalMs)

        return () => {
            isActive = false
            scheduler.stop()
        }
    }, [fetchCommands, fetchSnapshot, now, pollIntervalMs, transportUrl])

    return state
}

export const createCockpitPollScheduler = (): CockpitPollScheduler => {
    let stopped = false
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null

    return {
        run: (loadSnapshot, pollIntervalMs) => {
            const poll = () => {
                void loadSnapshot().finally(() => {
                    if (stopped) {
                        return
                    }

                    timeoutId = globalThis.setTimeout(poll, pollIntervalMs)
                })
            }

            poll()
        },
        stop: () => {
            stopped = true
            if (timeoutId !== null) {
                globalThis.clearTimeout(timeoutId)
            }
        },
    }
}

export const fetchCockpitSnapshot = async (
    transportUrl: string,
    fetchImpl: FetchLike = globalThis.fetch,
): Promise<CockpitIngestionSnapshot> => {
    const snapshotUrl = createSnapshotUrl(transportUrl)
    const response = await fetchImpl(snapshotUrl, {
        cache: "no-store",
        headers: {
            accept: "application/json",
        },
    })

    if (!response.ok) {
        throw new Error(`Cockpit snapshot request failed with ${String(response.status)}`)
    }

    const body = (await response.json()) as unknown
    const snapshot = normalizeCockpitIngestionSnapshot(body)
    if (snapshot === null) {
        throw new Error("Cockpit snapshot response did not match the expected shape")
    }

    return snapshot
}

export const createSnapshotUrl = (transportUrl: string): string => `${transportUrl.replace(/\/+$/, "")}/snapshot`

export function normalizeTransportUrl(transportUrl: string | undefined): string | null {
    const normalized = transportUrl?.trim()
    return normalized === undefined || normalized === "" ? null : normalized
}

export const describeTransportStatus = (status: CockpitTransportStatus): string => {
    switch (status.mode) {
        case "fixture":
            return "Fake data"
        case "connecting":
            return "Connecting"
        case "live":
            return "Live HTTP"
        case "fallback":
            return "HTTP fallback"
    }
}

const normalizeCockpitIngestionSnapshot = (value: unknown): CockpitIngestionSnapshot | null => {
    if (!isRecord(value) || typeof value.eventCount !== "number") {
        return null
    }

    const state = normalizeCockpitProjectionState(value.state)
    if (state === null || !isArrayOf(value.sessions, isProjectedCockpitSession) || !isArrayOf(value.attentionSessionIds, isString)) {
        return null
    }

    return {
        eventCount: value.eventCount,
        state,
        sessions: value.sessions,
        attentionSessionIds: value.attentionSessionIds,
    }
}

const normalizeCockpitProjectionState = (value: unknown): CockpitProjectionState | null => {
    if (
        !isRecord(value) ||
        !isRecordOf(value.sessions, isProjectedCockpitSession) ||
        !isRecordOf(value.turns, isSessionTurn) ||
        !isRecordOf(value.pendingApprovals, isPendingApproval) ||
        !isRecordOf(value.requestedInputs, isRequestedInput) ||
        !isArrayOf(value.notifications, isCockpitNotification) ||
        !isArrayOf(value.staleEvents, isStaleCockpitEvent)
    ) {
        return null
    }

    if (value.commandOutcomes !== undefined && !isRecordOf(value.commandOutcomes, isCommandOutcome)) {
        return null
    }

    return {
        sessions: value.sessions,
        turns: value.turns,
        pendingApprovals: value.pendingApprovals,
        requestedInputs: value.requestedInputs,
        commandOutcomes: value.commandOutcomes ?? {},
        notifications: value.notifications,
        staleEvents: value.staleEvents,
    }
}

const isProjectedCockpitSession = (value: unknown): value is ProjectedCockpitSession =>
    isRecord(value) &&
    isString(value.sessionId) &&
    isString(value.sessionEpoch) &&
    isString(value.hostLabel) &&
    isString(value.cwd) &&
    isNullableString(value.branch) &&
    typeof value.pid === "number" &&
    isString(value.model) &&
    isSessionStatus(value.status) &&
    isString(value.summary) &&
    isString(value.startedAt) &&
    isString(value.updatedAt) &&
    isNullableString(value.currentTurnId) &&
    isAttention(value.attention) &&
    isArrayOf(value.pendingApprovalIds, isString) &&
    isArrayOf(value.pendingInputIds, isString) &&
    isArrayOf(value.turnIds, isString)

const isSessionTurn = (value: unknown): value is SessionTurn =>
    isRecord(value) &&
    isString(value.id) &&
    isString(value.sessionId) &&
    isString(value.title) &&
    isTurnStatus(value.status) &&
    isTurnActor(value.actor) &&
    isString(value.startedAt) &&
    isNullableString(value.completedAt) &&
    isString(value.summary) &&
    isArrayOf(value.steps, isTurnStep)

const isTurnStep = (value: unknown): value is TurnStep =>
    isRecord(value) &&
    isString(value.id) &&
    isTurnStepKind(value.kind) &&
    isString(value.title) &&
    isString(value.detail) &&
    isString(value.timestamp) &&
    isTurnStepState(value.state)

const isPendingApproval = (value: unknown): value is PendingApproval =>
    isRecord(value) &&
    isString(value.id) &&
    isString(value.sessionId) &&
    isString(value.sessionEpoch) &&
    isString(value.turnId) &&
    isString(value.title) &&
    isString(value.body) &&
    isString(value.command) &&
    isString(value.cwd) &&
    isApprovalRisk(value.risk) &&
    isString(value.requestedAt)

const isRequestedInput = (value: unknown): value is RequestedInput =>
    isRecord(value) &&
    isString(value.id) &&
    isString(value.sessionId) &&
    isString(value.sessionEpoch) &&
    isString(value.turnId) &&
    isString(value.title) &&
    isString(value.requestedAt) &&
    isArrayOf(value.questions, isRequestedInputQuestion)

const isCommandOutcome = (value: unknown): value is CommandOutcome =>
    isRecord(value) &&
    isString(value.commandId) &&
    isString(value.sessionId) &&
    isString(value.sessionEpoch) &&
    isSessionCommandKind(value.commandKind) &&
    isCommandOutcomeStatus(value.status) &&
    isNullableString(value.reason) &&
    isString(value.handledAt)

const isRequestedInputQuestion = (value: unknown): value is RequestedInputQuestion =>
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isString(value.prompt) &&
    typeof value.required === "boolean" &&
    isArrayOf(value.options, isRequestedInputOption)

const isRequestedInputOption = (value: unknown): value is RequestedInputQuestion["options"][number] =>
    isRecord(value) &&
    isString(value.label) &&
    isString(value.value) &&
    (value.description === undefined || isString(value.description))

const isCockpitNotification = (value: unknown): value is CockpitNotification =>
    isRecord(value) &&
    isString(value.id) &&
    isString(value.sessionId) &&
    isString(value.sessionEpoch) &&
    isNotificationKind(value.kind) &&
    isString(value.title) &&
    isString(value.createdAt) &&
    (value.pendingItemId === undefined || isString(value.pendingItemId))

const isStaleCockpitEvent = (value: unknown): value is StaleCockpitEvent =>
    isRecord(value) &&
    isProjectionEventKind(value.eventKind) &&
    isString(value.sessionId) &&
    isString(value.eventEpoch) &&
    isNullableString(value.currentEpoch) &&
    isString(value.receivedAt)

const isRecordOf = <Value>(value: unknown, guard: (entry: unknown) => entry is Value): value is Record<string, Value> =>
    isRecord(value) && Object.values(value).every(guard)

const sortCommandRecords = (commands: CockpitCommandRecord[]): CockpitCommandRecord[] =>
    [...commands].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))

const isArrayOf = <Value>(value: unknown, guard: (entry: unknown) => entry is Value): value is Value[] =>
    Array.isArray(value) && value.every(guard)

const isString = (value: unknown): value is string => typeof value === "string"

const isNullableString = (value: unknown): value is string | null => isString(value) || value === null

const isSessionStatus = (value: unknown): value is SessionStatus =>
    isOneOf(value, ["running", "idle", "blocked", "waiting-for-input", "waiting-for-approval", "ended", "error"])

const isTurnStatus = (value: unknown): value is TurnStatus =>
    isOneOf(value, ["running", "completed", "blocked", "waiting-for-input", "waiting-for-approval", "error"])

const isAttention = (value: unknown): value is ProjectedCockpitSession["attention"] =>
    isOneOf(value, ["none", "approval", "input", "blocked", "error"])

const isTurnActor = (value: unknown): value is SessionTurn["actor"] => isOneOf(value, ["operator", "assistant", "system"])

const isTurnStepKind = (value: unknown): value is TurnStep["kind"] =>
    isOneOf(value, ["message", "tool", "status", "diff", "artifact", "error"])

const isTurnStepState = (value: unknown): value is TurnStep["state"] =>
    isOneOf(value, ["pending", "running", "completed", "blocked", "error"])

const isApprovalRisk = (value: unknown): value is PendingApproval["risk"] => isOneOf(value, ["low", "medium", "high"])

const isSessionCommandKind = (value: unknown): value is CommandOutcome["commandKind"] =>
    isOneOf(value, [
        "reply",
        "continue_autonomously",
        "pause_current_turn",
        "end_session",
        "status_request",
        "approval_decision",
        "request_user_input_response",
    ])

const isCommandOutcomeStatus = (value: unknown): value is CommandOutcome["status"] => isOneOf(value, ["accepted", "rejected"])

const isNotificationKind = (value: unknown): value is CockpitNotification["kind"] =>
    isOneOf(value, ["approval", "input", "blocked", "error", "ended", "stale-event"])

const isProjectionEventKind = (value: unknown): value is StaleCockpitEvent["eventKind"] =>
    isOneOf(value, [
        "session_hello",
        "session_status_changed",
        "turn_started",
        "turn_step_added",
        "turn_status_changed",
        "approval_requested",
        "approval_resolved",
        "user_input_requested",
        "user_input_resolved",
        "command_outcome",
    ])

const isOneOf = <Value extends string>(value: unknown, values: readonly Value[]): value is Value =>
    isString(value) && values.includes(value as Value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const getNow = (now: (() => Date) | undefined): string => (now?.() ?? new Date()).toISOString()

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unable to load cockpit snapshot")
