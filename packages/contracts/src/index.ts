export type SessionId = string
export type SessionEpoch = string
export type TurnId = string

export type EveryCodeSession = {
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    hostId?: string
    hostLabel: string
    cwd: string
    branch: string | null
    pid: number
    model: string
    status: SessionStatus
    summary: string
    startedAt: string
    updatedAt: string
    currentTurnId: TurnId | null
}

export type SessionStatus = "running" | "idle" | "blocked" | "waiting-for-input" | "waiting-for-approval" | "ended" | "error"

export type TurnStatus = "running" | "completed" | "blocked" | "waiting-for-input" | "waiting-for-approval" | "error"

export type SessionTrustStatus = "trusted" | "unknown" | "revoked" | "unidentified"

export type SessionTrust = {
    status: SessionTrustStatus
    hostId: string | null
    hostLabel: string
    trustedHostLabel: string | null
    lastSeenAt: string | null
}

export type SessionTurn = {
    id: TurnId
    sessionId: SessionId
    title: string
    status: TurnStatus
    actor: "operator" | "assistant" | "system"
    startedAt: string
    completedAt: string | null
    summary: string
    steps: TurnStep[]
}

export type TurnStep = {
    id: string
    kind: "message" | "tool" | "status" | "diff" | "artifact" | "error"
    title: string
    detail: string
    timestamp: string
    state: "pending" | "running" | "completed" | "blocked" | "error"
}

export type PendingApproval = {
    id: string
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    turnId: TurnId
    title: string
    body: string
    command: string
    cwd: string
    risk: "low" | "medium" | "high"
    requestedAt: string
}

export type RequestedInput = {
    id: string
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    turnId: TurnId
    title: string
    requestedAt: string
    questions: RequestedInputQuestion[]
}

export type SessionCommand =
    | {
          kind: "reply"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          content: string
      }
    | {
          kind: "continue_autonomously" | "pause_current_turn" | "end_session" | "status_request"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
      }
    | {
          kind: "approval_decision"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          approvalId: string
          decision: "approve" | "deny"
      }
    | {
          kind: "request_user_input_response"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          inputId?: string
          turnId: TurnId
          answers: RequestedInputAnswer[]
      }

export type CommandOutcomeStatus = "accepted" | "rejected"

export type CommandOutcome = {
    commandId: string
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    commandKind: SessionCommand["kind"]
    status: CommandOutcomeStatus
    reason: string | null
    handledAt: string
}

export type RequestedInputAnswer = {
    questionId: string
    value: string
}

export type CockpitEvent =
    | {
          kind: "session_seen"
          session: EveryCodeSession
      }
    | {
          kind: "session_status_changed"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          status: SessionStatus
      }
    | {
          kind: "approval_requested"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          approvalId: string
          title: string
          body: string
      }
    | {
          kind: "user_input_requested"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          turnId: TurnId
          title: string
          questions: RequestedInputQuestion[]
      }

export type RequestedInputQuestion = {
    id: string
    label: string
    prompt: string
    required: boolean
    options: RequestedInputOption[]
}

export type RequestedInputOption = {
    label: string
    value: string
    description?: string
}

export type ProjectedCockpitSession = EveryCodeSession & {
    trust: SessionTrust
    attention: "none" | "approval" | "input" | "blocked" | "error"
    pendingApprovalIds: string[]
    pendingInputIds: string[]
    turnIds: TurnId[]
}

export type CockpitNotification = {
    id: string
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    kind: "approval" | "input" | "blocked" | "error" | "ended" | "stale-event"
    title: string
    createdAt: string
    pendingItemId?: string
}

export type StaleCockpitEvent = {
    eventKind: CockpitProjectionEvent["kind"]
    sessionId: SessionId
    eventEpoch: SessionEpoch
    currentEpoch: SessionEpoch | null
    receivedAt: string
}

