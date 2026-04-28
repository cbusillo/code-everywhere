import * as Dialog from "@radix-ui/react-dialog"
import type {
    CommandOutcome,
    PendingApproval,
    RequestedInput,
    SessionCommand,
    SessionStatus,
    SessionTurn,
    TurnStatus,
    TurnStep,
} from "@code-everywhere/contracts"
import type { CockpitCommandRecord } from "@code-everywhere/server"
import {
    AlertCircle,
    Bell,
    Check,
    ChevronRight,
    CirclePause,
    CirclePlay,
    Clock3,
    GitBranch,
    History,
    Hourglass,
    Info,
    MessageSquareText,
    MonitorDot,
    OctagonAlert,
    Pause,
    Play,
    Send,
    ShieldAlert,
    Square,
    TerminalSquare,
    X,
} from "lucide-react"
import { useMemo, useState } from "react"

import { canPostCockpitCommand, postCockpitCommand } from "./cockpitCommands"
import { getAttentionSessions, statusLabels, type CockpitSession } from "./cockpitData"
import {
    getDraftValue,
    getRequestedInputAnswers,
    getRequestedInputAnswerValues,
    setDraftValue,
    setRequestedInputAnswerValue,
    type DraftMap,
} from "./cockpitDrafts"
import { describeTransportStatus, useCockpitView, type CockpitTransportStatus } from "./cockpitTransport"

const selectedSessionId = "ce-alpha"

type IconComponent = typeof CirclePlay

type CommandHistoryEntry = {
    id: string
    label: string
    state: "queued" | "delivered" | "accepted" | "rejected"
    timestamp: string
    detail: string
}

const statusIcon: Record<SessionStatus, IconComponent> = {
    running: CirclePlay,
    idle: Clock3,
    blocked: ShieldAlert,
    "waiting-for-input": MessageSquareText,
    "waiting-for-approval": Hourglass,
    ended: Square,
    error: OctagonAlert,
}

const statusTone: Record<SessionStatus, string> = {
    running: "is-running",
    idle: "is-idle",
    blocked: "is-blocked",
    "waiting-for-input": "is-waiting-input",
    "waiting-for-approval": "is-waiting-approval",
    ended: "is-ended",
    error: "is-error",
}

const stepTone: Record<TurnStep["state"], string> = {
    pending: "is-pending",
    running: "is-running",
    completed: "is-completed",
    blocked: "is-blocked",
    error: "is-error",
}

const turnRailTone: Record<TurnStatus, string> = {
    running: "is-running",
    completed: "is-completed",
    blocked: "is-blocked",
    "waiting-for-input": "is-waiting-input",
    "waiting-for-approval": "is-waiting-approval",
    error: "is-error",
}

