import type {
    CommandOutcome,
    CockpitProjectionEvent,
    EveryCodeSession,
    PendingApproval,
    ProjectedCockpitSession,
    RequestedInput,
    SessionCommand,
    SessionId,
    SessionStatus,
    SessionTurn,
    StaleCockpitEvent,
} from "@code-everywhere/contracts"
import type { CockpitCommandRecord, CockpitIngestionSnapshot } from "@code-everywhere/server"
import { createCockpitEventStore } from "@code-everywhere/server"

type SourceCockpitSession = EveryCodeSession & {
    unreadCount: number
    turns: SessionTurn[]
}

type SourceCockpitFixture = {
    generatedAt: string
    sessions: SourceCockpitSession[]
    approvals: PendingApproval[]
    requestedInputs: RequestedInput[]
    commandOutcomes: CommandOutcome[]
    commands: CockpitCommandRecord[]
    staleEvents: StaleCockpitEvent[]
}

export type CockpitSession = ProjectedCockpitSession & {
    unreadCount: number
    turns: SessionTurn[]
}

export type CockpitFixture = {
    generatedAt: string
    sessions: CockpitSession[]
    approvals: PendingApproval[]
    requestedInputs: RequestedInput[]
    commandOutcomes: CommandOutcome[]
    commands: CockpitCommandRecord[]
    staleEvents: StaleCockpitEvent[]
}

export type TurnStepSummary = Record<SessionTurn["steps"][number]["kind"], number>

export type SessionDetailSummary = {
    currentTurn: SessionTurn | undefined
    latestTurn: SessionTurn | undefined
    stepCounts: TurnStepSummary
    totalSteps: number
    errorCount: number
    blockedCount: number
}

export type CommandHistoryEntry = {
    id: string
    label: string
    state: "queued" | "delivered" | "accepted" | "rejected"
    timestamp: string
    detail: string
    isStale: boolean
    isCurrentEpoch: boolean
}

export type CommandOutcomeSummary = {
    total: number
    rejected: number
    stale: number
    latest: CommandHistoryEntry | undefined
}

export type OperatorAttentionKind = "approval" | "input" | "error" | "blocked" | "stale-command" | "rejected-command"

export type OperatorAttentionItem = {
    id: string
    kind: OperatorAttentionKind
    sessionId: SessionId
    sessionEpoch: string
    pendingItemId?: string
    title: string
    detail: string
    timestamp: string
}

export type OperatorAttentionSummary = {
    items: OperatorAttentionItem[]
    counts: Record<OperatorAttentionKind, number>
    nextItem: OperatorAttentionItem | undefined
}

const sessionBase = {
    hostLabel: "Callisto MBP",
    cwd: "~/Developer/code-everywhere",
    branch: "main",
    pid: 41872,
    model: "code-gpt-5.4",
    startedAt: "2026-04-27T15:18:00.000Z",
}

