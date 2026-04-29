#!/usr/bin/env node

import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { kill as killProcess, platform, stderr, stdout } from "node:process"
import { setTimeout as delay } from "node:timers/promises"

const smokePollIntervalMs = 500
const processLogs = new WeakMap()
const requestedInputSmokeNote = "Freeform note from the real TUI smoke."
const pendingWorkSmokeEnabled = () =>
    ["1", "true", "yes", "on"].includes(
        String(process.env.CODE_EVERYWHERE_SMOKE_PENDING_WORK ?? "")
            .trim()
            .toLowerCase(),
    )
const stalePendingWorkSmokeEnabled = () =>
    ["1", "true", "yes", "on"].includes(
        String(process.env.CODE_EVERYWHERE_SMOKE_STALE_PENDING_WORK ?? "")
            .trim()
            .toLowerCase(),
    )
const pendingWorkApprovalDecision = () => {
    const decision = String(process.env.CODE_EVERYWHERE_SMOKE_APPROVAL_DECISION ?? "approve")
        .trim()
        .toLowerCase()
    if (decision !== "approve" && decision !== "deny") {
        throw new Error(`CODE_EVERYWHERE_SMOKE_APPROVAL_DECISION must be approve or deny, got ${JSON.stringify(decision)}`)
    }
    return decision
}

