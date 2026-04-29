import { request } from "node:http"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, it } from "vitest"

import { CockpitServerCliError, cockpitServerUrl, parseCockpitServerArgs, startCockpitHttpServer } from "./cli"
import type { EveryCodeSession } from "@code-everywhere/contracts"

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

describe("cockpit HTTP server CLI", () => {
    it("parses defaults, env, and command-line overrides", () => {
        expect(parseCockpitServerArgs([], {})).toEqual({
            host: "127.0.0.1",
            port: 4789,
            dataFile: ".code-everywhere/cockpit-broker.json",
            authToken: null,
            help: false,
        })
        expect(
            parseCockpitServerArgs(
                ["--host", "0.0.0.0", "--port=4900", "--data-file", "/tmp/cockpit.json", "--auth-token", "arg-secret"],
                {
                    CODE_EVERYWHERE_HOST: "127.0.0.1",
                    CODE_EVERYWHERE_PORT: "nope",
                    CODE_EVERYWHERE_DATA_FILE: "/tmp/env-cockpit.json",
                    CODE_EVERYWHERE_AUTH_TOKEN: "env-secret",
                },
            ),
        ).toEqual({
            host: "0.0.0.0",
            port: 4900,
            dataFile: "/tmp/cockpit.json",
            authToken: "arg-secret",
            help: false,
        })
        expect(parseCockpitServerArgs([], { CODE_EVERYWHERE_AUTH_TOKEN: "env-secret" })).toMatchObject({
            authToken: "env-secret",
        })
        expect(parseCockpitServerArgs(["--auth-token", "-leading-hyphen-secret"], {})).toMatchObject({
            authToken: "-leading-hyphen-secret",
        })
        expect(parseCockpitServerArgs(["--memory"], {})).toMatchObject({ dataFile: null })
        expect(parseCockpitServerArgs(["--", "--help"], {})).toMatchObject({ help: true })
        expect(parseCockpitServerArgs(["--help"], { CODE_EVERYWHERE_PORT: "nope" })).toMatchObject({ help: true })
        expect(() => parseCockpitServerArgs([], { CODE_EVERYWHERE_PORT: "nope" })).toThrow("CODE_EVERYWHERE_PORT must")
    })

    it("rejects invalid options", () => {
        expect(() => parseCockpitServerArgs(["--port", "nope"], {})).toThrow(CockpitServerCliError)
        expect(() => parseCockpitServerArgs(["--host"], {})).toThrow("--host requires a value")
        expect(() => parseCockpitServerArgs(["--data-file"], {})).toThrow("--data-file requires a value")
        expect(() => parseCockpitServerArgs(["--auth-token"], {})).toThrow("--auth-token requires a value")
        expect(() => parseCockpitServerArgs(["--host", "--port", "4900"], {})).toThrow("--host requires a value")
        expect(() => parseCockpitServerArgs(["--port", "--host", "127.0.0.1"], {})).toThrow("--port requires a value")
        expect(() => parseCockpitServerArgs(["--wat"], {})).toThrow("Unknown option: --wat")
    })

    it("formats connectable listen URLs", () => {
        expect(cockpitServerUrl("0.0.0.0", 4789)).toBe("http://127.0.0.1:4789")
        expect(cockpitServerUrl("::", 4789)).toBe("http://[::1]:4789")
        expect(cockpitServerUrl("::1", 4789)).toBe("http://[::1]:4789")
        expect(cockpitServerUrl("127.0.0.1", 4789)).toBe("http://127.0.0.1:4789")
    })

    it("starts a working local HTTP server", async () => {
        const running = await startCockpitHttpServer({ host: "127.0.0.1", port: 0, dataFile: null })

        try {
            const response = await sendJson(running.url, "GET", "/snapshot")

            expect(response.statusCode).toBe(200)
            expect(response.body).toMatchObject({ eventCount: 0, sessions: [] })
        } finally {
            await new Promise<void>((resolve, reject) => {
                running.server.close((error) => {
                    if (error !== undefined) {
                        reject(error)
                        return
                    }

                    resolve()
                })
            })
        }
    })

    it("requires auth token when binding beyond loopback", async () => {
        await expect(startCockpitHttpServer({ host: "0.0.0.0", port: 0, dataFile: null })).rejects.toThrow(
            "--auth-token or CODE_EVERYWHERE_AUTH_TOKEN is required when binding beyond loopback",
        )

        const running = await startCockpitHttpServer({ host: "0.0.0.0", port: 0, dataFile: null, authToken: "test-secret" })
        try {
            const response = await sendJson(running.url, "GET", "/snapshot")
            expect(response.statusCode).toBe(401)
        } finally {
            await closeServer(running.server)
        }
    })

    it("persists events and command delivery across server restarts", async () => {
        const dir = await mkdtemp(join(tmpdir(), "code-everywhere-"))
        const dataFile = join(dir, "broker.json")

        try {
            const firstRun = await startCockpitHttpServer({ host: "127.0.0.1", port: 0, dataFile })
            try {
                await sendJson(firstRun.url, "POST", "/events", {
                    event: {
                        kind: "session_hello",
                        session: baseSession,
                    },
                })
                await sendJson(firstRun.url, "POST", "/commands", {
                    command: {
                        kind: "status_request",
                        sessionId: "session-1",
                        sessionEpoch: "epoch-1",
                    },
                })
                await sendJson(firstRun.url, "POST", "/commands/claim", { sessionId: "session-1" })
            } finally {
                await closeServer(firstRun.server)
            }

            const secondRun = await startCockpitHttpServer({ host: "127.0.0.1", port: 0, dataFile })
            try {
                const snapshotResponse = await sendJson(secondRun.url, "GET", "/snapshot")
                const commandResponse = await sendJson(secondRun.url, "GET", "/commands")

                expect(snapshotResponse.body).toMatchObject({
                    eventCount: 1,
                    sessions: [{ sessionId: "session-1" }],
                })
                const commandBody = commandResponse.body as {
                    commandCount: number
                    commands: { id: string; deliveredAt: unknown }[]
                }
                expect(commandBody.commandCount).toBe(1)
                expect(commandBody.commands[0]?.id).toBe("command-1")
                expect(typeof commandBody.commands[0]?.deliveredAt).toBe("string")
            } finally {
                await closeServer(secondRun.server)
            }
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it("rejects corrupt persistence data at startup", async () => {
        const dir = await mkdtemp(join(tmpdir(), "code-everywhere-"))
        const dataFile = join(dir, "broker.json")

        try {
            await writeFile(dataFile, "not json")

            await expect(startCockpitHttpServer({ host: "127.0.0.1", port: 0, dataFile })).rejects.toThrow(
                "Unable to read cockpit persistence file",
            )
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})

const closeServer = async (server: Awaited<ReturnType<typeof startCockpitHttpServer>>["server"]): Promise<void> =>
    new Promise((resolve, reject) => {
        server.close((error) => {
            if (error !== undefined) {
                reject(error)
                return
            }

            resolve()
        })
    })

const sendJson = async (
    baseUrl: string,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
): Promise<{ statusCode: number; body: unknown }> =>
    new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl)
        const payload = body === undefined ? undefined : JSON.stringify(body)
        const req = request(
            url,
            {
                method,
                headers: payload === undefined ? undefined : { "content-type": "application/json" },
            },
            (response) => {
                const chunks: Buffer[] = []
                response.on("data", (chunk: Buffer) => chunks.push(chunk))
                response.on("end", () => {
                    resolve({
                        statusCode: response.statusCode ?? 0,
                        body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
                    })
                })
            },
        )

        req.on("error", reject)
        if (payload !== undefined) {
            req.write(payload)
        }
        req.end()
    })
