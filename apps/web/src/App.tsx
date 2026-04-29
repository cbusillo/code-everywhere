import * as Dialog from "@radix-ui/react-dialog"
import type {
    PendingApproval,
    RequestedInput,
    SessionCommand,
    SessionStatus,
    SessionTurn,
    TurnStatus,
    TurnStep,
} from "@code-everywhere/contracts"
import type { LocalHostTrustRecord, LocalTrustRegistrySnapshot } from "@code-everywhere/server/trust"
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
    ShieldCheck,
    ShieldQuestion,
    Square,
    TerminalSquare,
    X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { canPostCockpitCommand, postCockpitCommand } from "./cockpitCommands"
import {
    getAttentionSessions,
    getCommandHistoryEntries,
    getCommandOutcomeSummary,
    getOperatorAttentionSummary,
    getSessionDetailSummary,
    hasActionableRequestedInput,
    statusLabels,
    type CockpitSession,
    type CommandHistoryEntry,
    type CommandOutcomeSummary,
    type OperatorAttentionItem,
    type OperatorAttentionKind,
    type OperatorAttentionSummary,
    type SessionDetailSummary,
    type TurnStepSummary,
} from "./cockpitData"
import {
    getDraftValue,
    getRequestedInputAnswers,
    getRequestedInputAnswerValues,
    getRequestedInputNoteValue,
    setDraftValue,
    setRequestedInputAnswerValue,
    setRequestedInputNoteValue,
    type DraftMap,
} from "./cockpitDrafts"
import { describeTransportStatus, useCockpitView, type CockpitTransportStatus } from "./cockpitTransport"
import { canManageTrust, fetchLocalTrustRegistry, postRevokedHost, postRevokedHostId, postTrustedHost } from "./cockpitTrust"

const selectedSessionId = "ce-alpha"

type IconComponent = typeof CirclePlay

type CockpitStateSurface = {
    tone: "info" | "warning" | "success"
    title: string
    detail: string
}