export type CockpitProjectionState = {
    sessions: Record<SessionId, ProjectedCockpitSession>
    turns: Record<TurnId, SessionTurn>
    pendingApprovals: Record<string, PendingApproval>
    requestedInputs: Record<string, RequestedInput>
    commandOutcomes: Record<string, CommandOutcome>
    notifications: CockpitNotification[]
    staleEvents: StaleCockpitEvent[]
}

type CockpitEventScope = {
    kind: CockpitProjectionEvent["kind"]
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    receivedAt: string
}

type ProjectableCockpitSession = Omit<ProjectedCockpitSession, "attention"> & {
    attention?: ProjectedCockpitSession["attention"]
}

export type CockpitProjectionEvent =
    | {
          kind: "session_hello"
          session: EveryCodeSession
      }
    | {
          kind: "session_status_changed"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          status: SessionStatus
          summary?: string
          updatedAt: string
      }
    | {
          kind: "turn_started"
          turn: SessionTurn
          sessionEpoch: SessionEpoch
      }
    | {
          kind: "turn_step_added"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          turnId: TurnId
          step: TurnStep
      }
    | {
          kind: "turn_status_changed"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          turnId: TurnId
          status: TurnStatus
          summary?: string
          completedAt?: string | null
      }
    | {
          kind: "approval_requested"
          approval: PendingApproval
      }
    | {
          kind: "approval_resolved"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          approvalId: string
          decision: "approve" | "deny" | "expired"
          resolvedAt: string
      }
    | {
          kind: "user_input_requested"
          input: RequestedInput
      }
    | {
          kind: "user_input_resolved"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          inputId: string
          resolvedAt: string
      }
    | {
          kind: "command_outcome"
          outcome: CommandOutcome
      }

export const createEmptyCockpitState = (): CockpitProjectionState => ({
    sessions: {},
    turns: {},
    pendingApprovals: {},
    requestedInputs: {},
    commandOutcomes: {},
    notifications: [],
    staleEvents: [],
})

export const projectCockpitEvents = (events: CockpitProjectionEvent[]): CockpitProjectionState =>
    events.reduce((state, event) => projectCockpitEvent(state, event), createEmptyCockpitState())