const cockpitFixtureSource: SourceCockpitFixture = {
    generatedAt: "2026-04-27T16:05:00.000Z",
    sessions: [
        {
            ...sessionBase,
            sessionId: "ce-alpha",
            sessionEpoch: "epoch-34",
            status: "waiting-for-approval",
            summary: "Add fake-data cockpit spike and validate layout",
            updatedAt: "2026-04-27T16:04:12.000Z",
            currentTurnId: "turn-alpha-3",
            unreadCount: 3,
            turns: [
                {
                    id: "turn-alpha-1",
                    sessionId: "ce-alpha",
                    title: "Read durable product docs",
                    status: "completed",
                    actor: "assistant",
                    startedAt: "2026-04-27T15:18:00.000Z",
                    completedAt: "2026-04-27T15:24:00.000Z",
                    summary: "Confirmed the cockpit should be structured around sessions, turns, approvals, input, and commands.",
                    steps: [
                        {
                            id: "step-alpha-1a",
                            kind: "message",
                            title: "Product model captured",
                            detail: "Mapped the UI to sessions, turns, approvals, requested input, status, diffs, messages, and notifications.",
                            timestamp: "2026-04-27T15:21:00.000Z",
                            state: "completed",
                        },
                    ],
                },
                {
                    id: "turn-alpha-2",
                    sessionId: "ce-alpha",
                    title: "Create fake protocol data",
                    status: "completed",
                    actor: "assistant",
                    startedAt: "2026-04-27T15:25:00.000Z",
                    completedAt: "2026-04-27T15:37:00.000Z",
                    summary: "Built a fixture covering all required session states and the two pending work surfaces.",
                    steps: [
                        {
                            id: "step-alpha-2a",
                            kind: "diff",
                            title: "Contracts expanded",
                            detail: "Added turn, approval, requested-input, and richer session fields while preserving epoch semantics.",
                            timestamp: "2026-04-27T15:34:00.000Z",
                            state: "completed",
                        },
                        {
                            id: "step-alpha-2b",
                            kind: "artifact",
                            title: "Fixture ready",
                            detail: "Fake data now exercises running, idle, blocked, waiting-for-input, waiting-for-approval, ended, and error states.",
                            timestamp: "2026-04-27T15:36:00.000Z",
                            state: "completed",
                        },
                    ],
                },
                {
                    id: "turn-alpha-3",
                    sessionId: "ce-alpha",
                    title: "Install cockpit dependencies",
                    status: "waiting-for-approval",
                    actor: "assistant",
                    startedAt: "2026-04-27T15:40:00.000Z",
                    completedAt: null,
                    summary: "Dependency install is staged behind an approval so the operator can review the package changes.",
                    steps: [
                        {
                            id: "step-alpha-3a",
                            kind: "tool",
                            title: "pnpm install requested",
                            detail: "The session wants to install React, Vite, Tailwind, Radix Dialog, and lucide-react for the web cockpit.",
                            timestamp: "2026-04-27T15:42:00.000Z",
                            state: "blocked",
                        },
                    ],
                },
            ],
        },
        {
            ...sessionBase,
            sessionId: "ce-beta",
            sessionEpoch: "epoch-12",
            status: "waiting-for-input",
            summary: "Shape mobile-first requested-input behavior",
            updatedAt: "2026-04-27T16:02:18.000Z",
            currentTurnId: "turn-beta-2",
            unreadCount: 1,
            turns: [
                {
                    id: "turn-beta-1",
                    sessionId: "ce-beta",
                    title: "Compare iPhone cockpit priorities",
                    status: "completed",
                    actor: "assistant",
                    startedAt: "2026-04-27T15:02:00.000Z",
                    completedAt: "2026-04-27T15:12:00.000Z",
                    summary:
                        "Prioritized the attention queue, active detail, approval forms, input forms, and concise reply flow for narrow screens.",
                    steps: [
                        {
                            id: "step-beta-1a",
                            kind: "status",
                            title: "Mobile priority set",
                            detail: "Narrow layouts should stack pending work above lower-priority metadata when action is required.",
                            timestamp: "2026-04-27T15:11:00.000Z",
                            state: "completed",
                        },
                    ],
                },
                {
                    id: "turn-beta-2",
                    sessionId: "ce-beta",
                    title: "Ask operator for interaction density",
                    status: "waiting-for-input",
                    actor: "assistant",
                    startedAt: "2026-04-27T15:58:00.000Z",
                    completedAt: null,
                    summary: "Waiting for an operator choice about how much detail to show in compact mode.",
                    steps: [
                        {
                            id: "step-beta-2a",
                            kind: "message",
                            title: "Input requested",
                            detail: "Asked whether compact mode should emphasize pending work, timeline, or session metadata first.",
                            timestamp: "2026-04-27T16:00:00.000Z",
                            state: "blocked",
                        },
                    ],
                },
            ],
        },
        {
            ...sessionBase,
            sessionId: "ce-gamma",
            sessionEpoch: "epoch-7",
            status: "running",
            summary: "Prototype projection helpers for trusted sessions",
            updatedAt: "2026-04-27T16:03:40.000Z",
            currentTurnId: "turn-gamma-1",
            unreadCount: 0,
            turns: [
                {
                    id: "turn-gamma-1",
                    sessionId: "ce-gamma",
                    title: "Normalize session hello events",
                    status: "running",
                    actor: "assistant",
                    startedAt: "2026-04-27T15:50:00.000Z",
                    completedAt: null,
                    summary: "Reading fixture events and deriving a stable client-facing session summary.",
                    steps: [
                        {
                            id: "step-gamma-1a",
                            kind: "tool",
                            title: "Projection running",
                            detail: "Session hello, reconnect, and status events are being collapsed into one active product object.",
                            timestamp: "2026-04-27T16:03:00.000Z",
                            state: "running",
                        },
                    ],
                },
            ],
        },
        {
            ...sessionBase,
            sessionId: "ce-delta",
            sessionEpoch: "epoch-3",
            status: "blocked",
            summary: "Resolve stale epoch rejection copy",
            updatedAt: "2026-04-27T15:48:00.000Z",
            currentTurnId: "turn-delta-1",
            unreadCount: 2,
            turns: [
                {
                    id: "turn-delta-1",
                    sessionId: "ce-delta",
                    title: "Reject stale command",
                    status: "blocked",
                    actor: "system",
                    startedAt: "2026-04-27T15:41:00.000Z",
                    completedAt: null,
                    summary: "A command targeted epoch-2 after the session reconnected with epoch-3.",
                    steps: [
                        {
                            id: "step-delta-1a",
                            kind: "error",
                            title: "Stale epoch rejected",
                            detail: "The previous continue command was ignored. The operator can request status against the current epoch.",
                            timestamp: "2026-04-27T15:47:00.000Z",
                            state: "blocked",
                        },
                    ],
                },
            ],
        },
        {
            ...sessionBase,
            sessionId: "ce-epsilon",
            sessionEpoch: "epoch-19",
            status: "idle",
            summary: "Waiting for the next operator reply",
            updatedAt: "2026-04-27T15:31:00.000Z",
            currentTurnId: null,
            unreadCount: 0,
            turns: [
                {
                    id: "turn-epsilon-1",
                    sessionId: "ce-epsilon",
                    title: "Summarize architecture docs",
                    status: "completed",
                    actor: "assistant",
                    startedAt: "2026-04-27T15:18:00.000Z",
                    completedAt: "2026-04-27T15:31:00.000Z",
                    summary: "Finished with a short architecture summary and no pending work.",
                    steps: [
                        {
                            id: "step-epsilon-1a",
                            kind: "message",
                            title: "Summary sent",
                            detail: "Every Code remains runtime; Code Everywhere owns presentation, projection, device trust, and operator actions.",
                            timestamp: "2026-04-27T15:30:00.000Z",
                            state: "completed",
                        },
                    ],
                },
            ],
        },
        {
            ...sessionBase,
            sessionId: "ce-zeta",
            sessionEpoch: "epoch-2",
            status: "ended",
            summary: "Completed repo hygiene audit",
            updatedAt: "2026-04-27T14:54:00.000Z",
            currentTurnId: null,
            unreadCount: 0,
            turns: [
                {
                    id: "turn-zeta-1",
                    sessionId: "ce-zeta",
                    title: "Audit repository settings",
                    status: "completed",
                    actor: "assistant",
                    startedAt: "2026-04-27T14:40:00.000Z",
                    completedAt: "2026-04-27T14:54:00.000Z",
                    summary: "Verified CI, CodeQL, Dependabot notes, and branch-protection documentation.",
                    steps: [
                        {
                            id: "step-zeta-1a",
                            kind: "artifact",
                            title: "Audit complete",
                            detail: "No active operator action remains for this session.",
                            timestamp: "2026-04-27T14:53:00.000Z",
                            state: "completed",
                        },
                    ],
                },
            ],
        },
        {
            ...sessionBase,
            sessionId: "ce-eta",
            sessionEpoch: "epoch-5",
            status: "error",
            summary: "Failed while checking an unreachable local bridge",
            updatedAt: "2026-04-27T15:08:00.000Z",
            currentTurnId: "turn-eta-1",
            unreadCount: 1,
            turns: [
                {
                    id: "turn-eta-1",
                    sessionId: "ce-eta",
                    title: "Probe local bridge",
                    status: "error",
                    actor: "assistant",
                    startedAt: "2026-04-27T15:01:00.000Z",
                    completedAt: null,
                    summary: "Connection refused while checking a local Every Code bridge endpoint.",
                    steps: [
                        {
                            id: "step-eta-1a",
                            kind: "error",
                            title: "Bridge unavailable",
                            detail: "The runtime did not answer on 127.0.0.1:47921. This fake state demonstrates failure triage.",
                            timestamp: "2026-04-27T15:07:00.000Z",
                            state: "error",
                        },
                    ],
                },
            ],
        },
    ],
    approvals: [
        {
            id: "approval-install-deps",
            sessionId: "ce-alpha",
            sessionEpoch: "epoch-34",
            turnId: "turn-alpha-3",
            title: "Install cockpit UI dependencies",
            body: "The session wants to add React, Vite, Tailwind, Radix Dialog, and lucide-react to the workspace.",
            command: "pnpm install",
            cwd: "~/Developer/code-everywhere",
            risk: "medium",
            requestedAt: "2026-04-27T15:42:00.000Z",
        },
    ],
    requestedInputs: [
        {
            id: "input-mobile-density",
            sessionId: "ce-beta",
            sessionEpoch: "epoch-12",
            turnId: "turn-beta-2",
            title: "Choose compact layout priority",
            requestedAt: "2026-04-27T16:00:00.000Z",
            questions: [
                {
                    id: "compact-priority",
                    label: "Compact mode",
                    prompt: "What should the narrow cockpit prioritize first?",
                    required: true,
                    options: [
                        {
                            label: "Pending work",
                            value: "pending-work",
                            description: "Shows approvals and requested input before timeline detail.",
                        },
                        {
                            label: "Timeline",
                            value: "timeline",
                            description: "Keeps the active turn feed as the first surface.",
                        },
                        {
                            label: "Metadata",
                            value: "metadata",
                            description: "Emphasizes host, cwd, branch, pid, and epoch first.",
                        },
                    ],
                },
            ],
        },
    ],
    commandOutcomes: [
        {
            commandId: "command-delta-rejected",
            sessionId: "ce-delta",
            sessionEpoch: "epoch-3",
            commandKind: "continue_autonomously",
            status: "rejected",
            reason: "no active turn is ready to continue after stale epoch rejection",
            handledAt: "2026-04-27T15:47:30.000Z",
        },
    ],
    commands: [],
    staleEvents: [],
}

