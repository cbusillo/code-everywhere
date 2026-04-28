import type {
    CockpitProjectionEvent,
    CockpitProjectionState,
    EveryCodeSession,
    ProjectedCockpitSession,
    SessionId,
    SessionTurn,
    TurnId,
    TurnStep,
} from "@code-everywhere/contracts"
import { getProjectedSessions, projectCockpitEvents } from "@code-everywhere/contracts"

export type CockpitEventRetentionPolicy = {
    maxEndedSessions: number
    maxTurnsPerSession: number
    maxStepsPerTurn: number
    maxCommandOutcomes: number
    maxStaleEvents: number
}

export const defaultCockpitEventRetentionPolicy: CockpitEventRetentionPolicy = {
    maxEndedSessions: 10,
    maxTurnsPerSession: 25,
    maxStepsPerTurn: 100,
    maxCommandOutcomes: 200,
    maxStaleEvents: 50,
}

export const compactCockpitEvents = (
    events: readonly CockpitProjectionEvent[],
    policy: CockpitEventRetentionPolicy = defaultCockpitEventRetentionPolicy,
): CockpitProjectionEvent[] => {
    if (events.length === 0) {
        return []
    }

    const normalizedPolicy = normalizeRetentionPolicy(policy)
    const state = projectCockpitEvents([...events])
    const sessions = selectRetainedSessions(state, normalizedPolicy)
    const retainedSessionIds = new Set(sessions.map((session) => session.sessionId))
    const sessionsNeedingFinalHello = new Set<SessionId>()
    const compacted: CockpitProjectionEvent[] = []

    for (const session of sessions) {
        compacted.push(sessionHelloEvent(session))
    }

    for (const session of sessions) {
        for (const turn of selectRetainedTurns(state, session, normalizedPolicy)) {
            sessionsNeedingFinalHello.add(session.sessionId)
            compacted.push({
                kind: "turn_started",
                sessionEpoch: session.sessionEpoch,
                turn: {
                    ...turn,
                    steps: selectRetainedSteps(turn.steps, normalizedPolicy),
                },
            })
        }
    }

    for (const approval of Object.values(state.pendingApprovals).sort((left, right) =>
        left.requestedAt.localeCompare(right.requestedAt),
    )) {
        if (retainedSessionIds.has(approval.sessionId)) {
            sessionsNeedingFinalHello.add(approval.sessionId)
            compacted.push({ kind: "approval_requested", approval })
        }
    }

    for (const input of Object.values(state.requestedInputs).sort((left, right) =>
        left.requestedAt.localeCompare(right.requestedAt),
    )) {
        if (retainedSessionIds.has(input.sessionId)) {
            sessionsNeedingFinalHello.add(input.sessionId)
            compacted.push({ kind: "user_input_requested", input })
        }
    }

    for (const outcome of selectRetainedCommandOutcomes(state, retainedSessionIds, normalizedPolicy)) {
        sessionsNeedingFinalHello.add(outcome.sessionId)
        compacted.push({ kind: "command_outcome", outcome })
    }

    for (const event of selectRetainedStaleEvents(events, state, normalizedPolicy)) {
        const scope = eventScope(event)
        if (scope !== null && retainedSessionIds.has(scope.sessionId)) {
            sessionsNeedingFinalHello.add(scope.sessionId)
        }
        compacted.push(event)
    }

    for (const session of sessions) {
        if (sessionsNeedingFinalHello.has(session.sessionId)) {
            compacted.push(sessionHelloEvent(session))
        }
    }

    return compacted
}

const normalizeRetentionPolicy = (policy: CockpitEventRetentionPolicy): CockpitEventRetentionPolicy => ({
    maxEndedSessions: Math.max(0, Math.floor(policy.maxEndedSessions)),
    maxTurnsPerSession: Math.max(1, Math.floor(policy.maxTurnsPerSession)),
    maxStepsPerTurn: Math.max(0, Math.floor(policy.maxStepsPerTurn)),
    maxCommandOutcomes: Math.max(0, Math.floor(policy.maxCommandOutcomes)),
    maxStaleEvents: Math.max(0, Math.floor(policy.maxStaleEvents)),
})

