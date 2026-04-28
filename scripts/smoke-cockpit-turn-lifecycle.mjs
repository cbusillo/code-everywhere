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

        assertEqual(snapshot.eventCount, 13, "event count")
        assertEqual(snapshot.sessions[0]?.sessionId, "smoke-session", "session id")
        assertEqual(snapshot.sessions[0]?.status, "idle", "session status")
        assertEqual(snapshot.sessions[0]?.currentTurnId, "smoke-turn", "current turn id")
        assertEqual(snapshot.state.turns["smoke-turn"]?.status, "completed", "turn status")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps.length, 8, "turn step count")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[0]?.title, "Shell command", "tool step title")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[0]?.state, "completed", "tool step state")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[1]?.title, "Browser tool", "browser step title")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[2]?.title, "MCP tool", "mcp step title")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[3]?.kind, "diff", "diff step kind")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[4]?.kind, "artifact", "artifact step kind")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[5]?.title, "Approval granted", "approval step title")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[6]?.title, "Input answered", "input step title")
        assertEqual(snapshot.state.turns["smoke-turn"]?.steps[7]?.detail, "Smoke turn complete.", "assistant message")
        assertEqual(snapshot.state.pendingApprovals["approval-smoke"], undefined, "resolved approval")
        assertEqual(snapshot.state.requestedInputs["input-smoke"], undefined, "resolved input")

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
            id: "smoke-turn:tool:browser-1",
            kind: "tool",
            title: "Browser tool",
            detail: 'browser_open\n{"url":"http://127.0.0.1:4789/sessions/smoke-session?view=timeline-with-a-very-long-token-that-must-wrap"}',
            timestamp: "2026-04-28T12:00:02.100Z",
            state: "completed",
        },
    },
    {
        kind: "turn_step_added",
        sessionId: "smoke-session",
        sessionEpoch: "smoke-epoch",
        turnId: "smoke-turn",
        step: {
            id: "smoke-turn:tool:mcp-1",
            kind: "tool",
            title: "MCP tool",
            detail: 'filesystem.read_file\n{"path":"/tmp/code-everywhere-smoke/packages/contracts/src/index.ts"}',
            timestamp: "2026-04-28T12:00:02.200Z",
            state: "completed",
        },
    },
    {
        kind: "turn_step_added",
        sessionId: "smoke-session",
        sessionEpoch: "smoke-epoch",
        turnId: "smoke-turn",
        step: {
            id: "smoke-turn:diff",
            kind: "diff",
            title: "Turn diff",
            detail: "diff --git a/apps/web/src/App.tsx b/apps/web/src/App.tsx\n+preserve multiline tool details in timeline rows",
            timestamp: "2026-04-28T12:00:02.300Z",
            state: "completed",
        },
    },
    {
        kind: "turn_step_added",
        sessionId: "smoke-session",
        sessionEpoch: "smoke-epoch",
        turnId: "smoke-turn",
        step: {
            id: "smoke-turn:artifact:image-1",
            kind: "artifact",
            title: "Image artifact",
            detail: "Generated image saved at /tmp/code-everywhere-smoke/artifacts/timeline-smoke.png",
            timestamp: "2026-04-28T12:00:02.400Z",
            state: "completed",
        },
    },
    {
        kind: "approval_requested",
        approval: {
            id: "approval-smoke",
            sessionId: "smoke-session",
            sessionEpoch: "smoke-epoch",
            turnId: "smoke-turn",
            title: "Approve smoke command",
            body: "Run a harmless smoke command.",
            command: "pnpm smoke:cockpit:turns",
            cwd: "/tmp/code-everywhere-smoke",
            risk: "low",
            requestedAt: "2026-04-28T12:00:02.500Z",
        },
    },
    {
        kind: "approval_resolved",
        sessionId: "smoke-session",
        sessionEpoch: "smoke-epoch",
        approvalId: "approval-smoke",
        decision: "approve",
        resolvedAt: "2026-04-28T12:00:02.600Z",
    },
    {
        kind: "user_input_requested",
        input: {
            id: "input-smoke",
            sessionId: "smoke-session",
            sessionEpoch: "smoke-epoch",
            turnId: "smoke-turn",
            title: "Choose smoke mode",
            requestedAt: "2026-04-28T12:00:02.700Z",
            questions: [
                {
                    id: "mode",
                    label: "Mode",
                    prompt: "Which timeline surface should be emphasized?",
                    required: true,
                    options: [
                        {
                            label: "Timeline",
                            value: "timeline",
                        },
                    ],
                },
            ],
        },
    },
    {
        kind: "user_input_resolved",
        sessionId: "smoke-session",
        sessionEpoch: "smoke-epoch",
        inputId: "input-smoke",
        resolvedAt: "2026-04-28T12:00:02.800Z",
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
