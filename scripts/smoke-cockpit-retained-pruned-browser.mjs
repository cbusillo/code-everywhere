#!/usr/bin/env node

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { exit, kill as killProcess, platform, stderr, stdout } from "node:process"
import { setTimeout as delay } from "node:timers/promises"

const smokePollIntervalMs = 500
const processLogs = new WeakMap()

const run = async () => {
    const uiBrowser = await findUiBrowser()
    const session = `cockpit-pruned-smoke-${String(process.pid)}-${String(Date.now())}`
    const directory = await mkdtemp(join(tmpdir(), "code-everywhere-pruned-smoke-"))
    const dataFile = join(directory, "broker.json")
    const brokerPort = await getFreePort()
    const webPort = await getFreePort()
    const brokerUrl = `http://127.0.0.1:${String(brokerPort)}`
    const webUrl = `http://127.0.0.1:${String(webPort)}`
    let broker = null
    let web = null

    try {
        broker = startBroker(brokerPort, dataFile)
        await waitForHttp(`${brokerUrl}/snapshot`, "cockpit broker")
        await postJson(`${brokerUrl}/events`, { events: createPruningEvents() })
        await stopProcess(broker)
        broker = null

        broker = startBroker(brokerPort, dataFile)
        await waitForHttp(`${brokerUrl}/snapshot`, "restarted cockpit broker")
        const snapshot = await getJson(`${brokerUrl}/snapshot`)
        assertRetainedSnapshot(snapshot)

        web = startWeb(webPort, brokerUrl)
        await waitForHttp(webUrl, "web cockpit")
        await ui(uiBrowser, session, ["open", webUrl, "1000"])
        await ui(uiBrowser, session, ["wait-for", "text=Active pruning smoke session", "10000"])
        await selectSession(uiBrowser, session, "Active pruning smoke session")
        await ui(uiBrowser, session, ["wait-for", "text=Newest retained step with a long token", "10000"])
        await assertBrowserState(uiBrowser, session, {
            mode: "Live HTTP",
            active: "Active pruning smoke session",
            retainedEnded: "Recently completed pruning smoke session",
            detail: "Newest retained step with a long token",
        })
        await assertBrowserExcludes(uiBrowser, session, ["Old completed pruning smoke session 0"])
        await assertConstrainedLayout(uiBrowser, session, 390)

        await stopProcess(broker)
        broker = null
        await ui(uiBrowser, session, ["wait-for", "text=HTTP fallback", "10000"])
        await assertBrowserState(uiBrowser, session, {
            mode: "HTTP fallback",
            active: "Active pruning smoke session",
            retainedEnded: "Recently completed pruning smoke session",
        })

        stdout.write(`Cockpit retained/pruned browser smoke passed at ${webUrl} using broker ${brokerUrl}\n`)
    } catch (error) {
        stderr.write(`${error instanceof Error ? error.message : "Cockpit retained/pruned browser smoke failed"}\n`)
        if (broker !== null) {
            writeProcessLogs("Broker", broker)
        }
        if (web !== null) {
            writeProcessLogs("Web", web)
        }
        exit(1)
    } finally {
        await ui(uiBrowser, session, ["close"]).catch(() => undefined)
        if (web !== null) {
            await stopProcess(web)
        }
        if (broker !== null) {
            await stopProcess(broker)
        }
        await rm(directory, { recursive: true, force: true })
    }
}

const assertRetainedSnapshot = (snapshot) => {
    const sessionIds = snapshot.sessions.map((session) => session.sessionId).sort()
    if (!sessionIds.includes("active-pruned") || !sessionIds.includes("ended-new") || sessionIds.includes("ended-old-0")) {
        throw new Error(`Unexpected retained session ids ${JSON.stringify(sessionIds)}`)
    }
    assertEqual(snapshot.state.turns["active-turn"]?.steps.length, 100, "active retained step count")
    assertEqual(snapshot.state.turns["active-turn"]?.steps.at(-1)?.id, "active-step-119", "newest retained step")
    assertEqual(snapshot.state.staleEvents.length, 1, "stale event evidence count")
    assertEqual(snapshot.state.staleEvents[0]?.eventKind, "turn_step_added", "stale event kind")
}

const assertEqual = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

