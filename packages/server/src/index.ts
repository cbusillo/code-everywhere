import type {
    CockpitNotification,
    CockpitProjectionEvent,
    CockpitProjectionState,
    PendingApproval,
    ProjectedCockpitSession,
    RequestedInput,
    SessionId,
    SessionTurn,
    StaleCockpitEvent,
} from "@code-everywhere/contracts"
import {
    createEmptyCockpitState,
    getAttentionSessionIds,
    getProjectedSessions,
    projectCockpitEvent,
} from "@code-everywhere/contracts"

export type CockpitIngestionSnapshot = {
    eventCount: number
    state: CockpitProjectionState
    sessions: ProjectedCockpitSession[]
    attentionSessionIds: SessionId[]
}

export type CockpitEventStore = {
    ingest: (event: CockpitProjectionEvent) => CockpitIngestionSnapshot
    ingestMany: (events: CockpitProjectionEvent[]) => CockpitIngestionSnapshot
    getSnapshot: () => CockpitIngestionSnapshot
    getEvents: () => CockpitProjectionEvent[]
    reset: (events?: CockpitProjectionEvent[]) => CockpitIngestionSnapshot
}

export const createCockpitEventStore = (initialEvents: CockpitProjectionEvent[] = []): CockpitEventStore => {
    let events: CockpitProjectionEvent[] = []
    let state = createEmptyCockpitState()

    const getSnapshot = (): CockpitIngestionSnapshot => createSnapshot(state, events.length)

    const ingest = (event: CockpitProjectionEvent): CockpitIngestionSnapshot => {
        const eventCopy = cloneEvent(event)
        events = [...events, eventCopy]
        state = projectCockpitEvent(state, eventCopy)
        return getSnapshot()
    }

    const ingestMany = (nextEvents: CockpitProjectionEvent[]): CockpitIngestionSnapshot => {
        for (const event of nextEvents) {
            const eventCopy = cloneEvent(event)
            events = [...events, eventCopy]
            state = projectCockpitEvent(state, eventCopy)
        }
        return getSnapshot()
    }

    const reset = (nextEvents: CockpitProjectionEvent[] = []): CockpitIngestionSnapshot => {
        events = []
        state = createEmptyCockpitState()
        return ingestMany(nextEvents)
    }

    const store = {
        ingest,
        ingestMany,
        getSnapshot,
        getEvents: () => events.map(cloneEvent),
        reset,
    }

    if (initialEvents.length > 0) {
        store.ingestMany(initialEvents)
    }

    return store
}

const createSnapshot = (state: CockpitProjectionState, eventCount: number): CockpitIngestionSnapshot => {
    const clonedState = cloneProjectionState(state)

    return {
        eventCount,
        state: clonedState,
        sessions: getProjectedSessions(clonedState).map(cloneProjectedSession),
        attentionSessionIds: getAttentionSessionIds(clonedState),
    }
}

const cloneEvent = (event: CockpitProjectionEvent): CockpitProjectionEvent => {
    switch (event.kind) {
        case "session_hello":
            return {
                kind: event.kind,
                session: { ...event.session },
            }
        case "session_status_changed":
            return { ...event }
        case "turn_started":
            return {
                kind: event.kind,
                sessionEpoch: event.sessionEpoch,
                turn: cloneTurn(event.turn),
            }
        case "turn_step_added":
            return {
                ...event,
                step: { ...event.step },
            }
        case "turn_status_changed":
            return { ...event }
        case "approval_requested":
            return {
                kind: event.kind,
                approval: cloneApproval(event.approval),
            }
        case "approval_resolved":
            return { ...event }
        case "user_input_requested":
            return {
                kind: event.kind,
                input: cloneRequestedInput(event.input),
            }
        case "user_input_resolved":
            return { ...event }
    }
}

const cloneProjectionState = (state: CockpitProjectionState): CockpitProjectionState => ({
    sessions: cloneRecord(state.sessions, cloneProjectedSession),
    turns: cloneRecord(state.turns, cloneTurn),
    pendingApprovals: cloneRecord(state.pendingApprovals, cloneApproval),
    requestedInputs: cloneRecord(state.requestedInputs, cloneRequestedInput),
    notifications: state.notifications.map(cloneNotification),
    staleEvents: state.staleEvents.map(cloneStaleEvent),
})

const cloneRecord = <Value>(record: Record<string, Value>, cloneValue: (value: Value) => Value): Record<string, Value> =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, cloneValue(value)]))

const cloneProjectedSession = (session: ProjectedCockpitSession): ProjectedCockpitSession => ({
    ...session,
    pendingApprovalIds: [...session.pendingApprovalIds],
    pendingInputIds: [...session.pendingInputIds],
    turnIds: [...session.turnIds],
})

const cloneTurn = (turn: SessionTurn): SessionTurn => ({
    ...turn,
    steps: turn.steps.map((step) => ({ ...step })),
})

const cloneApproval = (approval: PendingApproval): PendingApproval => ({ ...approval })

const cloneRequestedInput = (input: RequestedInput): RequestedInput => ({
    ...input,
    questions: input.questions.map((question) => ({
        ...question,
        options: question.options.map((option) => ({ ...option })),
    })),
})

const cloneNotification = (notification: CockpitNotification): CockpitNotification => ({ ...notification })

const cloneStaleEvent = (event: StaleCockpitEvent): StaleCockpitEvent => ({ ...event })