const run = async () => {
    const uiBrowser = await findCommand("ui-browser", "ui-browser is required for pnpm smoke:cockpit:real-tui")
    const configuredCodeBinary = process.env.CODE_EVERYWHERE_CODE_BINARY?.trim()
    const codeBinary =
        configuredCodeBinary !== undefined && configuredCodeBinary !== ""
            ? configuredCodeBinary
            : await findCommand("code", "code is required for pnpm smoke:cockpit:real-tui")
    const expectBinary = await findCommand("expect", "expect is required for pnpm smoke:cockpit:real-tui")
    const session = `cockpit-real-tui-smoke-${String(process.pid)}-${String(Date.now())}`
    const directory = await mkdtemp(join(tmpdir(), "code-everywhere-real-tui-smoke-"))
    const workdir = join(directory, "work")
    const brokerPort = await getFreePort()
    const webPort = await getFreePort()
    const brokerUrl = `http://127.0.0.1:${String(brokerPort)}`
    const webUrl = `http://127.0.0.1:${String(webPort)}`
    let broker = null
    let web = null
    let tui = null

    try {
        await mkdir(workdir, { recursive: true })
        broker = startBroker(brokerPort)
        await waitForHttp(`${brokerUrl}/snapshot`, "cockpit broker")
        web = startWeb(webPort, brokerUrl)
        await waitForHttp(webUrl, "web cockpit")

        tui = startCodeTui(expectBinary, codeBinary, brokerUrl, workdir)
        const tuiSession = await waitForTuiSession(brokerUrl)

        await ui(uiBrowser, session, ["open", webUrl, "1000"])
        await ui(uiBrowser, session, ["wait-for", "text=Connected to Code Everywhere.", "15000"])
        await assertBrowserState(uiBrowser, session, {
            mode: "Live HTTP",
            hostLabel: "Smoke TUI",
            summary: "Connected to Code Everywhere.",
            sessionId: tuiSession.sessionId,
        })

        if (pendingWorkSmokeEnabled()) {
            if (stalePendingWorkSmokeEnabled()) {
                await runStalePendingWorkSmoke(uiBrowser, session, brokerUrl, tuiSession)
            } else {
                await runPendingWorkSmoke(uiBrowser, session, brokerUrl, tuiSession)
            }
            stdout.write(
                `Cockpit real TUI pending-work smoke passed at ${webUrl} using broker ${brokerUrl} and session ${tuiSession.sessionId}\n`,
            )
            return
        }

        await clickFirstCommandButton(uiBrowser, session, "Status")
        const outcome = await waitForCommandOutcome(brokerUrl, "status_request", tuiSession)
        assertEqual(outcome.status, "accepted", "status command outcome")
        assertEqual(outcome.sessionId, tuiSession.sessionId, "status command session")
        assertEqual(outcome.sessionEpoch, tuiSession.sessionEpoch, "status command epoch")
        await waitForCommandHistoryEntry(uiBrowser, session, {
            label: "Status Request",
            state: "accepted",
            detail: "Claimed by Every Code",
        })
        await waitForTuiIdleSession(brokerUrl, tuiSession)
        await clickFirstCommandButton(uiBrowser, session, "Pause")
        const pauseOutcome = await waitForCommandOutcome(brokerUrl, "pause_current_turn", tuiSession)
        assertEqual(pauseOutcome.status, "rejected", "idle pause command outcome")
        assertEqual(pauseOutcome.reason, "no active turn is running", "idle pause rejection reason")
        assertEqual(pauseOutcome.sessionId, tuiSession.sessionId, "idle pause command session")
        assertEqual(pauseOutcome.sessionEpoch, tuiSession.sessionEpoch, "idle pause command epoch")
        await waitForCommandHistoryEntry(uiBrowser, session, {
            label: "Pause Current Turn",
            state: "rejected",
            detail: "no active turn is running",
        })
        await waitForTuiIdleSession(brokerUrl, tuiSession)
        await clickFirstCommandButton(uiBrowser, session, "Continue")
        const continueOutcome = await waitForCommandOutcome(brokerUrl, "continue_autonomously", tuiSession)
        if (continueOutcome.status !== "accepted" && continueOutcome.status !== "rejected") {
            throw new Error(`Expected continue command to be handled, got ${JSON.stringify(continueOutcome.status)}`)
        }
        if (continueOutcome.status === "rejected") {
            assertEqual(continueOutcome.reason, "no prior session history to continue", "idle continue rejection reason")
        }
        assertEqual(continueOutcome.sessionId, tuiSession.sessionId, "idle continue command session")
        assertEqual(continueOutcome.sessionEpoch, tuiSession.sessionEpoch, "idle continue command epoch")
        await waitForCommandHistoryEntry(uiBrowser, session, {
            label: "Continue Autonomously",
            state: continueOutcome.status,
            detail: continueOutcome.reason ?? "Claimed by Every Code",
        })

        await stopProcess(broker)
        broker = null
        await ui(uiBrowser, session, ["wait-for", "text=HTTP fallback", "10000"])
        broker = startBroker(brokerPort)
        await waitForHttp(`${brokerUrl}/snapshot`, "restarted cockpit broker")
        const replayedSession = await waitForTuiSession(brokerUrl)
        assertEqual(replayedSession.sessionId, tuiSession.sessionId, "replayed TUI session id")
        assertEqual(replayedSession.sessionEpoch, tuiSession.sessionEpoch, "replayed TUI session epoch")
        await ui(uiBrowser, session, ["wait-for", "text=Connected to Code Everywhere.", "15000"])
        await assertBrowserState(uiBrowser, session, {
            mode: "Live HTTP",
            hostLabel: "Smoke TUI",
            summary: "Connected to Code Everywhere.",
            sessionId: tuiSession.sessionId,
        })

        await sendReply(uiBrowser, session, "Real TUI reply smoke: acknowledge this control message only.")
        const replyOutcome = await waitForCommandOutcome(brokerUrl, "reply", tuiSession)
        assertEqual(replyOutcome.status, "accepted", "reply command outcome")
        assertEqual(replyOutcome.sessionId, tuiSession.sessionId, "reply command session")
        assertEqual(replyOutcome.sessionEpoch, tuiSession.sessionEpoch, "reply command epoch")
        await waitForCommandHistoryEntry(uiBrowser, session, {
            label: "Reply",
            state: "accepted",
            detail: "Claimed by Every Code",
        })

        await clickEndSessionButton(uiBrowser, session)
        const endOutcome = await waitForCommandOutcome(brokerUrl, "end_session", tuiSession)
        assertEqual(endOutcome.status, "accepted", "end session command outcome")
        assertEqual(endOutcome.sessionId, tuiSession.sessionId, "end session command session")
        assertEqual(endOutcome.sessionEpoch, tuiSession.sessionEpoch, "end session command epoch")
        await waitForCommandHistoryEntry(uiBrowser, session, {
            label: "End Session",
            state: "accepted",
            detail: "Claimed by Every Code",
        })

        stdout.write(
            `Cockpit real TUI live-loop smoke passed at ${webUrl} using broker ${brokerUrl} and session ${tuiSession.sessionId}\n`,
        )
    } catch (error) {
        stderr.write(`${error instanceof Error ? error.message : "Cockpit real TUI live-loop smoke failed"}\n`)
        if (broker !== null) {
            writeProcessLogs("Broker", broker)
        }
        if (web !== null) {
            writeProcessLogs("Web", web)
        }
        if (tui !== null) {
            writeProcessLogs("TUI", tui)
        }
        process.exitCode = 1
    } finally {
        await ui(uiBrowser, session, ["close"]).catch(() => undefined)
        if (tui !== null) {
            await stopProcess(tui)
        }
        if (web !== null) {
            await stopProcess(web)
        }
        if (broker !== null) {
            await stopProcess(broker)
        }
        await rm(directory, { recursive: true, force: true })
    }
}