export const createCockpitFixtureEvents = (fixture: SourceCockpitFixture): CockpitProjectionEvent[] => [
    ...fixture.sessions.flatMap<CockpitProjectionEvent>((session) => [
        {
            kind: "session_hello",
            session: toEveryCodeSession(session),
        },
        ...session.turns.map<CockpitProjectionEvent>((turn) => ({
            kind: "turn_started",
            sessionEpoch: session.sessionEpoch,
            turn,
        })),
    ]),
    ...fixture.approvals.map<CockpitProjectionEvent>((approval) => ({
        kind: "approval_requested",
        approval,
    })),
    ...fixture.requestedInputs.map<CockpitProjectionEvent>((input) => ({
        kind: "user_input_requested",
        input,
    })),
    ...fixture.commandOutcomes.map<CockpitProjectionEvent>((outcome) => ({
        kind: "command_outcome",
        outcome,
    })),
    ...fixture.sessions.map<CockpitProjectionEvent>((session) => ({
        kind: "session_status_changed",
        sessionId: session.sessionId,
        sessionEpoch: session.sessionEpoch,
        status: session.status,
        summary: session.summary,
        updatedAt: session.updatedAt,
    })),
]

export type CockpitFixtureOptions = {
    generatedAt?: string
    unreadCounts?: ReadonlyMap<SessionId, number>
    currentTurnIds?: ReadonlyMap<SessionId, SessionTurn["id"] | null>
    commands?: CockpitCommandRecord[]
}

