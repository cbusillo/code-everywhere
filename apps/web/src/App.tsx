import * as Dialog from "@radix-ui/react-dialog"
import type { PendingApproval, RequestedInput, SessionStatus, SessionTurn, TurnStep } from "@code-everywhere/contracts"
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

import { cockpitFixture, getAttentionSessions, statusLabels, type CockpitSession } from "./cockpitData"

const selectedSessionId = "ce-alpha"

type IconComponent = typeof CirclePlay

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

export const App = () => {
    const [activeSessionId, setActiveSessionId] = useState(selectedSessionId)
    const [reply, setReply] = useState("")
    const [inputAnswer, setInputAnswer] = useState("pending-work")
    const [commandLog, setCommandLog] = useState("No mocked command sent yet")
    const fallbackSession = cockpitFixture.sessions[0]

    if (fallbackSession === undefined) {
        throw new Error("The cockpit fixture must include at least one session")
    }

    const activeSession = cockpitFixture.sessions.find((session) => session.sessionId === activeSessionId) ?? fallbackSession
    const attentionSessions = useMemo(() => getAttentionSessions(cockpitFixture.sessions), [])
    const activeApproval = cockpitFixture.approvals.find((approval) => approval.sessionId === activeSession.sessionId)
    const activeInput = cockpitFixture.requestedInputs.find((input) => input.sessionId === activeSession.sessionId)

    const logCommand = (label: string) => {
        setCommandLog(`${label} mocked for ${activeSession.sessionId} at epoch ${activeSession.sessionEpoch}`)
    }

    return (
        <main className="app-shell">
            <div className="app-frame">
                <header className="cockpit-header">
                    <div>
                        <p className="eyebrow">Code Everywhere</p>
                        <h1>Every Code cockpit</h1>
                    </div>
                    <div className="header-actions">
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
                        sessions={cockpitFixture.sessions}
                        activeSessionId={activeSession.sessionId}
                        onSelect={setActiveSessionId}
                    />
                    <SessionDetail session={activeSession} reply={reply} setReply={setReply} logCommand={logCommand} />
                    <ActionRail
                        session={activeSession}
                        approval={activeApproval}
                        requestedInput={activeInput}
                        inputAnswer={inputAnswer}
                        setInputAnswer={setInputAnswer}
                        commandLog={commandLog}
                        logCommand={logCommand}
                    />
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

type SessionDetailProps = {
    session: CockpitSession
    reply: string
    setReply: (value: string) => void
    logCommand: (label: string) => void
}

const SessionDetail = ({ session, reply, setReply, logCommand }: SessionDetailProps) => (
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
                <ActionButton icon={MessageSquareText} label="Status" onClick={() => logCommand("Status request")} />
                <ActionButton icon={Pause} label="Pause" onClick={() => logCommand("Pause")} />
                <ActionButton icon={Play} label="Continue" onClick={() => logCommand("Continue")} />
                <EndSessionButton onEnd={() => logCommand("End session")} />
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
                    onClick={() => logCommand(reply.trim() === "" ? "Empty reply" : "Reply")}
                >
                    <Send size={16} />
                    Send reply
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
    inputAnswer: string
    setInputAnswer: (value: string) => void
    commandLog: string
    logCommand: (label: string) => void
}

const ActionRail = ({ session, approval, requestedInput, inputAnswer, setInputAnswer, commandLog, logCommand }: ActionRailProps) => (
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

            {approval === undefined ? null : <ApprovalCard approval={approval} logCommand={logCommand} />}
            {requestedInput === undefined ? null : (
                <RequestedInputCard input={requestedInput} value={inputAnswer} setValue={setInputAnswer} logCommand={logCommand} />
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
                <ActionButton icon={CirclePause} label="Pause" onClick={() => logCommand("Pause")} />
                <ActionButton icon={CirclePlay} label="Continue" onClick={() => logCommand("Continue")} />
                <ActionButton icon={History} label="Status" onClick={() => logCommand("Status request")} />
                <EndSessionButton onEnd={() => logCommand("End session")} />
            </div>
            <div className="mock-log" aria-live="polite">
                <span>Mock command</span>
                <p>{commandLog}</p>
            </div>
            <div className="epoch-note">
                <AlertCircle size={16} />
                <p>Commands target {session.sessionEpoch}; stale epochs should reject visibly once the live bridge exists.</p>
            </div>
        </section>
    </aside>
)

const ApprovalCard = ({ approval, logCommand }: { approval: PendingApproval; logCommand: (label: string) => void }) => (
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
            <button className="primary-button" type="button" onClick={() => logCommand(`Approve ${approval.id}`)}>
                <Check size={16} />
                Approve
            </button>
            <button className="quiet-button danger" type="button" onClick={() => logCommand(`Deny ${approval.id}`)}>
                <X size={16} />
                Deny
            </button>
        </div>
    </article>
)

type RequestedInputCardProps = {
    input: RequestedInput
    value: string
    setValue: (value: string) => void
    logCommand: (label: string) => void
}

const RequestedInputCard = ({ input, value, setValue, logCommand }: RequestedInputCardProps) => {
    const question = input.questions[0]

    if (question === undefined) {
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
            <fieldset>
                <legend>{question.prompt}</legend>
                {question.options.map((option) => (
                    <label className="choice-row" key={option.value}>
                        <input
                            type="radio"
                            name={question.id}
                            value={option.value}
                            checked={value === option.value}
                            onChange={() => setValue(option.value)}
                        />
                        <span>
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                        </span>
                    </label>
                ))}
            </fieldset>
            <label className="freeform-label" htmlFor="input-freeform">
                Optional note
            </label>
            <textarea id="input-freeform" placeholder="Add context for the session..." />
            <button
                className="primary-button full-width"
                type="button"
                onClick={() => logCommand(`Submit input ${input.id}: ${value}`)}
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
            <span
                className={`step-dot ${stepTone[turn.status === "completed" ? "completed" : turn.status === "running" ? "running" : turn.status === "error" ? "error" : turn.status === "blocked" ? "blocked" : "pending"]}`}
            />
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
                    This mocked control records the command locally. The live bridge will send an epoch-scoped end command.
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

const formatTime = (iso: string): string =>
    new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso))