export const App = () => {
    const cockpitView = useCockpitView()
    const cockpit = cockpitView.fixture
    const [activeSessionId, setActiveSessionId] = useState(selectedSessionId)
    const [replyDrafts, setReplyDrafts] = useState<DraftMap>({})
    const [inputAnswerDrafts, setInputAnswerDrafts] = useState<DraftMap>({})
    const [commandLog, setCommandLog] = useState("No command sent yet")
    const fallbackSession = cockpit.sessions[0]
    const activeSession =
        fallbackSession === undefined
            ? undefined
            : (cockpit.sessions.find((session) => session.sessionId === activeSessionId) ?? fallbackSession)
    const attentionSessions = useMemo(() => getAttentionSessions(cockpit.sessions), [cockpit.sessions])
    const activeApproval = cockpit.approvals.find((approval) => approval.sessionId === activeSession?.sessionId)
    const activeInput = cockpit.requestedInputs.find((input) => input.sessionId === activeSession?.sessionId)
    const activeCommandHistory = getCommandHistoryEntries(cockpit.commands, cockpit.commandOutcomes, activeSession)
    const reply = getDraftValue(replyDrafts, activeSession?.sessionId)
    const inputAnswerValues = getRequestedInputAnswerValues(inputAnswerDrafts, activeInput)

    const setReply = (value: string) => {
        if (activeSession === undefined) {
            return
        }

        setReplyDrafts((drafts) => setDraftValue(drafts, activeSession.sessionId, value))
    }

    const setInputAnswer = (questionId: string, value: string) => {
        if (activeInput === undefined) {
            return
        }

        setInputAnswerDrafts((drafts) => setRequestedInputAnswerValue(drafts, activeInput.id, questionId, value))
    }

    const dispatchCommand = (label: string, command: SessionCommand) => {
        if (!canPostCockpitCommand(cockpitView.transport)) {
            setCommandLog(`${label} requires a live HTTP snapshot for ${command.sessionId}`)
            return
        }

        setCommandLog(`Sending ${label} for ${command.sessionId} at epoch ${command.sessionEpoch}`)
        void postCockpitCommand(cockpitView.transport.url, command)
            .then((snapshot) => {
                const pendingCount = snapshot.commands.filter((record) => record.deliveredAt === null).length
                setCommandLog(
                    `${label} sent for ${command.sessionId} at epoch ${command.sessionEpoch}; ${String(pendingCount)} pending, ${String(snapshot.commandCount)} retained`,
                )
            })
            .catch((error: unknown) => {
                setCommandLog(`${label} failed: ${error instanceof Error ? error.message : "Unable to send command"}`)
            })
    }

    return (
        <main className="app-shell">
            <div className="app-frame">
                <header className="cockpit-header">
                    <div>
                        <p className="eyebrow">Code Everywhere</p>
                    </div>
                    <div className="header-actions">
                        <TransportSummary status={cockpitView.transport} />
                        <StatusSummary count={attentionSessions.length} />
                        <button
                            className="icon-button"
                            type="button"
                            aria-label="Open notification center"
                            title="Notification center"
                        >
                            <Bell size={18} />
                        </button>
                    </div>
                </header>

                <section className="cockpit-grid" aria-label="Every Code sessions cockpit">
                    <SessionList
                        sessions={cockpit.sessions}
                        activeSessionId={activeSession?.sessionId ?? ""}
                        onSelect={setActiveSessionId}
                    />
                    {activeSession === undefined ? (
                        <>
                            <EmptySessionDetail transport={cockpitView.transport} />
                            <EmptyActionRail transport={cockpitView.transport} commandLog={commandLog} />
                        </>
                    ) : (
                        <>
                            <SessionDetail
                                session={activeSession}
                                reply={reply}
                                setReply={setReply}
                                dispatchCommand={dispatchCommand}
                            />
                            <ActionRail
                                session={activeSession}
                                approval={activeApproval}
                                requestedInput={activeInput}
                                inputAnswerValues={inputAnswerValues}
                                setInputAnswer={setInputAnswer}
                                commandLog={commandLog}
                                commandHistory={activeCommandHistory}
                                dispatchCommand={dispatchCommand}
                            />
                        </>
                    )}
                </section>
            </div>
        </main>
    )
}

type SessionListProps = {
    sessions: CockpitSession[]
    activeSessionId: string
    onSelect: (sessionId: string) => void
}

const SessionList = ({ sessions, activeSessionId, onSelect }: SessionListProps) => (
    <aside className="panel session-list" aria-label="Sessions">
        <div className="panel-heading">
            <div>
                <p className="eyebrow">Trusted sessions</p>
                <h2>Attention queue</h2>
            </div>
            <span className="count-badge">{sessions.length}</span>
        </div>

        <div className="session-stack">
            {sessions.length === 0 ? (
                <div className="empty-state session-empty">
                    <Check size={16} />
                    <p>No trusted sessions in this snapshot.</p>
                </div>
            ) : null}
            {sessions.map((session) => (
                <button
                    className={`session-row ${statusTone[session.status]} ${session.sessionId === activeSessionId ? "is-active" : ""}`}
                    key={session.sessionId}
                    type="button"
                    onClick={() => onSelect(session.sessionId)}
                >
                    <span className="status-dot" aria-hidden="true" />
                    <span className="session-id">{session.sessionId}</span>
                    <span className="session-title">{session.summary}</span>
                    <StatusPill status={session.status} compact />
                    <span className="session-updated">{formatTime(session.updatedAt)}</span>
                    <ChevronRight className="session-chevron" size={14} aria-hidden="true" />
                    <span className="session-meta">
                        {session.hostLabel} <span aria-hidden="true">/</span> {session.branch ?? "detached"}
                    </span>
                </button>
            ))}
        </div>
    </aside>
)

