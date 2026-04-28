import { dirname } from "node:path"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"

import type { CockpitProjectionEvent } from "@code-everywhere/contracts"

import {
    createCockpitCommandStore,
    createCockpitEventStore,
    type CockpitCommandRecord,
    type CockpitCommandStore,
    type CockpitEventStore,
} from "./index.js"
import { isCockpitProjectionEvent, isSessionCommand } from "./http.js"
import { compactCockpitEvents, defaultCockpitEventRetentionPolicy, type CockpitEventRetentionPolicy } from "./retention.js"

export type CockpitPersistenceSnapshot = {
    version: 1
    events: CockpitProjectionEvent[]
    commands: CockpitCommandRecord[]
}

export type PersistentCockpitStores = {
    store: CockpitEventStore
    commandStore: CockpitCommandStore
}

export type CockpitPersistenceOptions = {
    writeSnapshot?: (filePath: string, snapshot: CockpitPersistenceSnapshot) => void
    eventRetentionPolicy?: CockpitEventRetentionPolicy | null
}

export class CockpitPersistenceError extends Error {}

const emptyPersistenceSnapshot = (): CockpitPersistenceSnapshot => ({
    version: 1,
    events: [],
    commands: [],
})

export const createPersistentCockpitStores = (
    filePath: string,
    options: CockpitPersistenceOptions = {},
): PersistentCockpitStores => {
    const writeSnapshot = options.writeSnapshot ?? writeCockpitPersistenceFile
    const eventRetentionPolicy =
        options.eventRetentionPolicy === undefined ? defaultCockpitEventRetentionPolicy : options.eventRetentionPolicy
    const snapshot = readCockpitPersistenceFile(filePath)
    let eventStore = createCockpitEventStore(snapshot.events)
    let commandStore = createCockpitCommandStore([], { initialRecords: snapshot.commands })

    const restore = (previousSnapshot: CockpitPersistenceSnapshot): void => {
        eventStore = createCockpitEventStore(previousSnapshot.events)
        commandStore = createCockpitCommandStore([], { initialRecords: previousSnapshot.commands })
    }

    const rawSnapshot = (): CockpitPersistenceSnapshot => ({
        version: 1,
        events: eventStore.getEvents(),
        commands: commandStore.getCommands(),
    })

    const currentSnapshot = (): CockpitPersistenceSnapshot => {
        const snapshot = rawSnapshot()
        return {
            ...snapshot,
            events: eventRetentionPolicy === null ? snapshot.events : compactCockpitEvents(snapshot.events, eventRetentionPolicy),
        }
    }

    const persist = (): void => {
        writeSnapshot(filePath, currentSnapshot())
    }

    const persistOrRollback = <Value>(mutate: () => Value): Value => {
        const previousSnapshot = rawSnapshot()

        try {
            const value = mutate()
            persist()
            return value
        } catch (error) {
            restore(previousSnapshot)
            throw error
        }
    }

    return {
        store: {
            ingest: (event) => persistOrRollback(() => eventStore.ingest(event)),
            ingestMany: (events) => persistOrRollback(() => eventStore.ingestMany(events)),
            getSnapshot: () => eventStore.getSnapshot(),
            getEvents: () => eventStore.getEvents(),
            reset: (events) => persistOrRollback(() => eventStore.reset(events)),
        },
        commandStore: {
            enqueue: (command) => persistOrRollback(() => commandStore.enqueue(command)),
            claimUndelivered: (filter) => persistOrRollback(() => commandStore.claimUndelivered(filter)),
            getSnapshot: () => commandStore.getSnapshot(),
            getCommands: () => commandStore.getCommands(),
            reset: (commands) => persistOrRollback(() => commandStore.reset(commands)),
        },
    }
}

export const readCockpitPersistenceFile = (filePath: string): CockpitPersistenceSnapshot => {
    if (!existsSync(filePath)) {
        return emptyPersistenceSnapshot()
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown
    } catch (error) {
        throw new CockpitPersistenceError(
            `Unable to read cockpit persistence file ${filePath}: ${error instanceof Error ? error.message : "invalid JSON"}`,
        )
    }

    if (!isCockpitPersistenceSnapshot(parsed)) {
        throw new CockpitPersistenceError(`Cockpit persistence file ${filePath} did not match the expected shape`)
    }

    return parsed
}

export const writeCockpitPersistenceFile = (filePath: string, snapshot: CockpitPersistenceSnapshot): void => {
    mkdirSync(dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.${String(process.pid)}.tmp`
    writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`)
    renameSync(tempPath, filePath)
}

const isCockpitPersistenceSnapshot = (value: unknown): value is CockpitPersistenceSnapshot =>
    isRecord(value) &&
    value.version === 1 &&
    Array.isArray(value.events) &&
    value.events.every(isCockpitProjectionEvent) &&
    Array.isArray(value.commands) &&
    value.commands.every(isCockpitCommandRecord)

const isCockpitCommandRecord = (value: unknown): value is CockpitCommandRecord =>
    isRecord(value) &&
    isString(value.id) &&
    isString(value.receivedAt) &&
    (value.deliveredAt === null || isString(value.deliveredAt)) &&
    isSessionCommand(value.command)

const isString = (value: unknown): value is string => typeof value === "string"

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