const selectRetainedSessions = (state: CockpitProjectionState, policy: CockpitEventRetentionPolicy): ProjectedCockpitSession[] => {
    const sessions = getProjectedSessions(state)
    const activeSessions = sessions.filter(shouldAlwaysRetainSession)
    const activeSessionIds = new Set(activeSessions.map((session) => session.sessionId))
    const endedSessions = sessions
        .filter((session) => !activeSessionIds.has(session.sessionId))
        .filter((session) => session.status === "ended")
        .slice(0, policy.maxEndedSessions)

    return [...activeSessions, ...endedSessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

const shouldAlwaysRetainSession = (session: ProjectedCockpitSession): boolean =>
    session.status !== "ended" || session.pendingApprovalIds.length > 0 || session.pendingInputIds.length > 0

const selectRetainedTurns = (
    state: CockpitProjectionState,
    session: ProjectedCockpitSession,
    policy: CockpitEventRetentionPolicy,
): SessionTurn[] => {
    const requiredTurnIds = new Set<TurnId>()
    if (session.currentTurnId !== null) {
        requiredTurnIds.add(session.currentTurnId)
    }

    for (const approvalId of session.pendingApprovalIds) {
        const approval = state.pendingApprovals[approvalId]
        if (approval !== undefined) {
            requiredTurnIds.add(approval.turnId)
        }
    }

    for (const inputId of session.pendingInputIds) {
        const input = state.requestedInputs[inputId]
        if (input !== undefined) {
            requiredTurnIds.add(input.turnId)
        }
    }

    const turns = session.turnIds.map((turnId) => state.turns[turnId]).filter((turn): turn is SessionTurn => turn !== undefined)
    const recentTurns = [...turns].sort((left, right) => turnTimestamp(right).localeCompare(turnTimestamp(left)))
    const retainedTurnIds = new Set<TurnId>()

    for (const turnId of Array.from(requiredTurnIds)) {
        if (state.turns[turnId] !== undefined) {
            retainedTurnIds.add(turnId)
        }
    }

    for (const turn of recentTurns) {
        if (retainedTurnIds.size >= policy.maxTurnsPerSession && !retainedTurnIds.has(turn.id)) {
            break
        }
        retainedTurnIds.add(turn.id)
    }

    return turns.filter((turn) => retainedTurnIds.has(turn.id))
}

const selectRetainedSteps = (steps: readonly TurnStep[], policy: CockpitEventRetentionPolicy): TurnStep[] => {
    if (steps.length <= policy.maxStepsPerTurn) {
        return steps.map((step) => ({ ...step }))
    }

    return [...steps]
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, policy.maxStepsPerTurn)
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
        .map((step) => ({ ...step }))
}

const selectRetainedCommandOutcomes = (
    state: CockpitProjectionState,
    retainedSessionIds: Set<SessionId>,
    policy: CockpitEventRetentionPolicy,
): CockpitProjectionState["commandOutcomes"][string][] =>
    Object.values(state.commandOutcomes)
        .filter((outcome) => retainedSessionIds.has(outcome.sessionId))
        .sort((left, right) => right.handledAt.localeCompare(left.handledAt))
        .slice(0, policy.maxCommandOutcomes)
        .sort((left, right) => left.handledAt.localeCompare(right.handledAt))

const selectRetainedStaleEvents = (
    events: readonly CockpitProjectionEvent[],
    state: CockpitProjectionState,
    policy: CockpitEventRetentionPolicy,
): CockpitProjectionEvent[] => {
    if (policy.maxStaleEvents === 0) {
        return []
    }

    return events
        .filter((event) => isStaleAgainstProjectedState(event, state))
        .slice(-policy.maxStaleEvents)
        .map(cloneProjectionEvent)
}

const isStaleAgainstProjectedState = (event: CockpitProjectionEvent, state: CockpitProjectionState): boolean => {
    const scope = eventScope(event)
    if (scope === null) {
        return false
    }
    return state.sessions[scope.sessionId]?.sessionEpoch !== scope.sessionEpoch
}

const eventScope = (event: CockpitProjectionEvent): { sessionId: SessionId; sessionEpoch: string } | null => {
    switch (event.kind) {
        case "session_hello":
            return null
        case "session_status_changed":
        case "turn_step_added":
        case "turn_status_changed":
        case "approval_resolved":
        case "user_input_resolved":
            return { sessionId: event.sessionId, sessionEpoch: event.sessionEpoch }
        case "turn_started":
            return { sessionId: event.turn.sessionId, sessionEpoch: event.sessionEpoch }
        case "approval_requested":
            return { sessionId: event.approval.sessionId, sessionEpoch: event.approval.sessionEpoch }
        case "user_input_requested":
            return { sessionId: event.input.sessionId, sessionEpoch: event.input.sessionEpoch }
        case "command_outcome":
            return { sessionId: event.outcome.sessionId, sessionEpoch: event.outcome.sessionEpoch }
    }
}

const turnTimestamp = (turn: SessionTurn): string => turn.completedAt ?? turn.startedAt

const sessionHelloEvent = (session: ProjectedCockpitSession): CockpitProjectionEvent => ({
    kind: "session_hello",
    session: toEveryCodeSession(session),
})

const toEveryCodeSession = (session: ProjectedCockpitSession): EveryCodeSession => ({
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

const cloneProjectionEvent = (event: CockpitProjectionEvent): CockpitProjectionEvent =>
    JSON.parse(JSON.stringify(event)) as CockpitProjectionEvent