const startCodeTui = (expectBinary, codeBinary, brokerUrl, workdir) => {
    const script = `
set code_binary ${tclQuote(codeBinary)}
set broker_url ${tclQuote(brokerUrl)}
set host_label ${tclQuote("Smoke TUI")}
set workdir ${tclQuote(workdir)}
set timeout 45
spawn $code_binary -c remote_inbox.enabled=true -c remote_inbox.code_everywhere_url=$broker_url -c remote_inbox.host_label=$host_label -C $workdir
after 45000
send "\\003"
after 500
send "\\003"
expect eof
`
    return trackProcessLogs(
        spawn(expectBinary, ["-c", script], {
            detached: platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
        }),
    )
}

const tclQuote = (value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`

const waitForTuiSession = async (brokerUrl) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 20000) {
        const snapshot = await getJson(`${brokerUrl}/snapshot`)
        const session = snapshot.sessions.find((candidate) => candidate.hostLabel === "Smoke TUI")
        if (session !== undefined) {
            return session
        }
        await delay(250)
    }
    throw new Error("Timed out waiting for real TUI session hello")
}

const waitForTuiIdleSession = async (brokerUrl, expectedSession) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 10000) {
        const snapshot = await getJson(`${brokerUrl}/snapshot`)
        const session = snapshot.sessions.find(
            (candidate) =>
                candidate.sessionId === expectedSession.sessionId && candidate.sessionEpoch === expectedSession.sessionEpoch,
        )
        if (session?.status === "idle" && session.currentTurnId === null) {
            return session
        }
        await delay(250)
    }
    throw new Error(`Timed out waiting for real TUI session ${expectedSession.sessionId} to be idle`)
}

const waitForCommandOutcome = async (brokerUrl, commandKind, expectedSession, options = {}) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 20000) {
        const snapshot = await getJson(`${brokerUrl}/snapshot`)
        const outcome = Object.values(snapshot.state.commandOutcomes).find(
            (candidate) =>
                candidate.commandKind === commandKind &&
                candidate.sessionId === expectedSession.sessionId &&
                candidate.sessionEpoch === expectedSession.sessionEpoch &&
                (options.status === undefined || candidate.status === options.status),
        )
        if (outcome !== undefined) {
            return outcome
        }
        await delay(250)
    }
    throw new Error(`Timed out waiting for ${commandKind} command outcome from real TUI`)
}

const findCommand = async (command, errorMessage) => {
    try {
        return await runCommand("sh", ["-lc", `command -v ${command}`])
    } catch {
        throw new Error(errorMessage)
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

const getJson = async (url) => {
    const response = await globalThis.fetch(url, { headers: { accept: "application/json" } })
    if (!response.ok) {
        throw new Error(`GET ${url} failed with ${String(response.status)}`)
    }
    return response.json()
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
        throw new Error("Expected real TUI cockpit smoke to avoid horizontal overflow")
    }
}

const clickFirstCommandButton = async (uiBrowser, session, label) => {
    await ui(uiBrowser, session, [
        "eval",
        `(() => { const label = ${JSON.stringify(label)}; const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.innerText.trim() === label); if (!button) throw new Error(label + ' button not found'); button.click(); return true; })()`,
    ])
}

const runPendingWorkSmoke = async (uiBrowser, session, brokerUrl, tuiSession) => {
    const approvalDecision = pendingWorkApprovalDecision()
    await waitForElementCount(uiBrowser, session, ".approval-card", 1)
    await clickButtonByText(uiBrowser, session, approvalDecision === "approve" ? "Approve" : "Deny")
    const approvalOutcome = await waitForCommandOutcome(brokerUrl, "approval_decision", tuiSession, { status: "accepted" })
    assertEqual(approvalOutcome.status, "accepted", "approval decision outcome")
    assertEqual(approvalOutcome.sessionId, tuiSession.sessionId, "approval decision session")
    assertEqual(approvalOutcome.sessionEpoch, tuiSession.sessionEpoch, "approval decision epoch")
    await waitForCommandHistoryEntry(uiBrowser, session, {
        label: "Approval Decision",
        state: "accepted",
        detail: "Claimed by Every Code",
    })
    if (approvalDecision === "deny") {
        await waitForPendingWorkState(brokerUrl, tuiSession, { approvalCount: 0, inputCount: 0 })
        await waitForElementCount(uiBrowser, session, ".approval-card", 0)
        await waitForElementCount(uiBrowser, session, ".input-card", 0)
        return
    }

    await waitForPendingWorkState(brokerUrl, tuiSession, { approvalCount: 0, inputCount: 1 })
    await waitForElementCount(uiBrowser, session, ".approval-card", 0)
    await waitForElementCount(uiBrowser, session, ".input-card", 1)

    await selectRequestedInputOption(uiBrowser, session, "Continue (Recommended)")
    await fillRequestedInputNote(uiBrowser, session, requestedInputSmokeNote)
    await clickButtonByText(uiBrowser, session, "Submit input")
    await waitForSubmittedInputAnswer(brokerUrl, tuiSession, "__note", requestedInputSmokeNote)
    const inputOutcome = await waitForCommandOutcome(brokerUrl, "request_user_input_response", tuiSession)
    assertEqual(inputOutcome.status, "accepted", "request_user_input response outcome")
    assertEqual(inputOutcome.sessionId, tuiSession.sessionId, "request_user_input response session")
    assertEqual(inputOutcome.sessionEpoch, tuiSession.sessionEpoch, "request_user_input response epoch")
    await waitForCommandHistoryEntry(uiBrowser, session, {
        label: "Request User Input Response",
        state: "accepted",
        detail: "Claimed by Every Code",
    })
    await waitForPendingWorkState(brokerUrl, tuiSession, { approvalCount: 0, inputCount: 0 })
    await waitForElementCount(uiBrowser, session, ".input-card", 0)
}

const runStalePendingWorkSmoke = async (uiBrowser, session, brokerUrl, tuiSession) => {
    const staleEpoch = `${tuiSession.sessionEpoch}-stale`
    await waitForElementCount(uiBrowser, session, ".approval-card", 1)

    const staleApproval = await enqueueCommand(brokerUrl, {
        kind: "approval_decision",
        sessionId: tuiSession.sessionId,
        sessionEpoch: staleEpoch,
        approvalId: "ce-smoke-approval",
        decision: "approve",
    })
    const staleApprovalOutcome = await waitForCommandOutcomeById(brokerUrl, staleApproval.id)
    assertEqual(staleApprovalOutcome.status, "rejected", "stale approval decision outcome")
    assertIncludes(staleApprovalOutcome.reason, "stale session scope", "stale approval rejection reason")
    await waitForCommandHistoryEntry(uiBrowser, session, {
        label: "Approval Decision",
        state: "rejected",
        detail: "stale session scope",
    })
    await waitForPendingWorkState(brokerUrl, tuiSession, { approvalCount: 1, inputCount: 0 })
    await waitForElementCount(uiBrowser, session, ".approval-card", 1)
    await waitForElementCount(uiBrowser, session, ".input-card", 0)

    await clickButtonByText(uiBrowser, session, "Approve")
    const approvalOutcome = await waitForCommandOutcome(brokerUrl, "approval_decision", tuiSession, { status: "accepted" })
    assertEqual(approvalOutcome.status, "accepted", "approval decision outcome after stale rejection")
    await waitForPendingWorkState(brokerUrl, tuiSession, { approvalCount: 0, inputCount: 1 })
    await waitForElementCount(uiBrowser, session, ".approval-card", 0)
    await waitForElementCount(uiBrowser, session, ".input-card", 1)

    const staleInput = await enqueueCommand(brokerUrl, {
        kind: "request_user_input_response",
        sessionId: tuiSession.sessionId,
        sessionEpoch: staleEpoch,
        inputId: "ce-smoke-input",
        turnId: "ce-smoke-pending-turn",
        answers: [{ questionId: "mode", value: "Continue (Recommended)" }],
    })
    const staleInputOutcome = await waitForCommandOutcomeById(brokerUrl, staleInput.id)
    assertEqual(staleInputOutcome.status, "rejected", "stale request_user_input response outcome")
    assertIncludes(staleInputOutcome.reason, "stale session scope", "stale request_user_input rejection reason")
    await waitForCommandHistoryEntry(uiBrowser, session, {
        label: "Request User Input Response",
        state: "rejected",
        detail: "stale session scope",
    })
    await waitForPendingWorkState(brokerUrl, tuiSession, { approvalCount: 0, inputCount: 1 })
    await waitForElementCount(uiBrowser, session, ".input-card", 1)
}

const enqueueCommand = async (brokerUrl, command) => {
    const snapshot = await postJson(`${brokerUrl}/commands`, { command })
    const record = snapshot.commands.findLast(
        (candidate) =>
            candidate.command.kind === command.kind &&
            candidate.command.sessionId === command.sessionId &&
            candidate.command.sessionEpoch === command.sessionEpoch,
    )
    if (record === undefined) {
        throw new Error(`Expected command ${command.kind} to be recorded`)
    }
    return record
}

const waitForCommandOutcomeById = async (brokerUrl, commandId) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 10000) {
        const snapshot = await getJson(`${brokerUrl}/snapshot`)
        const outcome = snapshot.state.commandOutcomes[commandId]
        if (outcome !== undefined) {
            return outcome
        }
        await delay(250)
    }
    throw new Error(`Timed out waiting for command outcome ${commandId}`)
}

const waitForPendingWorkState = async (brokerUrl, expectedSession, expected) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 10000) {
        const snapshot = await getJson(`${brokerUrl}/snapshot`)
        const session = snapshot.sessions.find(
            (candidate) =>
                candidate.sessionId === expectedSession.sessionId && candidate.sessionEpoch === expectedSession.sessionEpoch,
        )
        const approvalCount = Object.values(snapshot.state.pendingApprovals).filter(
            (approval) => approval.sessionId === expectedSession.sessionId && approval.sessionEpoch === expectedSession.sessionEpoch,
        ).length
        const inputCount = Object.values(snapshot.state.requestedInputs).filter(
            (input) => input.sessionId === expectedSession.sessionId && input.sessionEpoch === expectedSession.sessionEpoch,
        ).length
        if (
            session !== undefined &&
            session.pendingApprovalIds.length === expected.approvalCount &&
            session.pendingInputIds.length === expected.inputCount &&
            approvalCount === expected.approvalCount &&
            inputCount === expected.inputCount
        ) {
            return
        }
        await delay(250)
    }
    throw new Error(
        `Timed out waiting for pending work counts approvals=${String(expected.approvalCount)} inputs=${String(expected.inputCount)}`,
    )
}

const waitForElementCount = async (uiBrowser, session, selector, expectedCount) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 10000) {
        const raw = await ui(uiBrowser, session, ["eval", `(() => document.querySelectorAll(${JSON.stringify(selector)}).length)()`])
        if (Number(raw) === expectedCount) {
            return
        }
        await delay(250)
    }
    throw new Error(`Timed out waiting for ${selector} count ${String(expectedCount)}`)
}

const clickButtonByText = async (uiBrowser, session, label) => {
    await ui(uiBrowser, session, [
        "eval",
        `(() => { const label = ${JSON.stringify(label)}; const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.innerText.trim() === label); if (!button) throw new Error(label + ' button not found'); button.click(); return true; })()`,
    ])
}

const selectRequestedInputOption = async (uiBrowser, session, label) => {
    await ui(uiBrowser, session, [
        "eval",
        `(() => { const label = ${JSON.stringify(label)}; const row = Array.from(document.querySelectorAll('label.choice-row')).find((candidate) => candidate.innerText.includes(label)); if (!row) throw new Error(label + ' option not found'); const input = row.querySelector('input'); if (!input) throw new Error(label + ' radio not found'); input.click(); return true; })()`,
    ])
}

const fillRequestedInputNote = async (uiBrowser, session, note) => {
    await ui(uiBrowser, session, [
        "eval",
        `(() => { const textarea = document.querySelector('#input-freeform'); if (!textarea) throw new Error('Input note textarea not found'); const value = ${JSON.stringify(note)}; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter.call(textarea, value); textarea.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    ])
}