export const projectCockpitEvent = (state: CockpitProjectionState, event: CockpitProjectionEvent): CockpitProjectionState => {
    switch (event.kind) {
        case "session_hello":
            return projectSessionHello(state, event.session)
        case "session_status_changed":
            return withCurrentSession(state, eventScope(event, event.updatedAt), (draft, session) => {
                const nextSession = withAttention({
                    ...session,
                    status: statusWithPendingWork(event.status, session.pendingApprovalIds, session.pendingInputIds),
                    summary: event.summary ?? session.summary,
                    updatedAt: event.updatedAt,
                })
                draft.sessions[event.sessionId] = nextSession
                maybeNotifyForStatus(draft, nextSession, event.updatedAt)
            })
        case "turn_started":
            return withCurrentSession(state, eventScope(event, event.turn.startedAt, event.turn.sessionId), (draft, session) => {
                draft.turns[event.turn.id] = event.turn
                draft.sessions[event.turn.sessionId] = withAttention({
                    ...session,
                    currentTurnId: event.turn.id,
                    status: turnStatusToSessionStatus(event.turn.status),
                    updatedAt: event.turn.startedAt,
                    turnIds: appendUnique(session.turnIds, event.turn.id),
                })
            })
        case "turn_step_added":
            return withCurrentSession(state, eventScope(event, event.step.timestamp), (draft) => {
                const turn = draft.turns[event.turnId]

                if (turn === undefined) {
                    return
                }

                draft.turns[event.turnId] = {
                    ...turn,
                    steps: upsertTurnStep(turn.steps, event.step),
                }
                touchSession(draft, event.sessionId, event.step.timestamp)
            })
        case "turn_status_changed":
            return withCurrentSession(
                state,
                eventScope(event, event.completedAt ?? sessionUpdatedAt(state, event.sessionId)),
                (draft, session) => {
                    const turn = draft.turns[event.turnId]

                    if (turn !== undefined) {
                        draft.turns[event.turnId] = {
                            ...turn,
                            status: event.status,
                            summary: event.summary ?? turn.summary,
                            completedAt: event.completedAt === undefined ? turn.completedAt : event.completedAt,
                        }
                    }

                    const nextSession = withAttention({
                        ...session,
                        status: statusWithPendingWork(
                            turnStatusToSessionStatus(event.status),
                            session.pendingApprovalIds,
                            session.pendingInputIds,
                        ),
                        summary: event.summary ?? session.summary,
                        updatedAt: event.completedAt ?? session.updatedAt,
                    })
                    draft.sessions[event.sessionId] = nextSession
                    maybeNotifyForStatus(draft, nextSession, event.completedAt ?? session.updatedAt)
                },
            )
        case "approval_requested":
            return withCurrentSession(state, approvalEventScope(event), (draft, session) => {
                draft.pendingApprovals[event.approval.id] = event.approval
                markTurnStep(draft, event.approval.turnId, {
                    id: approvalStepId(event.approval.id),
                    kind: "status",
                    title: "Approval required",
                    detail: event.approval.command,
                    timestamp: event.approval.requestedAt,
                    state: "blocked",
                })
                draft.sessions[event.approval.sessionId] = withAttention({
                    ...session,
                    status: "waiting-for-approval",
                    currentTurnId: event.approval.turnId,
                    updatedAt: event.approval.requestedAt,
                    pendingApprovalIds: appendUnique(session.pendingApprovalIds, event.approval.id),
                })
                draft.notifications = appendNotification(draft.notifications, {
                    id: `approval:${event.approval.id}`,
                    sessionId: event.approval.sessionId,
                    sessionEpoch: event.approval.sessionEpoch,
                    kind: "approval",
                    title: event.approval.title,
                    createdAt: event.approval.requestedAt,
                    pendingItemId: event.approval.id,
                })
            })
        case "approval_resolved":
            return withCurrentSession(state, eventScope(event, event.resolvedAt), (draft, session) => {
                draft.pendingApprovals = omitRecordKey(draft.pendingApprovals, event.approvalId)
                const pendingApprovalIds = session.pendingApprovalIds.filter((approvalId) => approvalId !== event.approvalId)
                markTurnStepForPendingItem(draft, session, event.approvalId, approvalStepId, {
                    title: approvalDecisionTitle(event.decision),
                    timestamp: event.resolvedAt,
                    state: event.decision === "deny" ? "error" : "completed",
                })

                draft.sessions[event.sessionId] = withAttention({
                    ...session,
                    status: statusWithPendingWork(session.status, pendingApprovalIds, session.pendingInputIds, {
                        clearWaitingWhenNoPending: true,
                    }),
                    updatedAt: event.resolvedAt,
                    pendingApprovalIds,
                })
            })
        case "user_input_requested":
            return withCurrentSession(state, inputEventScope(event), (draft, session) => {
                draft.requestedInputs[event.input.id] = event.input
                markTurnStep(draft, event.input.turnId, {
                    id: inputStepId(event.input.id),
                    kind: "status",
                    title: "Input requested",
                    detail: event.input.questions.map((question) => question.prompt).join("\n"),
                    timestamp: event.input.requestedAt,
                    state: "blocked",
                })
                draft.sessions[event.input.sessionId] = withAttention({
                    ...session,
                    status: "waiting-for-input",
                    currentTurnId: event.input.turnId,
                    updatedAt: event.input.requestedAt,
                    pendingInputIds: appendUnique(session.pendingInputIds, event.input.id),
                })
                draft.notifications = appendNotification(draft.notifications, {
                    id: `input:${event.input.id}`,
                    sessionId: event.input.sessionId,
                    sessionEpoch: event.input.sessionEpoch,
                    kind: "input",
                    title: event.input.title,
                    createdAt: event.input.requestedAt,
                    pendingItemId: event.input.id,
                })
            })
        case "user_input_resolved":
            return withCurrentSession(state, eventScope(event, event.resolvedAt), (draft, session) => {
                draft.requestedInputs = omitRecordKey(draft.requestedInputs, event.inputId)
                const pendingInputIds = session.pendingInputIds.filter((inputId) => inputId !== event.inputId)
                markTurnStepForPendingItem(draft, session, event.inputId, inputStepId, {
                    title: "Input answered",
                    timestamp: event.resolvedAt,
                    state: "completed",
                })

                draft.sessions[event.sessionId] = withAttention({
                    ...session,
                    status: statusWithPendingWork(session.status, session.pendingApprovalIds, pendingInputIds, {
                        clearWaitingWhenNoPending: true,
                    }),
                    updatedAt: event.resolvedAt,
                    pendingInputIds,
                })
            })
        case "command_outcome":
            return withCurrentSession(state, outcomeEventScope(event), (draft) => {
                draft.commandOutcomes[event.outcome.commandId] = event.outcome
                touchSession(draft, event.outcome.sessionId, event.outcome.handledAt)
            })
    }
}

