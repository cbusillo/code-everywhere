import { request, type RequestOptions } from "node:http"
import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { EveryCodeSession, PendingApproval, ProjectedCockpitSession, SessionCommand } from "@code-everywhere/contracts"

import {
    createCockpitCommandStore,
    createCockpitEventStore,
    type CockpitCommandSnapshot,
    type CockpitIngestionSnapshot,
} from "./index"
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
    const commandStore = createCockpitCommandStore([], {
        now: () => new Date("2026-04-27T16:20:00.000Z"),
        createId: (index) => `test-command-${String(index)}`,
    })
    const server = createCockpitHttpServer({ store, commandStore })
    let baseUrl = ""

    beforeEach(async () => {
        store.reset()
        commandStore.reset()
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

    it("ingests command outcome events", async () => {
        await sendJson(baseUrl, "POST", "/events", {
            event: {
                kind: "session_hello",
                session: baseSession,
            },
        })

        const response = await sendJson(baseUrl, "POST", "/events", {
            event: {
                kind: "command_outcome",
                outcome: {
                    commandId: "test-command-1",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    commandKind: "status_request",
                    status: "accepted",
                    reason: null,
                    handledAt: "2026-04-27T16:21:00.000Z",
                },
            },
        })

        expect(response.statusCode).toBe(200)
        const body = response.body as CockpitIngestionSnapshot
        expect(body.state.commandOutcomes["test-command-1"]).toMatchObject({
            commandKind: "status_request",
            status: "accepted",
        })
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
            {
                kind: "session_status_changed",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                status: "running",
                summary: 42,
                updatedAt: "2026-04-27T16:06:00.000Z",
            },
            {
                kind: "turn_status_changed",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                status: "completed",
                completedAt: 42,
            },
            {
                kind: "command_outcome",
                outcome: {
                    commandId: "test-command-1",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    commandKind: "teleport",
                    status: "accepted",
                    reason: null,
                    handledAt: "2026-04-27T16:21:00.000Z",
                },
            },
            {
                kind: "command_outcome",
                outcome: {
                    commandId: "test-command-2",
                    sessionId: "session-1",
                    sessionEpoch: "epoch-1",
                    commandKind: "status_request",
                    status: "queued-ish",
                    reason: null,
                    handledAt: "2026-04-27T16:21:00.000Z",
                },
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

    it("enqueues and reads session commands", async () => {
        const command: SessionCommand = {
            kind: "approval_decision",
            sessionId: "session-1",
            sessionEpoch: "epoch-1",
            approvalId: "approval-1",
            decision: "approve",
        }

        const emptyResponse = await sendJson(baseUrl, "GET", "/commands")
        expect(emptyResponse.statusCode).toBe(200)
        expect(emptyResponse.body).toEqual({ commandCount: 0, commands: [] })

        const postResponse = await sendJson(baseUrl, "POST", "/commands", { command })
        expect(postResponse.statusCode).toBe(200)
        expect(postResponse.body).toEqual({
            commandCount: 1,
            commands: [
                {
                    id: "test-command-1",
                    receivedAt: "2026-04-27T16:20:00.000Z",
                    deliveredAt: null,
                    command,
                },
            ],
        })

        const readResponse = await sendJson(baseUrl, "GET", "/commands")
        const body = readResponse.body as CockpitCommandSnapshot
        expect(body.commands.map((record) => record.command.kind)).toEqual(["approval_decision"])
    })

    it("claims undelivered commands for local consumers", async () => {
        const firstCommand: SessionCommand = {
            kind: "reply",
            sessionId: "session-1",
            sessionEpoch: "epoch-1",
            content: "Continue the current turn.",
        }
        const secondCommand: SessionCommand = {
            kind: "status_request",
            sessionId: "session-2",
            sessionEpoch: "epoch-1",
        }

        await sendJson(baseUrl, "POST", "/commands", { command: firstCommand })
        await sendJson(baseUrl, "POST", "/commands", { command: secondCommand })

        const filteredClaim = await sendJson(baseUrl, "POST", "/commands/claim", { sessionId: "session-1" })
        expect(filteredClaim.statusCode).toBe(200)
        expect(filteredClaim.body).toEqual({
            claimedAt: "2026-04-27T16:20:00.000Z",
            commandCount: 1,
            commands: [
                {
                    id: "test-command-1",
                    receivedAt: "2026-04-27T16:20:00.000Z",
                    deliveredAt: "2026-04-27T16:20:00.000Z",
                    command: firstCommand,
                },
            ],
        })

        const remainingClaim = await sendJson(baseUrl, "POST", "/commands/claim")
        expect(remainingClaim.body).toMatchObject({
            commandCount: 1,
            commands: [
                {
                    id: "test-command-2",
                    deliveredAt: "2026-04-27T16:20:00.000Z",
                    command: secondCommand,
                },
            ],
        })
        expect((await sendJson(baseUrl, "POST", "/commands/claim")).body).toMatchObject({ commandCount: 0, commands: [] })
        expect((await sendJson(baseUrl, "GET", "/commands")).body).toMatchObject({
            commandCount: 2,
            commands: [
                { id: "test-command-1", deliveredAt: "2026-04-27T16:20:00.000Z" },
                { id: "test-command-2", deliveredAt: "2026-04-27T16:20:00.000Z" },
            ],
        })
    })

    it("rejects invalid session commands", async () => {
        const invalidCommands = [
            { nope: true },
            {
                kind: "reply",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                content: 42,
            },
            {
                kind: "approval_decision",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                approvalId: "approval-1",
                decision: "expired",
            },
            {
                kind: "request_user_input_response",
                sessionId: "session-1",
                sessionEpoch: "epoch-1",
                turnId: "turn-1",
                answers: [{ questionId: "question-1", value: 7 }],
            },
        ]

        for (const command of invalidCommands) {
            await expect(sendJson(baseUrl, "POST", "/commands", { command })).resolves.toMatchObject({
                statusCode: 400,
                body: { error: "Expected one cockpit session command" },
            })
        }
        await expect(sendJson(baseUrl, "PATCH", "/commands", {})).resolves.toMatchObject({
            statusCode: 405,
            body: { error: "Method not allowed" },
        })
        await expect(sendJson(baseUrl, "GET", "/commands/claim")).resolves.toMatchObject({
            statusCode: 405,
            body: { error: "Method not allowed" },
        })
        await expect(sendJson(baseUrl, "POST", "/commands/claim", { sessionId: 42 })).resolves.toMatchObject({
            statusCode: 400,
            body: { error: "Expected command claim payload to be empty or contain a sessionId" },
        })
        expect((await sendJson(baseUrl, "GET", "/commands")).body).toEqual({ commandCount: 0, commands: [] })
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
