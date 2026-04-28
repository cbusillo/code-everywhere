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

export type CockpitPersistenceSnapshot = {
    version: 1
    events: CockpitProjectionEvent[]
    commands: CockpitCommandRecord[]
}

export type PersistentCockpitStores = {
    store: CockpitEventStore
    commandStore: CockpitCommandStore
}

export class CockpitPersistenceError extends Error {}

const emptyPersistenceSnapshot = (): CockpitPersistenceSnapshot => ({
    version: 1,
    events: [],
    commands: [],
})

export const createPersistentCockpitStores = (filePath: string): PersistentCockpitStores => {
    const snapshot = readCockpitPersistenceFile(filePath)
    const eventStore = createCockpitEventStore(snapshot.events)
    const commandStore = createCockpitCommandStore([], { initialRecords: snapshot.commands })

    const persist = (): void => {
        writeCockpitPersistenceFile(filePath, {
            version: 1,
            events: eventStore.getEvents(),
            commands: commandStore.getCommands(),
        })
    }

    return {
        store: {
            ingest: (event) => {
                const nextSnapshot = eventStore.ingest(event)
                persist()
                return nextSnapshot
            },
            ingestMany: (events) => {
                const nextSnapshot = eventStore.ingestMany(events)
                persist()
                return nextSnapshot
            },
            getSnapshot: eventStore.getSnapshot,
            getEvents: eventStore.getEvents,
            reset: (events) => {
                const nextSnapshot = eventStore.reset(events)
                persist()
                return nextSnapshot
            },
        },
        commandStore: {
            enqueue: (command) => {
                const nextSnapshot = commandStore.enqueue(command)
                persist()
                return nextSnapshot
            },
            claimUndelivered: (filter) => {
                const claim = commandStore.claimUndelivered(filter)
                persist()
                return claim
            },
            getSnapshot: commandStore.getSnapshot,
            getCommands: commandStore.getCommands,
            reset: (commands) => {
                const nextSnapshot = commandStore.reset(commands)
                persist()
                return nextSnapshot
            },
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
