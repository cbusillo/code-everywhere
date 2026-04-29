import type {
    CommandOutcome,
    CockpitNotification,
    CockpitProjectionEvent,
    CockpitProjectionState,
    PendingApproval,
    ProjectedCockpitSession,
    RequestedInput,
    SessionCommand,
    SessionId,
    SessionTrust,
    SessionTurn,
    StaleCockpitEvent,
} from "@code-everywhere/contracts"
import {
    createDefaultSessionTrust,
    createEmptyCockpitState,
    getAttentionSessionIds,
    getProjectedSessions,
    projectCockpitEvent,
} from "@code-everywhere/contracts"

import type { LocalTrustRegistrySnapshot, LocalTrustRegistryStore } from "./trust.js"

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

export type CockpitEventStoreOptions = {
    trustStore?: LocalTrustRegistryStore
}

export type CockpitCommandRecord = {
    id: string
    receivedAt: string
    deliveredAt: string | null
    command: SessionCommand
}

export type CockpitCommandSnapshot = {
    commandCount: number
    commands: CockpitCommandRecord[]
}

export type CockpitCommandClaim = {
    claimedAt: string
    commandCount: number
    commands: CockpitCommandRecord[]
}

export type CockpitCommandClaimFilter = {
    sessionId?: SessionId
}

export type CockpitCommandStore = {
    enqueue: (command: SessionCommand) => CockpitCommandSnapshot
    claimUndelivered: (filter?: CockpitCommandClaimFilter) => CockpitCommandClaim
    getSnapshot: () => CockpitCommandSnapshot
    getCommands: () => CockpitCommandRecord[]
    reset: (commands?: SessionCommand[]) => CockpitCommandSnapshot
}

export type CockpitCommandStoreOptions = {
    now?: () => Date
    createId?: (nextIndex: number) => string
    initialRecords?: CockpitCommandRecord[]
}