const createPruningEvents = () => [
    ...Array.from({ length: 11 }, (_value, index) =>
        endedSessionEvents(
            `ended-old-${String(index)}`,
            `Old completed pruning smoke session ${String(index)}`,
            `2026-04-28T10:${String(index).padStart(2, "0")}:00.000Z`,
        ),
    ).flat(),
    ...endedSessionEvents("ended-new", "Recently completed pruning smoke session", "2026-04-28T11:00:00.000Z"),
    {
        kind: "session_hello",
        session: session(
            "active-pruned",
            "epoch-1",
            "Active pruning smoke session",
            "idle",
            "active-turn",
            "2026-04-28T12:00:00.000Z",
        ),
    },
    {
        kind: "session_hello",
        session: session(
            "active-pruned",
            "epoch-2",
            "Active pruning smoke session",
            "idle",
            "active-turn",
            "2026-04-28T12:10:00.000Z",
        ),
    },
    {
        kind: "turn_started",
        sessionEpoch: "epoch-2",
        turn: {
            id: "active-turn",
            sessionId: "active-pruned",
            title: "Retained pruning smoke turn",
            status: "running",
            actor: "assistant",
            startedAt: "2026-04-28T12:01:00.000Z",
            completedAt: null,
            summary: "High-volume turn with retained newest step.",
            steps: Array.from({ length: 120 }, (_value, index) => ({
                id: `active-step-${String(index)}`,
                kind: "tool",
                title: "Shell command",
                detail:
                    index === 119
                        ? "Newest retained step with a long token pruned-browser-smoke-token-that-must-wrap-without-overflow"
                        : `Pruned older step ${String(index)}`,
                timestamp: activeStepTimestamp(index),
                state: "completed",
            })),
        },
    },
    {
        kind: "turn_step_added",
        sessionId: "active-pruned",
        sessionEpoch: "epoch-1",
        turnId: "active-turn",
        step: {
            id: "stale-step",
            kind: "tool",
            title: "Stale shell command",
            detail: "This stale event should be retained as bounded evidence.",
            timestamp: "2026-04-28T12:11:00.000Z",
            state: "error",
        },
    },
]

const endedSessionEvents = (sessionId, summary, updatedAt) => [
    {
        kind: "session_hello",
        session: session(sessionId, "epoch-1", summary, "idle", `${sessionId}-turn`, updatedAt),
    },
    {
        kind: "turn_started",
        sessionEpoch: "epoch-1",
        turn: {
            id: `${sessionId}-turn`,
            sessionId,
            title: summary,
            status: "completed",
            actor: "assistant",
            startedAt: updatedAt,
            completedAt: updatedAt,
            summary,
            steps: [
                {
                    id: `${sessionId}-step`,
                    kind: "message",
                    title: "Assistant message",
                    detail: summary,
                    timestamp: updatedAt,
                    state: "completed",
                },
            ],
        },
    },
    {
        kind: "session_status_changed",
        sessionId,
        sessionEpoch: "epoch-1",
        status: "ended",
        summary,
        updatedAt,
    },
]

const session = (sessionId, sessionEpoch, summary, status, currentTurnId, updatedAt) => ({
    sessionId,
    sessionEpoch,
    hostLabel: "Smoke Host",
    cwd: "/tmp/code-everywhere-pruned-smoke",
    branch: "main",
    pid: 4242,
    model: "code",
    status,
    summary,
    startedAt: updatedAt,
    updatedAt,
    currentTurnId,
})

const activeStepTimestamp = (index) =>
    `2026-04-28T12:${String(2 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`

const findUiBrowser = async () => {
    try {
        return await runCommand("sh", ["-lc", "command -v ui-browser"])
    } catch {
        throw new Error("ui-browser is required for pnpm smoke:cockpit:retained-pruned")
    }
}

const startBroker = (port, dataFile) =>
    trackProcessLogs(
        spawn("pnpm", ["--filter", "@code-everywhere/server", "start", "--", "--data-file", dataFile, "--port", String(port)], {
            detached: platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
        }),
    )