export const createCockpitFixtureFromSnapshot = (
    snapshot: CockpitIngestionSnapshot,
    options: CockpitFixtureOptions = {},
): CockpitFixture => {
    const generatedAt = options.generatedAt ?? getLatestSessionUpdate(snapshot.sessions) ?? "1970-01-01T00:00:00.000Z"

    return {
        generatedAt,
        sessions: snapshot.sessions.map((session) => ({
            ...session,
            currentTurnId: getCurrentTurnId(options.currentTurnIds, session),
            unreadCount: options.unreadCounts?.get(session.sessionId) ?? 0,
            turns: session.turnIds
                .map((turnId) => snapshot.state.turns[turnId])
                .filter((turn): turn is SessionTurn => turn !== undefined),
        })),
        approvals: Object.values(snapshot.state.pendingApprovals),
        requestedInputs: Object.values(snapshot.state.requestedInputs),
        commandOutcomes: Object.values(snapshot.state.commandOutcomes).sort((left, right) =>
            right.handledAt.localeCompare(left.handledAt),
        ),
        commands: [...(options.commands ?? [])].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt)),
        staleEvents: [...snapshot.state.staleEvents].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt)),
    }
}

const createCockpitFixtureFromSource = (fixture: SourceCockpitFixture, snapshot: CockpitIngestionSnapshot): CockpitFixture =>
    createCockpitFixtureFromSnapshot(snapshot, {
        generatedAt: fixture.generatedAt,
        unreadCounts: new Map(fixture.sessions.map((session) => [session.sessionId, session.unreadCount])),
        currentTurnIds: new Map(fixture.sessions.map((session) => [session.sessionId, session.currentTurnId])),
    })

