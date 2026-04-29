import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export type LocalTrustRecordStatus = "trusted" | "revoked"

export type LocalOperatorTrustRecord = {
    operatorId: string
    label: string
    createdAt: string
    lastSeenAt: string | null
    status: LocalTrustRecordStatus
}

export type LocalHostTrustRecord = {
    hostId: string
    label: string
    createdAt: string
    lastSeenAt: string | null
    status: LocalTrustRecordStatus
}

export type LocalDeviceTrustRecord = {
    deviceId: string
    label: string
    createdAt: string
    lastSeenAt: string | null
    status: LocalTrustRecordStatus
}

export type LocalTrustRegistrySnapshot = {
    version: 1
    operator: LocalOperatorTrustRecord | null
    hosts: LocalHostTrustRecord[]
    devices: LocalDeviceTrustRecord[]
}

export type LocalTrustRegistryStore = {
    getSnapshot: () => LocalTrustRegistrySnapshot
    replace: (snapshot?: LocalTrustRegistrySnapshot) => LocalTrustRegistrySnapshot
    setOperator: (operator: LocalOperatorTrustRecord | null) => LocalTrustRegistrySnapshot
    upsertHost: (host: LocalHostTrustRecord) => LocalTrustRegistrySnapshot
    upsertDevice: (device: LocalDeviceTrustRecord) => LocalTrustRegistrySnapshot
    revokeHost: (hostId: string, revokedAt: string) => LocalTrustRegistrySnapshot
    revokeDevice: (deviceId: string, revokedAt: string) => LocalTrustRegistrySnapshot
}

export type LocalTrustRegistryStoreOptions = {
    writeSnapshot?: (filePath: string, snapshot: LocalTrustRegistrySnapshot) => void
}

export class LocalTrustRegistryError extends Error {}

export const createEmptyLocalTrustRegistrySnapshot = (): LocalTrustRegistrySnapshot => ({
    version: 1,
    operator: null,
    hosts: [],
    devices: [],
})

export const createLocalTrustRegistryStore = (
    initialSnapshot: LocalTrustRegistrySnapshot = createEmptyLocalTrustRegistrySnapshot(),
): LocalTrustRegistryStore => {
    let snapshot = cloneLocalTrustRegistrySnapshot(initialSnapshot)

    const update = (mutate: (current: LocalTrustRegistrySnapshot) => LocalTrustRegistrySnapshot): LocalTrustRegistrySnapshot => {
        snapshot = cloneLocalTrustRegistrySnapshot(mutate(cloneLocalTrustRegistrySnapshot(snapshot)))
        return cloneLocalTrustRegistrySnapshot(snapshot)
    }

    return {
        getSnapshot: () => cloneLocalTrustRegistrySnapshot(snapshot),
        replace: (nextSnapshot = createEmptyLocalTrustRegistrySnapshot()) => update(() => nextSnapshot),
        setOperator: (operator) =>
            update((current) => ({
                ...current,
                operator: operator === null ? null : { ...operator },
            })),
        upsertHost: (host) =>
            update((current) => ({
                ...current,
                hosts: upsertById(current.hosts, host, "hostId"),
            })),
        upsertDevice: (device) =>
            update((current) => ({
                ...current,
                devices: upsertById(current.devices, device, "deviceId"),
            })),
        revokeHost: (hostId, revokedAt) =>
            update((current) => ({
                ...current,
                hosts: current.hosts.map((host) =>
                    host.hostId === hostId ? { ...host, lastSeenAt: revokedAt, status: "revoked" } : host,
                ),
            })),
        revokeDevice: (deviceId, revokedAt) =>
            update((current) => ({
                ...current,
                devices: current.devices.map((device) =>
                    device.deviceId === deviceId ? { ...device, lastSeenAt: revokedAt, status: "revoked" } : device,
                ),
            })),
    }
}