const startWeb = (port, brokerUrl) =>
    trackProcessLogs(
        spawn(
            "pnpm",
            ["--filter", "@code-everywhere/web", "exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
            {
                detached: platform !== "win32",
                env: {
                    ...process.env,
                    VITE_COCKPIT_HTTP_URL: brokerUrl,
                    VITE_COCKPIT_POLL_INTERVAL_MS: String(smokePollIntervalMs),
                },
                stdio: ["ignore", "pipe", "pipe"],
            },
        ),
    )

const trackProcessLogs = (child) => {
    processLogs.set(child, "")
    child.stdout.on("data", (chunk) => processLogs.set(child, `${processLogs.get(child) ?? ""}${String(chunk)}`))
    child.stderr.on("data", (chunk) => processLogs.set(child, `${processLogs.get(child) ?? ""}${String(chunk)}`))
    return child
}

const writeProcessLogs = (label, child) => {
    const logs = String(processLogs.get(child) ?? "").trim()
    if (logs !== "") {
        stderr.write(`\n${label} output:\n${logs}\n`)
    }
}

const stopProcess = async (child) => {
    if (child.exitCode !== null) {
        return
    }
    signalProcess(child, "SIGTERM")
    const closed = await waitForClose(child, 3000)
    if (!closed) {
        signalProcess(child, "SIGKILL")
        await waitForClose(child, 3000)
    }
}

const signalProcess = (child, signal) => {
    if (child.pid === undefined) {
        return
    }
    try {
        if (platform === "win32") {
            child.kill(signal)
        } else {
            killProcess(-child.pid, signal)
        }
    } catch {
        child.kill(signal)
    }
}

const waitForClose = async (child, timeoutMs) => {
    if (child.exitCode !== null) {
        return true
    }
    return Promise.race([new Promise((resolve) => child.once("close", () => resolve(true))), delay(timeoutMs).then(() => false)])
}

const getFreePort = async () =>
    new Promise((resolve, reject) => {
        const server = createServer()
        server.once("error", reject)
        server.listen(0, "127.0.0.1", () => {
            const address = server.address()
            const port = typeof address === "object" && address !== null ? address.port : null
            server.close(() => (port === null ? reject(new Error("Unable to reserve a local port")) : resolve(port)))
        })
    })

const waitForHttp = async (url, label) => {
    const startedAt = Date.now()
    let lastError = null
    while (Date.now() - startedAt < 30000) {
        try {
            const response = await globalThis.fetch(url, { cache: "no-store" })
            if (response.ok) {
                return
            }
            lastError = new Error(`${label} returned ${String(response.status)}`)
        } catch (error) {
            lastError = error
        }
        await delay(100)
    }
    throw new Error(`Timed out waiting for ${label}: ${lastError instanceof Error ? lastError.message : "not ready"}`)
}

const postJson = async (url, body) => {
    const response = await globalThis.fetch(url, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
    })
    if (!response.ok) {
        throw new Error(`POST ${url} failed with ${String(response.status)}`)
    }
    return response.json()
}

const getJson = async (url) => {
    const response = await globalThis.fetch(url, { headers: { accept: "application/json" } })
    if (!response.ok) {
        throw new Error(`GET ${url} failed with ${String(response.status)}`)
    }
    return response.json()
}

const ui = async (uiBrowser, session, args) => runCommand(uiBrowser, ["--session", session, ...args])

const selectSession = async (uiBrowser, session, summary) => {
    await ui(uiBrowser, session, [
        "eval",
        `(() => { const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.innerText.includes(${JSON.stringify(summary)})); if (!button) throw new Error('Session button not found'); button.click(); return true; })()`,
    ])
}

const assertBrowserState = async (uiBrowser, session, expected) => {
    const raw = await ui(uiBrowser, session, [
        "eval",
        "(() => ({ text: document.body.innerText, canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth }))()",
    ])
    const state = JSON.parse(raw)
    for (const [label, value] of Object.entries(expected)) {
        if (!state.text.includes(value)) {
            throw new Error(`Expected browser text to include ${label} ${JSON.stringify(value)}`)
        }
    }
    if (state.canScrollX) {
        throw new Error("Expected retained/pruned cockpit to avoid horizontal overflow")
    }
}

const assertBrowserExcludes = async (uiBrowser, session, excludedText) => {
    const text = JSON.parse(await ui(uiBrowser, session, ["eval", "document.body.innerText"]))
    for (const value of excludedText) {
        if (text.includes(value)) {
            throw new Error(`Expected browser text not to include ${JSON.stringify(value)}`)
        }
    }
}

const assertConstrainedLayout = async (uiBrowser, session, width) => {
    const raw = await ui(uiBrowser, session, [
        "eval",
        `(() => { const frame = document.querySelector('.app-frame'); if (!frame) throw new Error('app frame missing'); const previous = frame.getAttribute('style') || ''; frame.style.width = '${String(width)}px'; frame.style.maxWidth = '${String(width)}px'; frame.style.margin = '0'; const overflow = Array.from(document.querySelectorAll('.panel, .session-row, .timeline-step, button')).filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className || element.tagName).slice(0, 5); const canScrollX = document.documentElement.scrollWidth > document.documentElement.clientWidth; frame.setAttribute('style', previous); return { overflow, canScrollX }; })()`,
    ])
    const result = JSON.parse(raw)
    if (result.canScrollX || result.overflow.length > 0) {
        throw new Error(`Expected constrained retained/pruned layout without overflow, got ${JSON.stringify(result)}`)
    }
}

const runCommand = async (command, args) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
        let output = ""
        let errorOutput = ""
        child.stdout.on("data", (chunk) => {
            output += String(chunk)
        })
        child.stderr.on("data", (chunk) => {
            errorOutput += String(chunk)
        })
        child.once("error", reject)
        child.once("close", (code) => {
            if (code === 0) {
                resolve(output.trim())
                return
            }
            reject(new Error(`${command} ${args.join(" ")} failed with code ${String(code)}\n${errorOutput.trim()}`))
        })
    })

await run()