const toEveryCodeSession = (session: SourceCockpitSession): EveryCodeSession => ({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    hostLabel: session.hostLabel,
    cwd: session.cwd,
    branch: session.branch,
    pid: session.pid,
    model: session.model,
    status: session.status,
    summary: session.summary,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    currentTurnId: session.currentTurnId,
})

const getCurrentTurnId = (
    currentTurnIds: ReadonlyMap<SessionId, SessionTurn["id"] | null> | undefined,
    session: ProjectedCockpitSession,
) => {
    if (currentTurnIds?.has(session.sessionId) === true) {
        return currentTurnIds.get(session.sessionId) ?? null
    }

    return session.currentTurnId
}

const getLatestSessionUpdate = (sessions: ProjectedCockpitSession[]): string | undefined =>
    sessions
        .map((session) => session.updatedAt)
        .sort((first, second) => second.localeCompare(first))
        .at(0)

export const cockpitFixtureEvents = createCockpitFixtureEvents(cockpitFixtureSource)
export const cockpitFixtureStore = createCockpitEventStore(cockpitFixtureEvents)
export const cockpitFixtureSnapshot = cockpitFixtureStore.getSnapshot()
export const cockpitFixture: CockpitFixture = createCockpitFixtureFromSource(cockpitFixtureSource, cockpitFixtureSnapshot)

export const statusLabels: Record<SessionStatus, string> = {
    running: "Running",
    idle: "Idle",
    blocked: "Blocked",
    "waiting-for-input": "Needs input",
    "waiting-for-approval": "Needs approval",
    ended: "Ended",
    error: "Error",
}

export const getSessionById = (sessionId: SessionId): CockpitSession => {
    const session = cockpitFixture.sessions.find((candidate) => candidate.sessionId === sessionId)

    if (session === undefined) {
        throw new Error(`Unknown fake session: ${sessionId}`)
    }

    return session
}

export const getAttentionSessions = (sessions: CockpitSession[]): CockpitSession[] =>
    sessions.filter((session) => session.attention !== "none")

