import { useEffect, useMemo, useState } from "react"

import type { CockpitIngestionSnapshot } from "@code-everywhere/server"

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

export type CockpitPollRequestTracker = {
    startRequest: () => number
    isCurrentRequest: (requestId: number) => boolean
}

type UseCockpitViewOptions = {
    transportUrl?: string
    pollIntervalMs?: number
    fetchSnapshot?: (transportUrl: string) => Promise<CockpitIngestionSnapshot>
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

        let cancelled = false
        const requestTracker = createCockpitPollRequestTracker()

        const loadSnapshot = async () => {
            const requestId = requestTracker.startRequest()

            try {
                const snapshot = await fetchSnapshot(transportUrl)
                const loadedAt = getNow(now)
                if (cancelled || !requestTracker.isCurrentRequest(requestId)) {
                    return
                }

                setState({
                    fixture: createCockpitFixtureFromSnapshot(snapshot, { generatedAt: loadedAt }),
                    transport: {
                        mode: "live",
                        url: transportUrl,
                        updatedAt: loadedAt,
                        error: null,
                    },
                })
            } catch (error) {
                if (cancelled || !requestTracker.isCurrentRequest(requestId)) {
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

        void loadSnapshot()
        const intervalId = window.setInterval(() => void loadSnapshot(), pollIntervalMs)

        return () => {
            cancelled = true
            window.clearInterval(intervalId)
        }
    }, [fetchSnapshot, now, pollIntervalMs, transportUrl])

    return state
}

export const createCockpitPollRequestTracker = (): CockpitPollRequestTracker => {
    let latestRequestId = 0

    return {
        startRequest: () => {
            latestRequestId += 1
            return latestRequestId
        },
        isCurrentRequest: (requestId) => requestId === latestRequestId,
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
    if (!isCockpitIngestionSnapshot(body)) {
        throw new Error("Cockpit snapshot response did not match the expected shape")
    }

    return body
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

const isCockpitIngestionSnapshot = (value: unknown): value is CockpitIngestionSnapshot =>
    isRecord(value) &&
    typeof value.eventCount === "number" &&
    isRecord(value.state) &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.attentionSessionIds)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const getNow = (now: (() => Date) | undefined): string => (now?.() ?? new Date()).toISOString()

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unable to load cockpit snapshot")
