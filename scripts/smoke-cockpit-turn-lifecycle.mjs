#!/usr/bin/env node

import { spawn } from "node:child_process"
import { exit, kill as killProcess, platform, stderr, stdout } from "node:process"
import { setTimeout as delay } from "node:timers/promises"

const serverReadyPattern = /listening at (http:\/\/\S+)/

const run = async () => {
    const server = spawn("pnpm", ["--filter", "@code-everywhere/server", "start", "--", "--memory", "--port", "0"], {
        detached: platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
    })

    let logs = ""

    try {
        const url = await waitForServerUrl(server, (chunk) => {
            logs += String(chunk)
        })
        await postJson(`${url}/events`, { events: createTurnLifecycleEvents() })
        const snapshot = await getJson(`${url}/snapshot`)

        assertEqual(snapshot.eventCount, 5, "event count")
        assertEqual(snapshot.sessions[0]?.sessionId, "smoke-session", "session id")
        assertEqual(snapshot.sessions[0]?.status, "idle", "session status")
        assertEqual(snapshot.sessions[0]?.currentTurnId, "smoke-turn", "current turn id")
        assertEqual(snapshot.state.turns["smoke-turn"]?.status, "completed", "turn status")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps.length, 2, "turn step count")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[0]?.title, "Shell command", "tool step title")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[0]?.state, "completed", "tool step state")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[1]?.detail, "Smoke turn complete.", "assistant message")

        stdout.write(`Cockpit turn lifecycle smoke passed at ${url}\n`)
    } catch (error) {
        stderr.write(`${error instanceof Error ? error.message : "Cockpit smoke failed"}\n`)
        if (logs.trim() !== "") {
            stderr.write(`\nServer output:\n${logs}`)
        }
        exit(1)
    } finally {
        await stopServer(server)
    }
}

const stopServer = async (server) => {
    if (server.exitCode !== null) {
        return
    }

    signalServer(server, "SIGTERM")
    const closed = await waitForClose(server, 3000)
    if (!closed) {
        signalServer(server, "SIGKILL")
        await waitForClose(server, 3000)
    }
}

const signalServer = (server, signal) => {
    if (server.pid === undefined) {
        return
    }

    try {
        if (platform === "win32") {
            server.kill(signal)
        } else {
            killProcess(-server.pid, signal)
        }
    } catch {
        server.kill(signal)
    }
}

const waitForClose = async (server, timeoutMs) => {
    if (server.exitCode !== null) {
        return true
    }

    return Promise.race([new Promise((resolve) => server.once("close", () => resolve(true))), delay(timeoutMs).then(() => false)])
}

const waitForServerUrl = async (server, collectLog) => {
    const chunks = []
    const onData = (chunk) => {
        const text = chunk.toString()
        chunks.push(text)
        collectLog(text)
    }
    server.stdout.on("data", onData)
    server.stderr.on("data", onData)

    const startedAt = Date.now()
    while (Date.now() - startedAt < 30000) {
        const match = serverReadyPattern.exec(chunks.join(""))
        if (match?.[1] !== undefined) {
            return match[1]
        }
        if (server.exitCode !== null) {
            throw new Error(`Cockpit server exited before becoming ready with code ${String(server.exitCode)}`)
        }
        await delay(50)
    }

    throw new Error("Timed out waiting for cockpit server readiness")
}

const postJson = async (url, body) => {
    const response = await globalThis.fetch(url, {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    })

    if (!response.ok) {
        throw new Error(`POST ${url} failed with ${String(response.status)}`)
    }

    return response.json()
}

const getJson = async (url) => {
    const response = await globalThis.fetch(url, {
        headers: {
            accept: "application/json",
        },
    })

    if (!response.ok) {
        throw new Error(`GET ${url} failed with ${String(response.status)}`)
    }

    return response.json()
}

const createTurnLifecycleEvents = () => [
    {
        kind: "session_hello",
        session: {
            sessionId: "smoke-session",
            sessionEpoch: "smoke-epoch",
            hostLabel: "Smoke Host",
            cwd: "/tmp/code-everywhere-smoke",
            branch: "main",
            pid: 4242,
            model: "code",
            status: "idle",
            summary: "Smoke session connected.",
            startedAt: "2026-04-28T12:00:00.000Z",
            updatedAt: "2026-04-28T12:00:00.000Z",
            currentTurnId: null,
        },
    },
    {
        kind: "turn_started",
        sessionEpoch: "smoke-epoch",
        turn: {
            id: "smoke-turn",
            sessionId: "smoke-session",
            title: "Every Code turn",
            status: "running",
            actor: "assistant",
            startedAt: "2026-04-28T12:00:01.000Z",
            completedAt: null,
            summary: "Turn started",
            steps: [],
        },
    },
    {
        kind: "turn_step_added",
        sessionId: "smoke-session",
        sessionEpoch: "smoke-epoch",
        turnId: "smoke-turn",
        step: {
            id: "smoke-turn:tool:exec-1",
            kind: "tool",
            title: "Shell command",
            detail: "pnpm test\nExited with code 0 after 0.2s.",
            timestamp: "2026-04-28T12:00:02.000Z",
            state: "completed",
        },
    },
    {
        kind: "turn_step_added",
        sessionId: "smoke-session",
        sessionEpoch: "smoke-epoch",
        turnId: "smoke-turn",
        step: {
            id: "smoke-turn:assistant-message",
            kind: "message",
            title: "Assistant message",
            detail: "Smoke turn complete.",
            timestamp: "2026-04-28T12:00:03.000Z",
            state: "completed",
        },
    },
    {
        kind: "turn_status_changed",
        sessionId: "smoke-session",
        sessionEpoch: "smoke-epoch",
        turnId: "smoke-turn",
        status: "completed",
        summary: "Turn complete.",
        completedAt: "2026-04-28T12:00:04.000Z",
    },
]

const assertEqual = (actual, expected, label) => {
    if (actual !== expected) {
        throw new Error(`Expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

await run()