const EmptySessionDetail = ({ transport }: { transport: CockpitTransportStatus }) => (
    <section className="panel detail-panel empty-cockpit-panel" aria-label="Active session detail">
        <div className="empty-cockpit-card">
            <p className="eyebrow">{describeTransportStatus(transport)}</p>
            <h2>No active sessions</h2>
            <p>The current snapshot is connected and healthy, but it does not contain any trusted Every Code sessions yet.</p>
        </div>
    </section>
)

const EmptyActionRail = ({ transport, commandLog }: { transport: CockpitTransportStatus; commandLog: string }) => (
    <aside className="action-rail" aria-label="Pending work and actions">
        <section className="panel work-panel priority-panel">
            <div className="panel-heading">
                <div>
                    <p className="eyebrow">Pending work</p>
                    <h2>Next action</h2>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
            </div>
            <div className="empty-state">
                <Check size={16} />
                <p>
                    No pending approval or requested input in the current {describeTransportStatus(transport).toLowerCase()}{" "}
                    snapshot.
                </p>
            </div>
        </section>

        <section className="panel work-panel">
            <div className="panel-heading">
                <div>
                    <p className="eyebrow">Status</p>
                    <h2>Session control</h2>
                </div>
            </div>
            <div className="mock-log">
                <span>Mock command</span>
                <p>{commandLog}</p>
            </div>
        </section>
    </aside>
)

type ScopedCommandKind = Extract<
    SessionCommand["kind"],
    "continue_autonomously" | "pause_current_turn" | "end_session" | "status_request"
>

const createScopedCommand = (session: CockpitSession, kind: ScopedCommandKind): SessionCommand => ({
    kind,
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
})

type SessionDetailProps = {
    session: CockpitSession
    reply: string
    setReply: (value: string) => void
    dispatchCommand: (label: string, command: SessionCommand) => void
}

const SessionDetail = ({ session, reply, setReply, dispatchCommand }: SessionDetailProps) => (
    <section className="panel detail-panel" aria-label="Active session detail">
        <div className="detail-header">
            <div className="detail-title-block">
                <div className="detail-status-row">
                    <StatusPill status={session.status} />
                    <span className="session-id">{session.sessionId}</span>
                    <span>epoch {session.sessionEpoch}</span>
                </div>
                <h2>{session.summary}</h2>
                <p>Last update {formatTime(session.updatedAt)}. Commands attach to the current session epoch.</p>
            </div>
            <div className="session-actions" aria-label="Session commands">
                <ActionButton
                    icon={MessageSquareText}
                    label="Status"
                    onClick={() => dispatchCommand("Status request", createScopedCommand(session, "status_request"))}
                />
                <ActionButton
                    icon={Pause}
                    label="Pause"
                    onClick={() => dispatchCommand("Pause", createScopedCommand(session, "pause_current_turn"))}
                />
                <ActionButton
                    icon={Play}
                    label="Continue"
                    onClick={() => dispatchCommand("Continue", createScopedCommand(session, "continue_autonomously"))}
                />
                <EndSessionButton onEnd={() => dispatchCommand("End session", createScopedCommand(session, "end_session"))} />
            </div>
        </div>

        <div className="metadata-strip" aria-label="Session metadata">
            <MetadataItem icon={MonitorDot} label="Host" value={`${session.hostLabel} / pid ${String(session.pid)}`} />
            <MetadataItem icon={GitBranch} label="Branch" value={session.branch ?? "detached"} />
            <MetadataItem icon={TerminalSquare} label="Working directory" value={session.cwd} />
            <MetadataItem icon={Info} label="Model" value={session.model} />
        </div>

        <section className="reply-box" aria-label="Reply to active session">
            <label htmlFor="session-reply">Reply</label>
            <div className="reply-row">
                <textarea
                    id="session-reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Send a structured reply into this Every Code session..."
                />
                <button
                    className="primary-button"
                    type="button"
                    onClick={() =>
                        dispatchCommand(reply.trim() === "" ? "Empty reply" : "Reply", {
                            kind: "reply",
                            sessionId: session.sessionId,
                            sessionEpoch: session.sessionEpoch,
                            content: reply.trim(),
                        })
                    }
                >
                    <Send size={16} />
                    Send
                </button>
            </div>
        </section>

        <section className="timeline" aria-label="Turn timeline">
            <div className="timeline-heading">
                <div>
                    <p className="eyebrow">Turn timeline</p>
                    <h3>Activity</h3>
                </div>
                <span>{session.turns.length} turns</span>
            </div>
            {session.turns.map((turn) => (
                <TurnCard key={turn.id} turn={turn} />
            ))}
        </section>
    </section>
)