export const getSessionDetailSummary = (session: CockpitSession): SessionDetailSummary => {
    const currentTurn = session.currentTurnId === null ? undefined : session.turns.find((turn) => turn.id === session.currentTurnId)
    const latestTurn = currentTurn ?? session.turns.at(-1)
    const detailTurn = currentTurn ?? latestTurn
    const stepCounts = emptyTurnStepSummary()
    let errorCount = 0
    let blockedCount = 0

    if (detailTurn !== undefined) {
        if (detailTurn.status === "error") {
            errorCount += 1
        }
        if (
            detailTurn.status === "blocked" ||
            detailTurn.status === "waiting-for-approval" ||
            detailTurn.status === "waiting-for-input"
        ) {
            blockedCount += 1
        }
        for (const step of detailTurn.steps) {
            stepCounts[step.kind] += 1
            if (step.state === "error") {
                errorCount += 1
            }
            if (step.state === "blocked") {
                blockedCount += 1
            }
        }
    }

    return {
        currentTurn,
        latestTurn,
        stepCounts,
        totalSteps: Object.values(stepCounts).reduce((total, count) => total + count, 0),
        errorCount,
        blockedCount,
    }
}

export const getCommandHistoryEntries = (
    commands: CockpitCommandRecord[],
    outcomes: CommandOutcome[],
    session: CockpitSession | undefined,
): CommandHistoryEntry[] => {
    if (session === undefined) {
        return []
    }

    const outcomesByCommandId = new Map(outcomes.map((outcome) => [outcome.commandId, outcome]))
    const visibleCommandIds = new Set<string>()
    const entries = commands
        .filter((record) => {
            const outcome = outcomesByCommandId.get(record.id)
            return (
                (record.command.sessionId === session.sessionId && record.command.sessionEpoch === session.sessionEpoch) ||
                (outcome?.sessionId === session.sessionId && isVisibleOutcomeForSession(outcome, session))
            )
        })
        .map((record): CommandHistoryEntry => {
            const outcome = outcomesByCommandId.get(record.id)
            const state = outcome?.status ?? (record.deliveredAt === null ? "queued" : "delivered")
            const timestamp = outcome?.handledAt ?? record.deliveredAt ?? record.receivedAt
            const detail = outcome?.reason ?? (record.deliveredAt === null ? "Waiting for Every Code" : "Claimed by Every Code")
            visibleCommandIds.add(record.id)

            return {
                id: record.id,
                label: formatCommandKind(record.command.kind),
                state,
                timestamp,
                detail,
                isStale: isStaleCommandOutcome(outcome),
                isCurrentEpoch:
                    outcome?.sessionEpoch === session.sessionEpoch || record.command.sessionEpoch === session.sessionEpoch,
            }
        })

    const outcomeOnlyEntries = outcomes
        .filter(
            (outcome) =>
                outcome.sessionId === session.sessionId &&
                isVisibleOutcomeForSession(outcome, session) &&
                !visibleCommandIds.has(outcome.commandId),
        )
        .map(
            (outcome): CommandHistoryEntry => ({
                id: outcome.commandId,
                label: formatCommandKind(outcome.commandKind),
                state: outcome.status,
                timestamp: outcome.handledAt,
                detail: outcome.reason ?? "Outcome reported by Every Code",
                isStale: isStaleCommandOutcome(outcome),
                isCurrentEpoch: outcome.sessionEpoch === session.sessionEpoch,
            }),
        )

    return [...entries, ...outcomeOnlyEntries].sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 5)
}

export const getCommandOutcomeSummary = (entries: CommandHistoryEntry[]): CommandOutcomeSummary => {
    const rejected = entries.filter((entry) => entry.state === "rejected").length
    const stale = entries.filter((entry) => entry.isStale).length

    return {
        total: entries.length,
        rejected,
        stale,
        latest: entries.at(0),
    }
}

const isVisibleOutcomeForSession = (outcome: CommandOutcome, session: CockpitSession): boolean =>
    outcome.sessionEpoch === session.sessionEpoch || outcome.status === "rejected" || isStaleCommandOutcome(outcome)

const isStaleCommandOutcome = (outcome: CommandOutcome | undefined): boolean =>
    outcome?.reason?.toLowerCase().includes("stale") ?? false