export const createPersistentLocalTrustRegistryStore = (
    filePath: string,
    options: LocalTrustRegistryStoreOptions = {},
): LocalTrustRegistryStore => {
    const writeSnapshot = options.writeSnapshot ?? writeLocalTrustRegistryFile
    const store = createLocalTrustRegistryStore(readLocalTrustRegistryFile(filePath))

    const persistOrRollback = (mutate: () => LocalTrustRegistrySnapshot): LocalTrustRegistrySnapshot => {
        const previousSnapshot = store.getSnapshot()

        try {
            const snapshot = mutate()
            writeSnapshot(filePath, snapshot)
            return snapshot
        } catch (error) {
            store.replace(previousSnapshot)
            throw error
        }
    }

    return {
        getSnapshot: store.getSnapshot,
        replace: (snapshot) => persistOrRollback(() => store.replace(snapshot)),
        setOperator: (operator) => persistOrRollback(() => store.setOperator(operator)),
        upsertHost: (host) => persistOrRollback(() => store.upsertHost(host)),
        upsertDevice: (device) => persistOrRollback(() => store.upsertDevice(device)),
        revokeHost: (hostId, revokedAt) => persistOrRollback(() => store.revokeHost(hostId, revokedAt)),
        revokeDevice: (deviceId, revokedAt) => persistOrRollback(() => store.revokeDevice(deviceId, revokedAt)),
    }
}

export const readLocalTrustRegistryFile = (filePath: string): LocalTrustRegistrySnapshot => {
    if (!existsSync(filePath)) {
        return createEmptyLocalTrustRegistrySnapshot()
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown
    } catch (error) {
        throw new LocalTrustRegistryError(
            `Unable to read local trust registry ${filePath}: ${error instanceof Error ? error.message : "invalid JSON"}`,
        )
    }

    if (!isLocalTrustRegistrySnapshot(parsed)) {
        throw new LocalTrustRegistryError(`Local trust registry ${filePath} did not match the expected shape`)
    }

    return cloneLocalTrustRegistrySnapshot(parsed)
}

export const writeLocalTrustRegistryFile = (filePath: string, snapshot: LocalTrustRegistrySnapshot): void => {
    mkdirSync(dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.${String(process.pid)}.tmp`
    writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`)
    renameSync(tempPath, filePath)
}

const cloneLocalTrustRegistrySnapshot = (snapshot: LocalTrustRegistrySnapshot): LocalTrustRegistrySnapshot => ({
    version: 1,
    operator: snapshot.operator === null ? null : { ...snapshot.operator },
    hosts: snapshot.hosts.map((host) => ({ ...host })),
    devices: snapshot.devices.map((device) => ({ ...device })),
})

const upsertById = <RecordType extends Record<IdKey, string>, IdKey extends keyof RecordType>(
    records: RecordType[],
    record: RecordType,
    idKey: IdKey,
): RecordType[] => {
    const existingIndex = records.findIndex((candidate) => candidate[idKey] === record[idKey])
    const nextRecord = { ...record }

    if (existingIndex === -1) {
        return [...records, nextRecord]
    }

    return records.map((candidate, index) => (index === existingIndex ? nextRecord : candidate))
}

const isLocalTrustRegistrySnapshot = (value: unknown): value is LocalTrustRegistrySnapshot =>
    isRecord(value) &&
    value.version === 1 &&
    (value.operator === null || isOperatorTrustRecord(value.operator)) &&
    Array.isArray(value.hosts) &&
    value.hosts.every(isHostTrustRecord) &&
    Array.isArray(value.devices) &&
    value.devices.every(isDeviceTrustRecord)

const isOperatorTrustRecord = (value: unknown): value is LocalOperatorTrustRecord =>
    isRecord(value) &&
    isString(value.operatorId) &&
    isString(value.label) &&
    isString(value.createdAt) &&
    isNullableString(value.lastSeenAt) &&
    isTrustRecordStatus(value.status)

const isHostTrustRecord = (value: unknown): value is LocalHostTrustRecord =>
    isRecord(value) &&
    isString(value.hostId) &&
    isString(value.label) &&
    isString(value.createdAt) &&
    isNullableString(value.lastSeenAt) &&
    isTrustRecordStatus(value.status)

const isDeviceTrustRecord = (value: unknown): value is LocalDeviceTrustRecord =>
    isRecord(value) &&
    isString(value.deviceId) &&
    isString(value.label) &&
    isString(value.createdAt) &&
    isNullableString(value.lastSeenAt) &&
    isTrustRecordStatus(value.status)

const isTrustRecordStatus = (value: unknown): value is LocalTrustRecordStatus => value === "trusted" || value === "revoked"

const isNullableString = (value: unknown): value is string | null => value === null || isString(value)

const isString = (value: unknown): value is string => typeof value === "string"

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
