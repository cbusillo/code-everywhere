import type {
    CockpitProjectionEvent,
    EveryCodeSession,
    PendingApproval,
    ProjectedCockpitSession,
    RequestedInput,
    SessionId,
    SessionStatus,
    SessionTurn,
} from "@code-everywhere/contracts"
import { getProjectedSessions, projectCockpitEvents } from "@code-everywhere/contracts"

type SourceCockpitSession = EveryCodeSession & {
    unreadCount: number
    turns: SessionTurn[]
}

type SourceCockpitFixture = {
    generatedAt: string
    sessions: SourceCockpitSession[]
    approvals: PendingApproval[]
    requestedInputs: RequestedInput[]
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
}

const projectCockpitFixture = (fixture: SourceCockpitFixture): CockpitFixture => {
    const unreadCounts = new Map(fixture.sessions.map((session) => [session.sessionId, session.unreadCount]))
    const currentTurnIds = new Map(fixture.sessions.map((session) => [session.sessionId, session.currentTurnId]))
    const events: CockpitProjectionEvent[] = [
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
        ...fixture.sessions.map<CockpitProjectionEvent>((session) => ({
            kind: "session_status_changed",
            sessionId: session.sessionId,
            sessionEpoch: session.sessionEpoch,
            status: session.status,
            summary: session.summary,
            updatedAt: session.updatedAt,
        })),
    ]
    const state = projectCockpitEvents(events)

    return {
        generatedAt: fixture.generatedAt,
        sessions: getProjectedSessions(state).map((session) => ({
            ...session,
            currentTurnId: currentTurnIds.get(session.sessionId) ?? session.currentTurnId,
            unreadCount: unreadCounts.get(session.sessionId) ?? 0,
            turns: session.turnIds.map((turnId) => state.turns[turnId]).filter((turn): turn is SessionTurn => turn !== undefined),
        })),
        approvals: Object.values(state.pendingApprovals),
        requestedInputs: Object.values(state.requestedInputs),
    }
}

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

export const cockpitFixture: CockpitFixture = projectCockpitFixture(cockpitFixtureSource)

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