const waitForSubmittedInputAnswer = async (brokerUrl, expectedSession, questionId, value) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 10000) {
        const snapshot = await getJson(`${brokerUrl}/commands`)
        const command = snapshot.commands.find(
            (record) =>
                record.command.kind === "request_user_input_response" &&
                record.command.sessionId === expectedSession.sessionId &&
                record.command.sessionEpoch === expectedSession.sessionEpoch,
        )?.command
        const answer = command?.answers?.find((candidate) => candidate.questionId === questionId)
        if (answer?.value === value) {
            return
        }
        await delay(250)
    }
    throw new Error(`Timed out waiting for submitted requested-input answer ${questionId}`)
}

const sendReply = async (uiBrowser, session, message) => {
    await ui(uiBrowser, session, [
        "eval",
        `(() => { const textarea = document.querySelector('#session-reply'); if (!textarea) throw new Error('Reply textarea not found'); const value = ${JSON.stringify(message)}; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter.call(textarea, value); textarea.dispatchEvent(new Event('input', { bubbles: true })); const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.innerText.trim() === 'Send'); if (!button) throw new Error('Send button not found'); button.click(); return true; })()`,
    ])
}

const clickEndSessionButton = async (uiBrowser, session) => {
    await clickFirstCommandButton(uiBrowser, session, "End")
    await ui(uiBrowser, session, [
        "eval",
        "(() => { const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.innerText.trim() === 'End session'); if (!button) throw new Error('End session confirmation button not found'); button.click(); return true; })()",
    ])
}

const waitForCommandHistoryEntry = async (uiBrowser, session, expected) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 10000) {
        const raw = await ui(uiBrowser, session, [
            "eval",
            "(() => Array.from(document.querySelectorAll('.command-history-row')).map((row) => ({ state: row.querySelector('.command-state')?.textContent?.trim() ?? '', label: row.querySelector('strong')?.textContent?.trim() ?? '', detail: row.querySelector('p')?.textContent?.trim() ?? '' })))()",
        ])
        const entries = JSON.parse(raw)
        const entry = entries.find((candidate) => candidate.label === expected.label && candidate.state === expected.state)
        if (entry !== undefined && entry.detail.includes(expected.detail)) {
            return
        }
        await delay(250)
    }

    throw new Error(`Timed out waiting for command history entry ${expected.label} / ${expected.state} / ${expected.detail}`)
}

const assertEqual = (actual, expected, label) => {
    if (actual !== expected) {
        throw new Error(`Expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

const assertIncludes = (actual, expected, label) => {
    if (typeof actual !== "string" || !actual.includes(expected)) {
        throw new Error(`Expected ${label} to include ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
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