type ActionRailProps = {
    session: CockpitSession
    approval: PendingApproval | undefined
    requestedInput: RequestedInput | undefined
    inputAnswerValues: Record<string, string>
    setInputAnswer: (questionId: string, value: string) => void
    commandLog: string
    commandHistory: CommandHistoryEntry[]
    dispatchCommand: (label: string, command: SessionCommand) => void
}

const ActionRail = ({
    session,
    approval,
    requestedInput,
    inputAnswerValues,
    setInputAnswer,
    commandLog,
    commandHistory,
    dispatchCommand,
}: ActionRailProps) => (
    <aside className="action-rail" aria-label="Pending work and actions">
        <section className="panel work-panel priority-panel">
            <div className="panel-heading">
                <div>
                    <p className="eyebrow">Pending work</p>
                    <h2>Next action</h2>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
            </div>

            {approval === undefined && requestedInput === undefined ? (
                <div className="empty-state">
                    <Check size={18} />
                    <p>No pending approval or requested input for this session.</p>
                </div>
            ) : null}

            {approval === undefined ? null : <ApprovalCard approval={approval} dispatchCommand={dispatchCommand} />}
            {requestedInput === undefined ? null : (
                <RequestedInputCard
                    input={requestedInput}
                    values={inputAnswerValues}
                    setValue={setInputAnswer}
                    dispatchCommand={dispatchCommand}
                />
            )}
        </section>

        <section className="panel work-panel">
            <div className="panel-heading compact-heading">
                <div>
                    <p className="eyebrow">Status</p>
                    <h2>Session control</h2>
                </div>
            </div>
            <div className="command-grid">
                <ActionButton
                    icon={CirclePause}
                    label="Pause"
                    onClick={() => dispatchCommand("Pause", createScopedCommand(session, "pause_current_turn"))}
                />
                <ActionButton
                    icon={CirclePlay}
                    label="Continue"
                    onClick={() => dispatchCommand("Continue", createScopedCommand(session, "continue_autonomously"))}
                />
                <ActionButton
                    icon={History}
                    label="Status"
                    onClick={() => dispatchCommand("Status request", createScopedCommand(session, "status_request"))}
                />
                <EndSessionButton onEnd={() => dispatchCommand("End session", createScopedCommand(session, "end_session"))} />
            </div>
            <div className="mock-log" aria-live="polite">
                <span>Command status</span>
                <p>{commandLog}</p>
                <CommandHistory entries={commandHistory} />
            </div>
            <div className="epoch-note">
                <AlertCircle size={16} />
                <p>Commands target {session.sessionEpoch}; stale epochs are rejected by the active Every Code session.</p>
            </div>
        </section>
    </aside>
)