export const createCockpitEventStore = (
    initialEvents: CockpitProjectionEvent[] = [],
    options: CockpitEventStoreOptions = {},
): CockpitEventStore => {
    let events: CockpitProjectionEvent[] = []
    let state = createEmptyCockpitState()

    const getSnapshot = (): CockpitIngestionSnapshot => createSnapshot(state, events.length, options.trustStore?.getSnapshot())

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

export const createCockpitCommandStore = (
    initialCommands: SessionCommand[] = [],
    options: CockpitCommandStoreOptions = {},
): CockpitCommandStore => {
    const now = options.now ?? (() => new Date())
    const createId = options.createId ?? ((nextIndex: number) => `command-${String(nextIndex)}`)
    let commands: CockpitCommandRecord[] = options.initialRecords?.map(cloneCommandRecord) ?? []

    const getSnapshot = (): CockpitCommandSnapshot => ({
        commandCount: commands.length,
        commands: commands.map(cloneCommandRecord),
    })

    const claimUndelivered = (filter: CockpitCommandClaimFilter = {}): CockpitCommandClaim => {
        const claimedAt = now().toISOString()
        const claimedCommands: CockpitCommandRecord[] = []

        commands = commands.map((record) => {
            if (record.deliveredAt !== null || (filter.sessionId !== undefined && record.command.sessionId !== filter.sessionId)) {
                return record
            }

            const claimedRecord = {
                ...record,
                deliveredAt: claimedAt,
            }
            claimedCommands.push(claimedRecord)
            return claimedRecord
        })

        return {
            claimedAt,
            commandCount: claimedCommands.length,
            commands: claimedCommands.map(cloneCommandRecord),
        }
    }

    const enqueue = (command: SessionCommand): CockpitCommandSnapshot => {
        commands = [
            ...commands,
            {
                id: createId(commands.length + 1),
                receivedAt: now().toISOString(),
                deliveredAt: null,
                command: cloneCommand(command),
            },
        ]
        return getSnapshot()
    }

    const reset = (nextCommands: SessionCommand[] = []): CockpitCommandSnapshot => {
        commands = []
        for (const command of nextCommands) {
            enqueue(command)
        }
        return getSnapshot()
    }

    const store = {
        enqueue,
        claimUndelivered,
        getSnapshot,
        getCommands: () => commands.map(cloneCommandRecord),
        reset,
    }

    if (initialCommands.length > 0) {
        store.reset(initialCommands)
    }

    return store
}

const createSnapshot = (
    state: CockpitProjectionState,
    eventCount: number,
    trustSnapshot?: LocalTrustRegistrySnapshot,
): CockpitIngestionSnapshot => {
    const clonedState = annotateProjectionStateTrust(cloneProjectionState(state), trustSnapshot)

    return {
        eventCount,
        state: clonedState,
        sessions: getProjectedSessions(clonedState).map(cloneProjectedSession),
        attentionSessionIds: getAttentionSessionIds(clonedState),
    }
}

const annotateProjectionStateTrust = (
    state: CockpitProjectionState,
    trustSnapshot: LocalTrustRegistrySnapshot | undefined,
): CockpitProjectionState => ({
    ...state,
    sessions: Object.fromEntries(
        Object.entries(state.sessions).map(([sessionId, session]) => [
            sessionId,
            {
                ...session,
                trust: resolveSessionTrust(session, trustSnapshot),
            },
        ]),
    ),
})

export const resolveSessionTrust = (
    session: Pick<ProjectedCockpitSession, "hostId" | "hostLabel">,
    trustSnapshot: LocalTrustRegistrySnapshot | undefined,
): SessionTrust => {
    const defaultTrust = createDefaultSessionTrust(session)
    if (defaultTrust.hostId === null) {
        return defaultTrust
    }

    const hostRecord = trustSnapshot?.hosts.find((host) => host.hostId === defaultTrust.hostId)
    if (hostRecord === undefined) {
        return defaultTrust
    }

    return {
        status: hostRecord.status,
        hostId: hostRecord.hostId,
        hostLabel: session.hostLabel,
        trustedHostLabel: hostRecord.label,
        lastSeenAt: hostRecord.lastSeenAt,
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
        case "command_outcome":
            return {
                kind: event.kind,
                outcome: cloneCommandOutcome(event.outcome),
            }
    }
}

const cloneProjectionState = (state: CockpitProjectionState): CockpitProjectionState => ({
    sessions: cloneRecord(state.sessions, cloneProjectedSession),
    turns: cloneRecord(state.turns, cloneTurn),
    pendingApprovals: cloneRecord(state.pendingApprovals, cloneApproval),
    requestedInputs: cloneRecord(state.requestedInputs, cloneRequestedInput),
    commandOutcomes: cloneRecord(state.commandOutcomes, cloneCommandOutcome),
    notifications: state.notifications.map(cloneNotification),
    staleEvents: state.staleEvents.map(cloneStaleEvent),
})

const cloneRecord = <Value>(record: Record<string, Value>, cloneValue: (value: Value) => Value): Record<string, Value> =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, cloneValue(value)]))

const cloneProjectedSession = (session: ProjectedCockpitSession): ProjectedCockpitSession => ({
    ...session,
    trust: { ...session.trust },
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

const cloneCommandOutcome = (outcome: CommandOutcome): CommandOutcome => ({ ...outcome })

const cloneCommandRecord = (record: CockpitCommandRecord): CockpitCommandRecord => ({
    ...record,
    command: cloneCommand(record.command),
})

const cloneCommand = (command: SessionCommand): SessionCommand => {
    switch (command.kind) {
        case "reply":
            return { ...command }
        case "continue_autonomously":
        case "pause_current_turn":
        case "end_session":
        case "status_request":
            return { ...command }
        case "approval_decision":
            return { ...command }
        case "request_user_input_response":
            return {
                ...command,
                answers: command.answers.map((answer) => ({ ...answer })),
            }
    }
}

const cloneNotification = (notification: CockpitNotification): CockpitNotification => ({ ...notification })

const cloneStaleEvent = (event: StaleCockpitEvent): StaleCockpitEvent => ({ ...event })