const formatCommandKind = (kind: SessionCommand["kind"]): string =>
    kind
        .split("_")
        .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
        .join(" ")

const emptyTurnStepSummary = (): TurnStepSummary => ({
    message: 0,
    tool: 0,
    status: 0,
    diff: 0,
    artifact: 0,
    error: 0,
})

export const getOperatorAttentionSummary = (
    fixture: Pick<CockpitFixture, "approvals" | "commandOutcomes" | "requestedInputs" | "sessions">,
): OperatorAttentionSummary => {
    const items: OperatorAttentionItem[] = [
        ...fixture.approvals.map(
            (approval): OperatorAttentionItem => ({
                id: `approval:${approval.id}`,
                kind: "approval",
                sessionId: approval.sessionId,
                sessionEpoch: approval.sessionEpoch,
                pendingItemId: approval.id,
                title: approval.title,
                detail: `${approval.risk} risk approval requested`,
                timestamp: approval.requestedAt,
            }),
        ),
        ...fixture.requestedInputs.filter(hasActionableRequestedInput).map(
            (input): OperatorAttentionItem => ({
                id: `input:${input.id}`,
                kind: "input",
                sessionId: input.sessionId,
                sessionEpoch: input.sessionEpoch,
                pendingItemId: input.id,
                title: input.title,
                detail: `${String(input.questions.length)} requested input ${input.questions.length === 1 ? "question" : "questions"}`,
                timestamp: input.requestedAt,
            }),
        ),
        ...fixture.sessions
            .filter((session) => session.attention === "error" || session.attention === "blocked")
            .map(
                (session): OperatorAttentionItem => ({
                    id: `session:${session.sessionId}:${session.attention}`,
                    kind: session.attention === "error" ? "error" : "blocked",
                    sessionId: session.sessionId,
                    sessionEpoch: session.sessionEpoch,
                    title: session.summary,
                    detail: statusLabels[session.status],
                    timestamp: session.updatedAt,
                }),
            ),
        ...fixture.commandOutcomes
            .filter((outcome) => outcome.status === "rejected")
            .map((outcome): OperatorAttentionItem => {
                const stale = outcome.reason?.toLowerCase().includes("stale") ?? false
                return {
                    id: `command:${outcome.commandId}`,
                    kind: stale ? "stale-command" : "rejected-command",
                    sessionId: outcome.sessionId,
                    sessionEpoch: outcome.sessionEpoch,
                    title: formatAttentionCommandKind(outcome.commandKind),
                    detail: outcome.reason ?? "Command rejected by Every Code",
                    timestamp: outcome.handledAt,
                }
            }),
    ].sort(compareAttentionItems)

    return {
        items,
        counts: getAttentionCounts(items),
        nextItem: items.at(0),
    }
}

const attentionPriority: Record<OperatorAttentionKind, number> = {
    approval: 0,
    input: 1,
    error: 2,
    blocked: 3,
    "stale-command": 4,
    "rejected-command": 5,
}

const emptyAttentionCounts = (): Record<OperatorAttentionKind, number> => ({
    approval: 0,
    input: 0,
    error: 0,
    blocked: 0,
    "stale-command": 0,
    "rejected-command": 0,
})

const getAttentionCounts = (items: OperatorAttentionItem[]): Record<OperatorAttentionKind, number> => {
    const counts = emptyAttentionCounts()
    for (const item of items) {
        counts[item.kind] += 1
    }
    return counts
}

const compareAttentionItems = (left: OperatorAttentionItem, right: OperatorAttentionItem): number => {
    const priorityDelta = attentionPriority[left.kind] - attentionPriority[right.kind]
    if (priorityDelta !== 0) {
        return priorityDelta
    }
    return right.timestamp.localeCompare(left.timestamp)
}

const formatAttentionCommandKind = (kind: SessionCommand["kind"]): string =>
    kind
        .split("_")
        .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
        .join(" ")

export const hasActionableRequestedInput = (input: RequestedInput): boolean => input.questions.length > 0