const ApprovalCard = ({
    approval,
    dispatchCommand,
}: {
    approval: PendingApproval
    dispatchCommand: (label: string, command: SessionCommand) => void
}) => (
    <article className="decision-card approval-card">
        <div className="decision-title">
            <ShieldAlert size={18} />
            <div>
                <h3>{approval.title}</h3>
                <p>
                    {formatTime(approval.requestedAt)} / {approval.risk} risk
                </p>
            </div>
        </div>
        <p>{approval.body}</p>
        <code>{approval.command}</code>
        <div className="decision-actions">
            <button
                className="primary-button"
                type="button"
                onClick={() =>
                    dispatchCommand(`Approve ${approval.id}`, {
                        kind: "approval_decision",
                        sessionId: approval.sessionId,
                        sessionEpoch: approval.sessionEpoch,
                        approvalId: approval.id,
                        decision: "approve",
                    })
                }
            >
                <Check size={16} />
                Approve
            </button>
            <button
                className="quiet-button danger"
                type="button"
                onClick={() =>
                    dispatchCommand(`Deny ${approval.id}`, {
                        kind: "approval_decision",
                        sessionId: approval.sessionId,
                        sessionEpoch: approval.sessionEpoch,
                        approvalId: approval.id,
                        decision: "deny",
                    })
                }
            >
                <X size={16} />
                Deny
            </button>
        </div>
    </article>
)

type RequestedInputCardProps = {
    input: RequestedInput
    values: Record<string, string>
    setValue: (questionId: string, value: string) => void
    dispatchCommand: (label: string, command: SessionCommand) => void
}

const RequestedInputCard = ({ input, values, setValue, dispatchCommand }: RequestedInputCardProps) => {
    if (input.questions.length === 0) {
        return null
    }

    return (
        <article className="decision-card input-card">
            <div className="decision-title">
                <MessageSquareText size={18} />
                <div>
                    <h3>{input.title}</h3>
                    <p>{formatTime(input.requestedAt)}</p>
                </div>
            </div>
            {input.questions.map((question) => (
                <fieldset key={question.id}>
                    <legend>{question.prompt}</legend>
                    {question.options.map((option) => (
                        <label className="choice-row" key={option.value}>
                            <input
                                type="radio"
                                name={`${input.id}-${question.id}`}
                                value={option.value}
                                checked={values[question.id] === option.value}
                                onChange={() => setValue(question.id, option.value)}
                            />
                            <span>
                                <strong>{option.label}</strong>
                                <small>{option.description}</small>
                            </span>
                        </label>
                    ))}
                </fieldset>
            ))}
            <label className="freeform-label" htmlFor="input-freeform">
                Optional note
            </label>
            <textarea id="input-freeform" placeholder="Add context for the session..." />
            <button
                className="primary-button full-width"
                type="button"
                onClick={() =>
                    dispatchCommand(`Submit input ${input.id}`, {
                        kind: "request_user_input_response",
                        sessionId: input.sessionId,
                        sessionEpoch: input.sessionEpoch,
                        turnId: input.turnId,
                        answers: getRequestedInputAnswers(input, values),
                    })
                }
            >
                <Send size={16} />
                Submit input
            </button>
        </article>
    )
}

const TurnCard = ({ turn }: { turn: SessionTurn }) => (
    <article className="turn-card">
        <div className="turn-rail">
            <span className={`step-dot ${turnRailTone[turn.status]}`} />
        </div>
        <div className="turn-header">
            <div>
                <span className={`turn-status is-${turn.status}`}>{turn.status.replaceAll("-", " ")}</span>
                <h4>{turn.title}</h4>
            </div>
            <span>{formatTime(turn.startedAt)}</span>
        </div>
        <p>{turn.summary}</p>
        <div className="step-list">
            {turn.steps.map((step) => (
                <div className="step-row" key={step.id}>
                    <span className={`step-dot ${stepTone[step.state]}`} aria-hidden="true" />
                    <div>
                        <strong>{step.title}</strong>
                        <p>{step.detail}</p>
                    </div>
                    <span>{formatTime(step.timestamp)}</span>
                </div>
            ))}
        </div>
    </article>
)

const StatusPill = ({ status, compact = false }: { status: SessionStatus; compact?: boolean }) => {
    const Icon = statusIcon[status]

    return (
        <span className={`status-pill ${statusTone[status]} ${compact ? "is-compact" : ""}`}>
            <span className="status-dot" aria-hidden="true" />
            <Icon size={compact ? 12 : 14} />
            {statusLabels[status]}
        </span>
    )
}

const StatusSummary = ({ count }: { count: number }) => (
    <div className="status-summary">
        <span>{count}</span>
        <p>sessions need attention</p>
    </div>
)