type TrustRegistryState = {
    snapshot: LocalTrustRegistrySnapshot | null
    status: "unavailable" | "loading" | "ready" | "error"
    message: string
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

type SessionTrustStatus = CockpitSession["trust"]["status"]

const trustLabels: Record<SessionTrustStatus, string> = {
    trusted: "Trusted",
    unknown: "Unknown host",
    revoked: "Revoked host",
    unidentified: "No host id",
}

const compactTrustLabels: Record<SessionTrustStatus, string> = {
    trusted: "Trusted",
    unknown: "Unknown",
    revoked: "Revoked",
    unidentified: "No ID",
}

const trustTone: Record<SessionTrustStatus, string> = {
    trusted: "is-trusted",
    unknown: "is-unknown",
    revoked: "is-revoked",
    unidentified: "is-unidentified",
}

const stepTone: Record<TurnStep["state"], string> = {
    pending: "is-pending",
    running: "is-running",
    completed: "is-completed",
    blocked: "is-blocked",
    error: "is-error",
}

const stepKindIcon: Record<TurnStep["kind"], IconComponent> = {
    message: MessageSquareText,
    tool: TerminalSquare,
    status: Info,
    diff: GitBranch,
    artifact: MonitorDot,
    error: OctagonAlert,
}

const stepKindLabel: Record<TurnStep["kind"], string> = {
    message: "Message",
    tool: "Tool",
    status: "Status",
    diff: "Diff",
    artifact: "Artifact",
    error: "Error",
}

const stepKindOrder: TurnStep["kind"][] = ["message", "tool", "diff", "artifact", "status", "error"]

const turnRailTone: Record<TurnStatus, string> = {
    running: "is-running",
    completed: "is-completed",
    blocked: "is-blocked",
    "waiting-for-input": "is-waiting-input",
    "waiting-for-approval": "is-waiting-approval",
    error: "is-error",
}

const attentionLabels: Record<OperatorAttentionKind, string> = {
    approval: "Approvals",
    input: "Inputs",
    error: "Errors",
    blocked: "Blocked",
    "stale-command": "Stale",
    "rejected-command": "Rejected",
}

const attentionIcon: Record<OperatorAttentionKind, IconComponent> = {
    approval: ShieldAlert,
    input: MessageSquareText,
    error: OctagonAlert,
    blocked: AlertCircle,
    "stale-command": History,
    "rejected-command": X,
}

export const App = () => {
    const cockpitView = useCockpitView()
    const cockpit = cockpitView.fixture
    const [activeSessionId, setActiveSessionId] = useState(selectedSessionId)
    const [activePendingItemId, setActivePendingItemId] = useState<string | null>(null)
    const [replyDrafts, setReplyDrafts] = useState<DraftMap>({})
    const [inputAnswerDrafts, setInputAnswerDrafts] = useState<DraftMap>({})
    const [commandLog, setCommandLog] = useState("No command sent yet")
    const [trustLog, setTrustLog] = useState("No trust action sent yet")
    const [trustRegistry, setTrustRegistry] = useState<TrustRegistryState>({
        snapshot: null,
        status: "unavailable",
        message: "Connect to a live broker to review local trust records.",
    })
    const fallbackSession = cockpit.sessions[0]
    const activeSession =
        fallbackSession === undefined
            ? undefined
            : (cockpit.sessions.find((session) => session.sessionId === activeSessionId) ?? fallbackSession)
    const attentionSessions = useMemo(() => getAttentionSessions(cockpit.sessions), [cockpit.sessions])
    const attentionSummary = useMemo(() => getOperatorAttentionSummary(cockpit), [cockpit])
    const stateSurface = useMemo(() => getCockpitStateSurface(cockpit, cockpitView.transport), [cockpit, cockpitView.transport])
    const sessionApprovals = cockpit.approvals.filter((approval) => approval.sessionId === activeSession?.sessionId)
    const sessionInputs = cockpit.requestedInputs.filter(
        (input) => input.sessionId === activeSession?.sessionId && hasActionableRequestedInput(input),
    )
    const selectedApproval = sessionApprovals.find((approval) => approval.id === activePendingItemId)
    const selectedInput = sessionInputs.find((input) => input.id === activePendingItemId)
    const activeApproval =
        activePendingItemId === null || selectedApproval !== undefined ? (selectedApproval ?? sessionApprovals[0]) : undefined
    const activeInput = activePendingItemId === null || selectedInput !== undefined ? (selectedInput ?? sessionInputs[0]) : undefined
    const activeCommandHistory = getCommandHistoryEntries(cockpit.commands, cockpit.commandOutcomes, activeSession)
    const activeCommandOutcomeSummary = getCommandOutcomeSummary(cockpit.commands, cockpit.commandOutcomes, activeSession)
    const reply = getDraftValue(replyDrafts, activeSession?.sessionId)
    const inputAnswerValues = getRequestedInputAnswerValues(inputAnswerDrafts, activeInput)
    const inputNote = getRequestedInputNoteValue(inputAnswerDrafts, activeInput)

    useEffect(() => {
        if (!canManageTrust(cockpitView.transport)) {
            setTrustRegistry((current) => ({
                snapshot: current.snapshot,
                status: "unavailable",
                message:
                    current.snapshot === null
                        ? "Connect to a live broker to review local trust records."
                        : "Showing last loaded trust records while the broker is unavailable.",
            }))
            return undefined
        }

        let isActive = true
        const transportUrl = cockpitView.transport.url
        setTrustRegistry((current) => ({
            snapshot: current.snapshot,
            status: current.snapshot === null ? "loading" : "ready",
            message: current.snapshot === null ? "Loading local trust records..." : "Local trust records loaded.",
        }))
        void fetchLocalTrustRegistry(transportUrl)
            .then((snapshot) => {
                if (!isActive) {
                    return
                }
                setTrustRegistry({ snapshot, status: "ready", message: "Local trust records loaded." })
            })
            .catch((error: unknown) => {
                if (!isActive) {
                    return
                }
                setTrustRegistry((current) => ({
                    snapshot: current.snapshot,
                    status: "error",
                    message: error instanceof Error ? error.message : "Unable to load local trust records.",
                }))
            })

        return () => {
            isActive = false
        }
    }, [cockpitView.transport])

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

    const setInputNote = (value: string) => {
        if (activeInput === undefined) {
            return
        }

        setInputAnswerDrafts((drafts) => setRequestedInputNoteValue(drafts, activeInput.id, value))
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

    const dispatchTrustAction = (label: string, session: CockpitSession, action: "trust" | "revoke") => {
        if (!canManageTrust(cockpitView.transport)) {
            setTrustLog(`${label} requires a live HTTP broker`)
            return
        }

        setTrustLog(`Sending ${label} for ${session.hostLabel}`)
        const request = action === "trust" ? postTrustedHost : postRevokedHost
        void request(cockpitView.transport.url, session)
            .then((snapshot) => {
                const host =
                    session.hostId === undefined
                        ? undefined
                        : snapshot.hosts.find((candidate) => candidate.hostId === session.hostId)
                setTrustRegistry({ snapshot, status: "ready", message: "Local trust records loaded." })
                setTrustLog(`${label} saved for ${session.hostLabel}; ${host?.status ?? "host record updated"}`)
            })
            .catch((error: unknown) => {
                setTrustLog(`${label} failed: ${error instanceof Error ? error.message : "Unable to update trust"}`)
            })
    }

    const dispatchTrustHostRevoke = (host: LocalHostTrustRecord) => {
        if (!canManageTrust(cockpitView.transport)) {
            setTrustLog(`Revoke host requires a live HTTP broker`)
            return
        }

        setTrustLog(`Sending revoke for ${host.label}`)
        void postRevokedHostId(cockpitView.transport.url, host.hostId)
            .then((snapshot) => {
                const updatedHost = snapshot.hosts.find((candidate) => candidate.hostId === host.hostId)
                setTrustRegistry({ snapshot, status: "ready", message: "Local trust records loaded." })
                setTrustLog(`Revoke host saved for ${host.label}; ${updatedHost?.status ?? "host record updated"}`)
            })
            .catch((error: unknown) => {
                setTrustLog(`Revoke host failed: ${error instanceof Error ? error.message : "Unable to update trust"}`)
            })
    }

    const selectSession = (sessionId: string) => {
        setActiveSessionId(sessionId)
        setActivePendingItemId(null)
    }

    const selectAttentionItem = (item: OperatorAttentionItem) => {
        setActiveSessionId(item.sessionId)
        setActivePendingItemId(item.pendingItemId ?? null)
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

                <CockpitStateBanner surface={stateSurface} />

                <AttentionOverview summary={attentionSummary} onSelectItem={selectAttentionItem} />

                <section className="cockpit-grid" aria-label="Every Code sessions cockpit">
                    <SessionList
                        sessions={cockpit.sessions}
                        activeSessionId={activeSession?.sessionId ?? ""}
                        onSelect={selectSession}
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
                                inputNote={inputNote}
                                setInputAnswer={setInputAnswer}
                                setInputNote={setInputNote}
                                commandLog={commandLog}
                                trustLog={trustLog}
                                commandHistory={activeCommandHistory}
                                commandOutcomeSummary={activeCommandOutcomeSummary}
                                dispatchCommand={dispatchCommand}
                                dispatchTrustAction={dispatchTrustAction}
                                dispatchTrustHostRevoke={dispatchTrustHostRevoke}
                                trustRegistry={trustRegistry}
                                transport={cockpitView.transport}
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
                <p className="eyebrow">Sessions</p>
                <h2>Attention queue</h2>
            </div>
            <span className="count-badge">{sessions.length}</span>
        </div>

        <div className="session-stack">
            {sessions.length === 0 ? (
                <div className="empty-state session-empty">
                    <Check size={16} />
                    <p>No sessions in this snapshot.</p>
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
                        <span className="session-hostline">
                            {session.hostLabel} <span aria-hidden="true">/</span> {session.branch ?? "detached"}
                        </span>
                        <TrustPill trust={session.trust} compact />
                    </span>
                </button>
            ))}
        </div>
    </aside>
)

const CockpitStateBanner = ({ surface }: { surface: CockpitStateSurface | null }) => {
    if (surface === null) {
        return null
    }

    const Icon = surface.tone === "success" ? Check : surface.tone === "warning" ? AlertCircle : Info

    return (
        <section className={`state-banner is-${surface.tone}`} aria-label="Cockpit connection state">
            <Icon size={16} aria-hidden="true" />
            <strong>{surface.title}</strong>
            <p>{surface.detail}</p>
        </section>
    )
}

type AttentionOverviewProps = {
    summary: OperatorAttentionSummary
    onSelectItem: (item: OperatorAttentionItem) => void
}

const AttentionOverview = ({ summary, onSelectItem }: AttentionOverviewProps) => {
    const nextItem = summary.nextItem

    return (
        <section className="attention-overview" aria-label="Operator attention summary">
            <div className="attention-next">
                <p className="eyebrow">Next action</p>
                {nextItem === undefined ? (
                    <div className="attention-clear">
                        <Check size={15} aria-hidden="true" />
                        <span>No pending operator attention in this snapshot.</span>
                    </div>
                ) : (
                    <AttentionNextButton item={nextItem} onSelectItem={onSelectItem} />
                )}
            </div>
            <div className="attention-metrics" aria-label="Attention counts">
                {attentionMetricKinds.map((kind) => (
                    <span className={`attention-metric is-${kind}`} key={kind}>
                        <strong>{summary.counts[kind]}</strong>
                        {attentionLabels[kind]}
                    </span>
                ))}
            </div>
        </section>
    )
}

const attentionMetricKinds: OperatorAttentionKind[] = ["approval", "input", "error", "blocked", "stale-command", "rejected-command"]

const AttentionNextButton = ({
    item,
    onSelectItem,
}: {
    item: OperatorAttentionItem
    onSelectItem: (item: OperatorAttentionItem) => void
}) => {
    const Icon = attentionIcon[item.kind]

    return (
        <button className={`attention-next-button is-${item.kind}`} type="button" onClick={() => onSelectItem(item)}>
            <Icon size={16} aria-hidden="true" />
            <span className="attention-kind">{attentionLabels[item.kind]}</span>
            <strong>{item.title}</strong>
            <span>{item.sessionId}</span>
            <small>{item.detail}</small>
        </button>
    )
}

const EmptySessionDetail = ({ transport }: { transport: CockpitTransportStatus }) => (
    <section className="panel detail-panel empty-cockpit-panel" aria-label="Active session detail">
        <div className="empty-cockpit-card">
            <p className="eyebrow">{describeTransportStatus(transport)}</p>
            <h2>No active sessions</h2>
            <p>{emptySessionDetailCopy(transport)}</p>
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
        <CurrentTurnSummary summary={getSessionDetailSummary(session)} />

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
            <MetadataItem icon={trustMetadataIcon(session.trust.status)} label="Trust" value={trustMetadataValue(session)} />
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

const CurrentTurnSummary = ({ summary }: { summary: SessionDetailSummary }) => {
    const turn = summary.currentTurn ?? summary.latestTurn

    return (
        <section className="current-turn-summary" aria-label="Current turn summary">
            <div>
                <p className="eyebrow">Current turn</p>
                <h3>{turn?.title ?? "No turns yet"}</h3>
                <p>{turn?.summary ?? "This session has not published turn detail yet."}</p>
            </div>
            <div className="turn-summary-metrics" aria-label="Turn detail counts">
                <MetricPill label="Steps" value={summary.totalSteps} />
                <MetricPill label="Blocked" value={summary.blockedCount} tone={summary.blockedCount > 0 ? "warning" : undefined} />
                <MetricPill label="Errors" value={summary.errorCount} tone={summary.errorCount > 0 ? "danger" : undefined} />
            </div>
            <StepKindSummary counts={summary.stepCounts} />
        </section>
    )
}

const MetricPill = ({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" | undefined }) => (
    <span className={`detail-metric ${tone === undefined ? "" : `is-${tone}`}`}>
        <strong>{value}</strong>
        {label}
    </span>
)

const StepKindSummary = ({ counts }: { counts: TurnStepSummary }) => (
    <div className="step-kind-summary" aria-label="Step categories">
        {stepKindOrder.map((kind) => {
            const Icon = stepKindIcon[kind]
            return (
                <span key={kind}>
                    <Icon size={13} aria-hidden="true" />
                    <strong>{counts[kind]}</strong>
                    {stepKindLabel[kind]}
                </span>
            )
        })}
    </div>
)

type ActionRailProps = {
    session: CockpitSession
    approval: PendingApproval | undefined
    requestedInput: RequestedInput | undefined
    inputAnswerValues: Record<string, string>
    inputNote: string
    setInputAnswer: (questionId: string, value: string) => void
    setInputNote: (value: string) => void
    commandLog: string
    trustLog: string
    commandHistory: CommandHistoryEntry[]
    commandOutcomeSummary: CommandOutcomeSummary
    dispatchCommand: (label: string, command: SessionCommand) => void
    dispatchTrustAction: (label: string, session: CockpitSession, action: "trust" | "revoke") => void
    dispatchTrustHostRevoke: (host: LocalHostTrustRecord) => void
    trustRegistry: TrustRegistryState
    transport: CockpitTransportStatus
}

const ActionRail = ({
    session,
    approval,
    requestedInput,
    inputAnswerValues,
    inputNote,
    setInputAnswer,
    setInputNote,
    commandLog,
    trustLog,
    commandHistory,
    commandOutcomeSummary,
    dispatchCommand,
    dispatchTrustAction,
    dispatchTrustHostRevoke,
    trustRegistry,
    transport,
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
                    note={inputNote}
                    setValue={setInputAnswer}
                    setNote={setInputNote}
                    dispatchCommand={dispatchCommand}
                />
            )}
        </section>

        <TrustManagementPanel
            session={session}
            transport={transport}
            trustLog={trustLog}
            dispatchTrustAction={dispatchTrustAction}
            dispatchTrustHostRevoke={dispatchTrustHostRevoke}
            trustRegistry={trustRegistry}
        />

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
                <CommandOutcomeOverview summary={commandOutcomeSummary} />
                <CommandHistory entries={commandHistory} />
            </div>
            <div className="epoch-note">
                <AlertCircle size={16} />
                <p>Commands target {session.sessionEpoch}; stale epochs are rejected by the active Every Code session.</p>
            </div>
        </section>
    </aside>
)

const TrustManagementPanel = ({
    session,
    transport,
    trustLog,
    dispatchTrustAction,
    dispatchTrustHostRevoke,
    trustRegistry,
}: {
    session: CockpitSession
    transport: CockpitTransportStatus
    trustLog: string
    dispatchTrustAction: (label: string, session: CockpitSession, action: "trust" | "revoke") => void
    dispatchTrustHostRevoke: (host: LocalHostTrustRecord) => void
    trustRegistry: TrustRegistryState
}) => {
    const hostId = session.hostId?.trim()
    const hasHostId = hostId !== undefined && hostId !== ""
    const isLive = canManageTrust(transport)
    const canTrust = hasHostId && isLive && session.trust.status !== "trusted"
    const canRevoke = hasHostId && isLive && session.trust.status === "trusted"

    return (
        <section className="panel work-panel trust-panel" aria-label="Local trust">
            <div className="panel-heading compact-heading">
                <div>
                    <p className="eyebrow">Local trust</p>
                    <h2>Host record</h2>
                </div>
                <TrustPill trust={session.trust} compact />
            </div>
            <div className="trust-card">
                <div>
                    <span>Host</span>
                    <strong>{session.hostLabel}</strong>
                    <p>{hostId ?? "No stable host id published"}</p>
                </div>
                <div className="trust-actions">
                    <button
                        className="primary-button"
                        type="button"
                        disabled={!canTrust}
                        onClick={() => dispatchTrustAction("Trust host", session, "trust")}
                    >
                        <ShieldCheck size={16} />
                        Trust
                    </button>
                    <button
                        className="quiet-button danger"
                        type="button"
                        disabled={!canRevoke}
                        onClick={() => dispatchTrustAction("Revoke host", session, "revoke")}
                    >
                        <ShieldAlert size={16} />
                        Revoke
                    </button>
                </div>
                <div className="mock-log" aria-live="polite">
                    <span>Trust status</span>
                    <p>{trustLog}</p>
                </div>
                <TrustRegistryList
                    registry={trustRegistry}
                    isLive={isLive}
                    activeHostId={hostId}
                    onRevokeHost={dispatchTrustHostRevoke}
                />
            </div>
        </section>
    )
}

const TrustRegistryList = ({
    registry,
    isLive,
    activeHostId,
    onRevokeHost,
}: {
    registry: TrustRegistryState
    isLive: boolean
    activeHostId: string | undefined
    onRevokeHost: (host: LocalHostTrustRecord) => void
}) => {
    const hosts = registry.snapshot?.hosts ?? []
    const sortedHosts = [...hosts].sort(compareTrustHosts)

    return (
        <div className="trust-registry" aria-label="Known host trust records">
            <div className="trust-registry-heading">
                <span>Known hosts</span>
                <strong>{hosts.length}</strong>
            </div>
            {sortedHosts.length === 0 ? (
                <p className="trust-registry-empty">{registry.message}</p>
            ) : (
                <div className="trust-record-list">
                    {sortedHosts.map((host) => (
                        <TrustRegistryRow
                            key={host.hostId}
                            host={host}
                            isActiveHost={activeHostId === host.hostId}
                            canRevoke={isLive && host.status === "trusted"}
                            onRevokeHost={onRevokeHost}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

const TrustRegistryRow = ({
    host,
    isActiveHost,
    canRevoke,
    onRevokeHost,
}: {
    host: LocalHostTrustRecord
    isActiveHost: boolean
    canRevoke: boolean
    onRevokeHost: (host: LocalHostTrustRecord) => void
}) => (
    <div className={`trust-record-row is-${host.status} ${isActiveHost ? "is-active-host" : ""}`}>
        <div>
            <strong>{host.label}</strong>
            <p>{host.hostId}</p>
            <small>{formatTrustRecordTime(host)}</small>
        </div>
        <span className={`trust-record-status is-${host.status}`}>{host.status}</span>
        <button
            className="icon-button danger"
            type="button"
            disabled={!canRevoke}
            title={`Revoke ${host.label}`}
            aria-label={`Revoke ${host.label}`}
            onClick={() => onRevokeHost(host)}
        >
            <ShieldAlert size={14} />
        </button>
    </div>
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
    note: string
    setValue: (questionId: string, value: string) => void
    setNote: (value: string) => void
    dispatchCommand: (label: string, command: SessionCommand) => void
}

const RequestedInputCard = ({ input, values, note, setValue, setNote, dispatchCommand }: RequestedInputCardProps) => {
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
            <textarea
                id="input-freeform"
                placeholder="Add context for the session..."
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
            />
            <button
                className="primary-button full-width"
                type="button"
                onClick={() =>
                    dispatchCommand(`Submit input ${input.id}`, {
                        kind: "request_user_input_response",
                        sessionId: input.sessionId,
                        sessionEpoch: input.sessionEpoch,
                        inputId: input.id,
                        turnId: input.turnId,
                        answers: getRequestedInputAnswers(input, values, note),
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
            {turn.steps.length === 0 ? (
                <div className="step-empty">
                    <Info size={14} />
                    <p>No timeline steps have arrived for this turn yet.</p>
                </div>
            ) : null}
            {turn.steps.map((step) => {
                const StepIcon = stepKindIcon[step.kind]

                return (
                    <div className={`step-row is-${step.kind}`} key={step.id}>
                        <span className={`step-dot ${stepTone[step.state]}`} aria-hidden="true" />
                        <div className="step-body">
                            <div className="step-title-row">
                                <StepIcon size={13} aria-hidden="true" />
                                <span>{stepKindLabel[step.kind]}</span>
                                <strong>{step.title}</strong>
                            </div>
                            <p>{step.detail}</p>
                        </div>
                        <span>{formatTime(step.timestamp)}</span>
                    </div>
                )
            })}
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

const TrustPill = ({ trust, compact = false }: { trust: CockpitSession["trust"]; compact?: boolean }) => {
    const Icon = trustMetadataIcon(trust.status)

    return (
        <span className={`trust-pill ${trustTone[trust.status]} ${compact ? "is-compact" : ""}`} title={trustMetadataLabel(trust)}>
            <Icon size={compact ? 11 : 13} aria-hidden="true" />
            {compact ? compactTrustLabels[trust.status] : trustLabels[trust.status]}
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

const trustMetadataIcon = (status: SessionTrustStatus): IconComponent => {
    switch (status) {
        case "trusted":
            return ShieldCheck
        case "revoked":
            return ShieldAlert
        case "unknown":
        case "unidentified":
            return ShieldQuestion
    }
}

const trustMetadataLabel = (trust: CockpitSession["trust"]): string => {
    if (trust.status === "trusted" || trust.status === "revoked") {
        return `${trustLabels[trust.status]}: ${trust.trustedHostLabel ?? trust.hostId ?? trust.hostLabel}`
    }

    return trustLabels[trust.status]
}

const trustMetadataValue = (session: CockpitSession): string => {
    const label = trustMetadataLabel(session.trust)
    return session.trust.hostId === null ? label : `${label} / ${session.trust.hostId}`
}

const emptySessionDetailCopy = (transport: CockpitTransportStatus): string => {
    switch (transport.mode) {
        case "fixture":
            return "The cockpit is showing fake data because no local broker URL is configured."
        case "connecting":
            return "The cockpit is connecting to the local broker and has not received Every Code sessions yet."
        case "live":
            return "The local broker is connected and healthy, but it does not contain Every Code sessions yet."
        case "fallback":
            return transport.error === null
                ? "The cockpit is showing the last known snapshot because the local broker is unavailable."
                : `The cockpit is showing the last known snapshot because the local broker is unavailable: ${transport.error}`
    }
}

export const getCockpitStateSurface = (
    cockpit: { sessions: CockpitSession[]; staleEvents: unknown[] },
    transport: CockpitTransportStatus,
): CockpitStateSurface | null => {
    if (transport.mode === "connecting") {
        return {
            tone: "info",
            title: "Connecting to local broker",
            detail: "The cockpit is waiting for its first live snapshot and is holding the fixture view until the broker responds.",
        }
    }

    if (transport.mode === "fallback") {
        return {
            tone: "warning",
            title: "Broker reconnecting",
            detail: transport.error ?? "Showing the last known snapshot while polling resumes.",
        }
    }

    if (transport.mode === "fixture") {
        return {
            tone: "info",
            title: "Fixture mode",
            detail: "No local broker URL is configured, so the cockpit is showing review data instead of live Every Code sessions.",
        }
    }

    if (cockpit.staleEvents.length > 0) {
        return {
            tone: "warning",
            title: "Stale event evidence retained",
            detail: `${String(cockpit.staleEvents.length)} stale epoch ${cockpit.staleEvents.length === 1 ? "event" : "events"} kept for operator review.`,
        }
    }

    if (cockpit.sessions.length === 0) {
        return {
            tone: "success",
            title: "No live sessions",
            detail: "The broker is healthy, but no Every Code sessions have published a snapshot yet.",
        }
    }

    return null
}

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

const CommandOutcomeOverview = ({ summary }: { summary: CommandOutcomeSummary }) => {
    if (summary.total === 0) {
        return null
    }

    const tone = summary.stale > 0 || summary.rejected > 0 ? "is-warning" : "is-success"
    const latest = summary.latest

    return (
        <div className={`command-outcome-overview ${tone}`} aria-label="Command outcome summary">
            <div className="command-outcome-metrics">
                <span>
                    <strong>{summary.total}</strong>
                    retained
                </span>
                <span>
                    <strong>{summary.rejected}</strong>
                    rejected
                </span>
                <span>
                    <strong>{summary.stale}</strong>
                    stale
                </span>
            </div>
            {latest === undefined ? null : (
                <p>
                    Latest: {latest.label} {latest.isCurrentEpoch ? "on current epoch" : "from previous epoch"}
                </p>
            )}
        </div>
    )
}

const formatTime = (iso: string): string =>
    new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso))

const compareTrustHosts = (left: LocalHostTrustRecord, right: LocalHostTrustRecord): number => {
    if (left.status !== right.status) {
        return left.status === "trusted" ? -1 : 1
    }

    return getTrustRecordTimestamp(right) - getTrustRecordTimestamp(left)
}

const formatTrustRecordTime = (host: LocalHostTrustRecord): string => {
    const timestamp = host.lastSeenAt ?? host.createdAt
    const label = host.lastSeenAt === null ? "Created" : "Last seen"
    return `${label} ${formatTime(timestamp)}`
}

const getTrustRecordTimestamp = (host: LocalHostTrustRecord): number => new Date(host.lastSeenAt ?? host.createdAt).getTime()
