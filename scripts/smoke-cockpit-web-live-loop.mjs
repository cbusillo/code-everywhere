#!/usr/bin/env node

import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { kill as killProcess, platform, stderr, stdout } from "node:process"
import { setTimeout as delay } from "node:timers/promises"

const smokePollIntervalMs = 500
const processLogs = new WeakMap()

const run = async () => {
    const uiBrowser = await findUiBrowser()
    const session = `cockpit-web-smoke-${String(process.pid)}-${String(Date.now())}`
    const brokerPort = await getFreePort()
    const webPort = await getFreePort()
    const brokerUrl = `http://127.0.0.1:${String(brokerPort)}`
    const webUrl = `http://127.0.0.1:${String(webPort)}`
    let broker = null
    let web = null

    try {
        broker = startBroker(brokerPort)
        await waitForHttp(`${brokerUrl}/snapshot`, "cockpit broker")

        web = startWeb(webPort, brokerUrl)
        await waitForHttp(webUrl, "web cockpit")

        await ui(uiBrowser, session, ["open", webUrl, "1000"])
        await ui(uiBrowser, session, ["wait-for", "text=No live sessions", "10000"])
        await assertBrowserState(uiBrowser, session, {
            mode: "Live HTTP",
            state: "No live sessions",
            detail: "no trusted Every Code sessions",
        })

        await postJson(`${brokerUrl}/events`, { events: createLiveLoopEvents("Smoke broker live loop") })
        await ui(uiBrowser, session, ["wait-for", "text=Smoke broker live loop", "10000"])
        await assertBrowserState(uiBrowser, session, {
            mode: "Live HTTP",
            state: "Stale event evidence retained",
            summary: "Smoke broker live loop",
            sessionId: "smoke-live-session",
            detail: "Broker/web smoke step complete.",
        })

        await clickFirstCommandButton(uiBrowser, session, "Status")
        await waitForCommand(brokerUrl, "status_request")
        await clickFirstCommandButton(uiBrowser, session, "Pause")
        await waitForCommand(brokerUrl, "pause_current_turn")
        await clickFirstCommandButton(uiBrowser, session, "Continue")
        await waitForCommand(brokerUrl, "continue_autonomously")

        await stopProcess(broker)
        broker = null
        await ui(uiBrowser, session, ["wait-for", "text=HTTP fallback", "10000"])
        await assertBrowserState(uiBrowser, session, {
            mode: "HTTP fallback",
            state: "Broker reconnecting",
            summary: "Smoke broker live loop",
            sessionId: "smoke-live-session",
            detail: "Broker/web smoke step complete.",
        })

        broker = startBroker(brokerPort)
        await waitForHttp(`${brokerUrl}/snapshot`, "restarted cockpit broker")
        await postJson(`${brokerUrl}/events`, { events: createLiveLoopEvents("Smoke broker reconnected") })
        await ui(uiBrowser, session, ["wait-for", "text=Smoke broker reconnected", "10000"])
        await assertBrowserState(uiBrowser, session, {
            mode: "Live HTTP",
            summary: "Smoke broker reconnected",
            sessionId: "smoke-live-session",
            detail: "Broker/web smoke step complete.",
        })

        stdout.write(`Cockpit web live-loop smoke passed at ${webUrl} using broker ${brokerUrl}\n`)
    } catch (error) {
        stderr.write(`${error instanceof Error ? error.message : "Cockpit web live-loop smoke failed"}\n`)
        if (broker !== null) {
            writeProcessLogs("Broker", broker)
        }
        if (web !== null) {
            writeProcessLogs("Web", web)
        }
        process.exitCode = 1
    } finally {
        await ui(uiBrowser, session, ["close"]).catch(() => undefined)
        if (web !== null) {
            await stopProcess(web)
        }
        if (broker !== null) {
            await stopProcess(broker)
        }
    }
}

const findUiBrowser = async () => {
    try {
        return await runCommand("sh", ["-lc", "command -v ui-browser"])
    } catch {
        throw new Error("ui-browser is required for pnpm smoke:cockpit:web")
    }
}

const startBroker = (port) =>
    trackProcessLogs(
        spawn("pnpm", ["--filter", "@code-everywhere/server", "start", "--", "--memory", "--port", String(port)], {
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
    child.stdout.on("data", (chunk) => {
        processLogs.set(child, `${processLogs.get(child) ?? ""}${String(chunk)}`)
    })
    child.stderr.on("data", (chunk) => {
        processLogs.set(child, `${processLogs.get(child) ?? ""}${String(chunk)}`)
    })
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
            server.close(() => {
                if (port === null) {
                    reject(new Error("Unable to reserve a local port"))
                    return
                }
                resolve(port)
            })
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

const ui = async (uiBrowser, session, args) => runCommand(uiBrowser, ["--session", session, ...args])

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
        throw new Error("Expected cockpit web smoke to avoid horizontal overflow")
    }
}

const clickFirstCommandButton = async (uiBrowser, session, label) => {
    await ui(uiBrowser, session, [
        "eval",
        `(() => { const label = ${JSON.stringify(label)}; const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.innerText.trim() === label); if (!button) throw new Error(label + ' button not found'); button.click(); return true; })()`,
    ])
}

const waitForCommand = async (brokerUrl, commandKind) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 10000) {
        const snapshot = await getJson(`${brokerUrl}/commands`)
        if (snapshot.commands.some((command) => command.command.kind === commandKind && command.deliveredAt === null)) {
            return
        }
        await delay(100)
    }

    throw new Error(`Timed out waiting for ${commandKind} command`)
}

const runCommand = async (command, args) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ["ignore", "pipe", "pipe"],
        })
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

const createLiveLoopEvents = (summary) => [
    {
        kind: "session_hello",
        session: {
            sessionId: "smoke-live-session",
            sessionEpoch: "smoke-live-epoch",
            hostLabel: "Smoke Host",
            cwd: "/tmp/code-everywhere-web-smoke",
            branch: "main",
            pid: 4242,
            model: "code",
            status: "idle",
            summary,
            startedAt: "2026-04-28T12:30:00.000Z",
            updatedAt: "2026-04-28T12:30:00.000Z",
            currentTurnId: null,
        },
    },
    {
        kind: "turn_step_added",
        sessionId: "smoke-live-session",
        sessionEpoch: "smoke-stale-epoch",
        turnId: "smoke-live-turn",
        step: {
            id: "smoke-stale-step",
            kind: "status",
            title: "Stale status",
            detail: "This stale smoke event should be visible as bounded evidence.",
            timestamp: "2026-04-28T12:30:01.500Z",
            state: "completed",
        },
    },
    {
        kind: "turn_started",
        sessionEpoch: "smoke-live-epoch",
        turn: {
            id: "smoke-live-turn",
            sessionId: "smoke-live-session",
            title: "Broker/web smoke turn",
            status: "running",
            actor: "assistant",
            startedAt: "2026-04-28T12:30:01.000Z",
            completedAt: null,
            summary: "Broker/web smoke turn started.",
            steps: [],
        },
    },
    {
        kind: "turn_step_added",
        sessionId: "smoke-live-session",
        sessionEpoch: "smoke-live-epoch",
        turnId: "smoke-live-turn",
        step: {
            id: "smoke-live-turn:tool:broker-web",
            kind: "tool",
            title: "Shell command",
            detail: "Broker/web smoke step complete.",
            timestamp: "2026-04-28T12:30:02.000Z",
            state: "completed",
        },
    },
]

await run()