export const getProjectedSessions = (state: CockpitProjectionState): ProjectedCockpitSession[] =>
    Object.values(state.sessions).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

export const getAttentionSessionIds = (state: CockpitProjectionState): SessionId[] =>
    getProjectedSessions(state)
        .filter((session) => session.attention !== "none")
        .map((session) => session.sessionId)

const projectSessionHello = (state: CockpitProjectionState, session: EveryCodeSession): CockpitProjectionState => {
    const draft = cloneState(state)
    const existing = draft.sessions[session.sessionId]
    const epochChanged = existing !== undefined && existing.sessionEpoch !== session.sessionEpoch

    if (epochChanged) {
        removeSessionEpochItems(draft, session.sessionId)
    }

    draft.sessions[session.sessionId] = withAttention({
        ...session,
        trust: createDefaultSessionTrust(session),
        pendingApprovalIds: epochChanged || existing === undefined ? [] : existing.pendingApprovalIds,
        pendingInputIds: epochChanged || existing === undefined ? [] : existing.pendingInputIds,
        turnIds: epochChanged || existing === undefined ? [] : existing.turnIds,
    })

    return draft
}

export const createDefaultSessionTrust = (session: Pick<EveryCodeSession, "hostId" | "hostLabel">): SessionTrust => ({
    status: session.hostId === undefined || session.hostId.trim() === "" ? "unidentified" : "unknown",
    hostId: session.hostId === undefined || session.hostId.trim() === "" ? null : session.hostId,
    hostLabel: session.hostLabel,
    trustedHostLabel: null,
    lastSeenAt: null,
})

const withCurrentSession = (
    state: CockpitProjectionState,
    scope: CockpitEventScope,
    mutate: (draft: CockpitProjectionState, session: ProjectedCockpitSession) => void,
): CockpitProjectionState => {
    const draft = cloneState(state)
    const session = draft.sessions[scope.sessionId]

    if (session?.sessionEpoch !== scope.sessionEpoch) {
        draft.staleEvents = [
            ...draft.staleEvents,
            {
                eventKind: scope.kind,
                sessionId: scope.sessionId,
                eventEpoch: scope.sessionEpoch,
                currentEpoch: session?.sessionEpoch ?? null,
                receivedAt: scope.receivedAt,
            },
        ]
        draft.notifications = appendNotification(draft.notifications, {
            id: `stale:${scope.kind}:${scope.sessionId}:${scope.sessionEpoch}:${String(draft.staleEvents.length)}`,
            sessionId: scope.sessionId,
            sessionEpoch: scope.sessionEpoch,
            kind: "stale-event",
            title: "Stale session event rejected",
            createdAt: scope.receivedAt,
        })
        return draft
    }

    mutate(draft, session)
    return draft
}