const TransportSummary = ({ status }: { status: CockpitTransportStatus }) => (
    <div className={`transport-summary is-${status.mode}`} title={status.error ?? status.url ?? describeTransportStatus(status)}>
        <span aria-hidden="true" />
        <p>{describeTransportStatus(status)}</p>
    </div>
)

const MetadataItem = ({ icon: Icon, label, value }: { icon: IconComponent; label: string; value: string }) => (
    <div className="metadata-item">
        <Icon size={16} />
        <span>{label}</span>
        <strong>{value}</strong>
    </div>
)

const ActionButton = ({ icon: Icon, label, onClick }: { icon: IconComponent; label: string; onClick: () => void }) => (
    <button className="quiet-button" type="button" onClick={onClick} title={label}>
        <Icon size={16} />
        {label}
    </button>
)

const EndSessionButton = ({ onEnd }: { onEnd: () => void }) => (
    <Dialog.Root>
        <Dialog.Trigger asChild>
            <button className="quiet-button danger" type="button">
                <Square size={16} />
                End
            </button>
        </Dialog.Trigger>
        <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content">
                <Dialog.Title>End this session?</Dialog.Title>
                <Dialog.Description>
                    This control sends an epoch-scoped end command when the local HTTP transport is live.
                </Dialog.Description>
                <div className="dialog-actions">
                    <Dialog.Close asChild>
                        <button className="quiet-button" type="button">
                            Cancel
                        </button>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                        <button className="primary-button danger-fill" type="button" onClick={onEnd}>
                            End session
                        </button>
                    </Dialog.Close>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
)

const CommandHistory = ({ entries }: { entries: CommandHistoryEntry[] }) => {
    if (entries.length === 0) {
        return <p>No retained commands for this session.</p>
    }

    return (
        <div className="command-history" aria-label="Recent command history">
            {entries.map((entry) => (
                <div className="command-history-row" key={entry.id}>
                    <span className={`command-state is-${entry.state}`}>{entry.state}</span>
                    <div>
                        <strong>{entry.label}</strong>
                        <p>
                            {formatTime(entry.timestamp)} / {entry.detail}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    )
}

const getCommandHistoryEntries = (
    commands: CockpitCommandRecord[],
    outcomes: CommandOutcome[],
    session: CockpitSession | undefined,
): CommandHistoryEntry[] => {
    if (session === undefined) {
        return []
    }

    const outcomesByCommandId = new Map(outcomes.map((outcome) => [outcome.commandId, outcome]))
    const entries = commands
        .filter((record) => record.command.sessionId === session.sessionId && record.command.sessionEpoch === session.sessionEpoch)
        .map((record): CommandHistoryEntry => {
            const outcome = outcomesByCommandId.get(record.id)
            const state = outcome?.status ?? (record.deliveredAt === null ? "queued" : "delivered")
            const timestamp = outcome?.handledAt ?? record.deliveredAt ?? record.receivedAt
            const detail = outcome?.reason ?? (record.deliveredAt === null ? "Waiting for Every Code" : "Claimed by Every Code")

            return {
                id: record.id,
                label: formatCommandKind(record.command.kind),
                state,
                timestamp,
                detail,
            }
        })

    const knownCommandIds = new Set(commands.map((record) => record.id))
    const outcomeOnlyEntries = outcomes
        .filter(
            (outcome) =>
                outcome.sessionId === session.sessionId &&
                outcome.sessionEpoch === session.sessionEpoch &&
                !knownCommandIds.has(outcome.commandId),
        )
        .map(
            (outcome): CommandHistoryEntry => ({
                id: outcome.commandId,
                label: formatCommandKind(outcome.commandKind),
                state: outcome.status,
                timestamp: outcome.handledAt,
                detail: outcome.reason ?? "Outcome reported by Every Code",
            }),
        )

    return [...entries, ...outcomeOnlyEntries].sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 5)
}

const formatCommandKind = (kind: SessionCommand["kind"]): string =>
    kind
        .split("_")
        .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
        .join(" ")

const formatTime = (iso: string): string =>
    new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso))
