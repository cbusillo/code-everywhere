import { request, type RequestOptions } from "node:http"
import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { EveryCodeSession, PendingApproval, ProjectedCockpitSession } from "@code-everywhere/contracts"

import { createCockpitEventStore, type CockpitIngestionSnapshot } from "./index"
import { createCockpitHttpServer } from "./http"

const baseSession: EveryCodeSession = {
    sessionId: "session-1",
    sessionEpoch: "epoch-1",
    hostLabel: "workhorse-mac",
    cwd: "~/code/code-everywhere",
    branch: "main",
    pid: 1234,
    model: "code-gpt-5.4",
    status: "idle",
    summary: "Waiting for work",
    startedAt: "2026-04-27T16:00:00.000Z",
    updatedAt: "2026-04-27T16:00:00.000Z",
    currentTurnId: null,
}

const baseApproval: PendingApproval = {
    id: "approval-1",
    sessionId: "session-1",
    sessionEpoch: "epoch-1",
    turnId: "turn-1",
    title: "Approve dependency install",
    body: "Install dependencies for validation.",
    command: "pnpm install",
    cwd: "~/code/code-everywhere",
    risk: "medium",
    requestedAt: "2026-04-27T16:04:00.000Z",
}

describe("cockpit HTTP transport", () => {
    const store = createCockpitEventStore()
    const server = createCockpitHttpServer({ store })
    let baseUrl = ""

    beforeEach(async () => {
        store.reset()
        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", resolve)
        })
        const address = server.address() as AddressInfo
        baseUrl = `http://127.0.0.1:${String(address.port)}`
    })

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error !== undefined) {
                    reject(error)
                    return
                }

                resolve()
            })
        })
    })

    it("returns the current snapshot", async () => {
        const response = await sendJson(baseUrl, "GET", "/snapshot")

        expect(response.statusCode).toBe(200)
        expect(response.headers["access-control-allow-origin"]).toBe("*")
        const body = response.body as CockpitIngestionSnapshot

        expect(body).toMatchObject({
            eventCount: 0,
            sessions: [],
            attentionSessionIds: [],
        })
    })

    it("ingests a single event and event array", async () => {
        const helloResponse = await sendJson(baseUrl, "POST", "/events", {
            event: {
                kind: "session_hello",
                session: baseSession,
            },
        })
        const approvalResponse = await sendJson(baseUrl, "POST", "/events", [
            {
                kind: "approval_requested",
                approval: baseApproval,
            },
        ])

        expect(helloResponse.statusCode).toBe(200)
        expect(approvalResponse.statusCode).toBe(200)
        const body = approvalResponse.body as CockpitIngestionSnapshot

        expect(body).toMatchObject({
            eventCount: 2,
            attentionSessionIds: ["session-1"],
        })
        expect(body.state.pendingApprovals["approval-1"]).toEqual(baseApproval)
    })

    it("resets with optional seed events", async () => {
        await sendJson(baseUrl, "POST", "/events", {
            event: {
                kind: "session_hello",
                session: baseSession,
            },
        })

        const response = await sendJson(baseUrl, "POST", "/reset", {
            events: [
                {
                    kind: "session_hello",
                    session: {
                        ...baseSession,
                        sessionId: "session-2",
                    },
                },
            ],
        })

        expect(response.statusCode).toBe(200)
        const body = response.body as CockpitIngestionSnapshot

        expect(body.eventCount).toBe(1)
        expect(body.sessions.map((session: ProjectedCockpitSession) => session.sessionId)).toEqual(["session-2"])
    })

    it("preserves stale epoch evidence through HTTP serialization", async () => {
        await sendJson(baseUrl, "POST", "/events", {
            events: [
                {
                    kind: "session_hello",
                    session: baseSession,
                },
                {
                    kind: "session_hello",
                    session: {
                        ...baseSession,
                        sessionEpoch: "epoch-2",
                        updatedAt: "2026-04-27T16:10:00.000Z",
                    },
                },
            ],
        })

        const response = await sendJson(baseUrl, "POST", "/events", {
            event: {
                kind: "approval_requested",
                approval: baseApproval,
            },
        })

        expect(response.statusCode).toBe(200)
        const body = response.body as CockpitIngestionSnapshot

        expect(body.state.pendingApprovals).toEqual({})
        expect(body.state.staleEvents).toEqual([
            {
                eventKind: "approval_requested",
                sessionId: "session-1",
                eventEpoch: "epoch-1",
                currentEpoch: "epoch-2",
                receivedAt: "2026-04-27T16:04:00.000Z",
            },
        ])
    })

    it("returns JSON errors for unsupported requests", async () => {
        await expect(sendJson(baseUrl, "POST", "/events", { nope: true })).resolves.toMatchObject({
            statusCode: 400,
            body: { error: "Expected one or more cockpit projection events" },
        })
        await expect(
            sendJson(baseUrl, "POST", "/events", {
                event: {
                    kind: "session_hello",
                    session: {},
                },
            }),
        ).resolves.toMatchObject({
            statusCode: 400,
            body: { error: "Expected one or more cockpit projection events" },
        })
        await expect(sendRaw(baseUrl, "POST", "/events", "{")).resolves.toMatchObject({
            statusCode: 400,
            body: { error: "Request body must be valid JSON" },
        })
        await expect(sendJson(baseUrl, "GET", "/nope")).resolves.toMatchObject({
            statusCode: 404,
            body: { error: "Not found" },
        })
        await expect(sendJson(baseUrl, "GET", "/events")).resolves.toMatchObject({
            statusCode: 405,
            body: { error: "Method not allowed" },
        })
        await expect(sendJson(baseUrl, "OPTIONS", "/snapshot")).resolves.toMatchObject({
            statusCode: 204,
            body: null,
        })
    })

    it("rejects non-contract enum values", async () => {
        const invalidEvents = [
            {
                kind: "session_hello",
                session: {
                    ...baseSession,
                    status: "almost-running",
                },
            },
            {
                kind: "turn_started",
                sessionEpoch: "epoch-1",
                turn: {
                    id: "turn-1",
                    sessionId: "session-1",
                    title: "Invalid turn",
                    status: "paused-ish",
                    actor: "assistant",
                    startedAt: "2026-04-27T16:01:00.000Z",
                    completedAt: null,
                    summary: "Should be rejected.",
                    steps: [],
                },
            },
            {
                kind: "turn_step_added",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                step: {
                    id: "step-1",
                    kind: "note",
                    title: "Invalid step",
                    detail: "Should be rejected.",
                    timestamp: "2026-04-27T16:01:00.000Z",
                    state: "completed",
                },
            },
            {
                kind: "approval_requested",
                approval: {
                    ...baseApproval,
                    risk: "extreme",
                },
            },
            {
                kind: "approval_resolved",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                approvalId: "approval-1",
                decision: "maybe",
                resolvedAt: "2026-04-27T16:05:00.000Z",
            },
        ]

        for (const event of invalidEvents) {
            await expect(sendJson(baseUrl, "POST", "/events", { event })).resolves.toMatchObject({
                statusCode: 400,
                body: { error: "Expected one or more cockpit projection events" },
            })
        }
        expect((await sendJson(baseUrl, "GET", "/snapshot")).body).toMatchObject({ eventCount: 0 })
    })
})

type TestResponse = {
    statusCode: number
    headers: Record<string, string | string[] | undefined>
    body: unknown
}

const sendJson = (baseUrl: string, method: string, path: string, body?: unknown): Promise<TestResponse> =>
    sendRaw(baseUrl, method, path, body === undefined ? undefined : JSON.stringify(body))

const sendRaw = (baseUrl: string, method: string, path: string, body?: string): Promise<TestResponse> => {
    const url = new URL(path, baseUrl)
    const options: RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
            "content-type": "application/json",
        },
    }

    return new Promise((resolve, reject) => {
        const clientRequest = request(options, (response) => {
            const chunks: Buffer[] = []

            response.on("data", (chunk: Buffer) => chunks.push(chunk))
            response.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8")
                resolve({
                    statusCode: response.statusCode ?? 0,
                    headers: response.headers,
                    body: text === "" ? null : (JSON.parse(text) as unknown),
                })
            })
        })

        clientRequest.on("error", reject)

        if (body !== undefined) {
            clientRequest.write(body)
        }

        clientRequest.end()
    })
}