const approvalEventScope = (event: Extract<CockpitProjectionEvent, { kind: "approval_requested" }>) => ({
    kind: event.kind,
    sessionId: event.approval.sessionId,
    sessionEpoch: event.approval.sessionEpoch,
    receivedAt: event.approval.requestedAt,
})

const inputEventScope = (event: Extract<CockpitProjectionEvent, { kind: "user_input_requested" }>) => ({
    kind: event.kind,
    sessionId: event.input.sessionId,
    sessionEpoch: event.input.sessionEpoch,
    receivedAt: event.input.requestedAt,
})

const outcomeEventScope = (event: Extract<CockpitProjectionEvent, { kind: "command_outcome" }>) => ({
    kind: event.kind,
    sessionId: event.outcome.sessionId,
    sessionEpoch: event.outcome.sessionEpoch,
    receivedAt: event.outcome.handledAt,
})

const eventScope = (
    event: Pick<CockpitProjectionEvent, "kind"> & { sessionEpoch: SessionEpoch; sessionId?: SessionId },
    receivedAt: string,
    sessionId = event.sessionId,
): CockpitEventScope => {
    if (sessionId === undefined) {
        throw new Error(`Projection event ${event.kind} is missing a session id`)
    }

    return {
        kind: event.kind,
        sessionId,
        sessionEpoch: event.sessionEpoch,
        receivedAt,
    }
}

const cloneState = (state: CockpitProjectionState): CockpitProjectionState => ({
    sessions: Object.fromEntries(Object.entries(state.sessions).map(([sessionId, session]) => [sessionId, { ...session }])),
    turns: Object.fromEntries(Object.entries(state.turns).map(([turnId, turn]) => [turnId, { ...turn, steps: [...turn.steps] }])),
    pendingApprovals: { ...state.pendingApprovals },
    requestedInputs: { ...state.requestedInputs },
    commandOutcomes: { ...state.commandOutcomes },
    notifications: [...state.notifications],
    staleEvents: [...state.staleEvents],
})

const withAttention = (session: ProjectableCockpitSession): ProjectedCockpitSession => ({
    ...session,
    attention: sessionAttention(session),
})

const sessionAttention = (session: ProjectableCockpitSession): ProjectedCockpitSession["attention"] => {
    if (session.status === "error") {
        return "error"
    }
    if (session.status === "blocked") {
        return "blocked"
    }
    if (session.pendingApprovalIds.length > 0 || session.status === "waiting-for-approval") {
        return "approval"
    }
    if (session.pendingInputIds.length > 0 || session.status === "waiting-for-input") {
        return "input"
    }
    return "none"
}

const turnStatusToSessionStatus = (status: TurnStatus): SessionStatus => {
    switch (status) {
        case "running":
            return "running"
        case "completed":
            return "idle"
        case "blocked":
            return "blocked"
        case "waiting-for-input":
            return "waiting-for-input"
        case "waiting-for-approval":
            return "waiting-for-approval"
        case "error":
            return "error"
    }
}

const statusWithPendingWork = (
    baseStatus: SessionStatus,
    pendingApprovalIds: string[],
    pendingInputIds: string[],
    options: { clearWaitingWhenNoPending?: boolean } = {},
): SessionStatus => {
    if (baseStatus === "blocked" || baseStatus === "error" || baseStatus === "ended") {
        return baseStatus
    }
    if (pendingApprovalIds.length > 0) {
        return "waiting-for-approval"
    }
    if (pendingInputIds.length > 0) {
        return "waiting-for-input"
    }
    if (options.clearWaitingWhenNoPending && (baseStatus === "waiting-for-approval" || baseStatus === "waiting-for-input")) {
        return "idle"
    }
    return baseStatus
}

const removeSessionEpochItems = (state: CockpitProjectionState, sessionId: SessionId): void => {
    removeSessionPendingItems(state, sessionId)
    state.turns = Object.fromEntries(Object.entries(state.turns).filter(([, turn]) => turn.sessionId !== sessionId))
    state.commandOutcomes = Object.fromEntries(
        Object.entries(state.commandOutcomes).filter(([, outcome]) => outcome.sessionId !== sessionId),
    )
}

const removeSessionPendingItems = (state: CockpitProjectionState, sessionId: SessionId): void => {
    state.pendingApprovals = Object.fromEntries(
        Object.entries(state.pendingApprovals).filter(([, approval]) => approval.sessionId !== sessionId),
    )
    state.requestedInputs = Object.fromEntries(
        Object.entries(state.requestedInputs).filter(([, input]) => input.sessionId !== sessionId),
    )
}

const appendUnique = <Value>(values: Value[], value: Value): Value[] => (values.includes(value) ? values : [...values, value])

const markTurnStep = (state: CockpitProjectionState, turnId: TurnId, step: TurnStep): void => {
    const turn = state.turns[turnId]

    if (turn === undefined) {
        return
    }

    state.turns[turnId] = {
        ...turn,
        steps: upsertTurnStep(turn.steps, step),
    }
}

const markTurnStepForPendingItem = (
    state: CockpitProjectionState,
    session: ProjectedCockpitSession,
    pendingItemId: string,
    stepId: (id: string) => string,
    update: Pick<TurnStep, "title" | "timestamp" | "state">,
): void => {
    for (const turnId of session.turnIds) {
        const turn = state.turns[turnId]
        const existingStep = turn?.steps.find((step) => step.id === stepId(pendingItemId))

        if (turn === undefined || existingStep === undefined) {
            continue
        }

        markTurnStep(state, turnId, {
            ...existingStep,
            ...update,
        })
        return
    }
}

const approvalStepId = (approvalId: string): string => `approval:${approvalId}`

const inputStepId = (inputId: string): string => `input:${inputId}`

const approvalDecisionTitle = (decision: "approve" | "deny" | "expired"): string => {
    switch (decision) {
        case "approve":
            return "Approval granted"
        case "deny":
            return "Approval denied"
        case "expired":
            return "Approval expired"
    }
}

const upsertTurnStep = (steps: TurnStep[], step: TurnStep): TurnStep[] => {
    const existingIndex = steps.findIndex((candidate) => candidate.id === step.id)

    if (existingIndex === -1) {
        return [...steps, step]
    }

    return steps.map((candidate, index) => (index === existingIndex ? step : candidate))
}

const appendNotification = (notifications: CockpitNotification[], notification: CockpitNotification): CockpitNotification[] =>
    notifications.some((candidate) => candidate.id === notification.id) ? notifications : [...notifications, notification]

const omitRecordKey = <Value>(record: Record<string, Value>, key: string): Record<string, Value> =>
    Object.fromEntries(Object.entries(record).filter(([candidateKey]) => candidateKey !== key))

const maybeNotifyForStatus = (state: CockpitProjectionState, session: ProjectedCockpitSession, createdAt: string): void => {
    if (session.status !== "blocked" && session.status !== "error" && session.status !== "ended") {
        return
    }

    state.notifications = appendNotification(state.notifications, {
        id: `status:${session.sessionId}:${session.status}:${createdAt}`,
        sessionId: session.sessionId,
        sessionEpoch: session.sessionEpoch,
        kind: session.status === "ended" ? "ended" : session.status,
        title: session.summary,
        createdAt,
    })
}

const sessionUpdatedAt = (state: CockpitProjectionState, sessionId: SessionId): string =>
    state.sessions[sessionId]?.updatedAt ?? new Date(0).toISOString()

const touchSession = (state: CockpitProjectionState, sessionId: SessionId, updatedAt: string): void => {
    const session = state.sessions[sessionId]

    if (session !== undefined) {
        state.sessions[sessionId] = withAttention({
            ...session,
            updatedAt,
        })
    }
}
