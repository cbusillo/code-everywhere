import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, it } from "vitest"

import {
    LocalTrustRegistryError,
    createLocalTrustRegistryStore,
    createPersistentLocalTrustRegistryStore,
    readLocalTrustRegistryFile,
} from "@code-everywhere/server/trust"
import type { LocalDeviceTrustRecord, LocalHostTrustRecord, LocalOperatorTrustRecord } from "@code-everywhere/server/trust"

const createdAt = "2026-04-29T18:00:00.000Z"

const operator: LocalOperatorTrustRecord = {
    operatorId: "operator-local",
    label: "Local Operator",
    createdAt,
    lastSeenAt: null,
    status: "trusted",
}

const host: LocalHostTrustRecord = {
    hostId: "host-workhorse",
    label: "Workhorse Mac",
    createdAt,
    lastSeenAt: "2026-04-29T18:01:00.000Z",
    status: "trusted",
}

const device: LocalDeviceTrustRecord = {
    deviceId: "device-phone",
    label: "Callisto iPhone",
    platform: "apple",
    createdAt,
    lastSeenAt: "2026-04-29T18:02:00.000Z",
    status: "trusted",
}

describe("local trust registry", () => {
    it("uses an empty registry when the file is missing", async () => {
        const directory = await mkdtemp(join(tmpdir(), "code-everywhere-trust-"))
        const filePath = join(directory, "trust.json")

        try {
            expect(readLocalTrustRegistryFile(filePath)).toEqual({
                version: 1,
                operator: null,
                hosts: [],
                devices: [],
            })
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })

    it("persists trusted operator, host, and device records separately from auth tokens", async () => {
        const directory = await mkdtemp(join(tmpdir(), "code-everywhere-trust-"))
        const filePath = join(directory, "trust.json")

        try {
            const store = createPersistentLocalTrustRegistryStore(filePath)
            store.setOperator(operator)
            store.upsertHost(host)
            store.upsertDevice(device)

            const reloaded = createPersistentLocalTrustRegistryStore(filePath).getSnapshot()
            const rawFile = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>

            expect(reloaded).toEqual({
                version: 1,
                operator,
                hosts: [host],
                devices: [device],
            })
            expect(JSON.stringify(rawFile)).not.toContain("authToken")
            expect(JSON.stringify(rawFile)).not.toContain("CODE_EVERYWHERE_AUTH_TOKEN")
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })

    it("revokes host and device records without deleting them", () => {
        const store = createLocalTrustRegistryStore()
        store.upsertHost(host)
        store.upsertDevice(device)

        const revokedAt = "2026-04-29T18:03:00.000Z"
        store.revokeHost(host.hostId, revokedAt)
        store.revokeDevice(device.deviceId, revokedAt)

        expect(store.getSnapshot().hosts).toEqual([{ ...host, lastSeenAt: revokedAt, status: "revoked" }])
        expect(store.getSnapshot().devices).toEqual([{ ...device, lastSeenAt: revokedAt, status: "revoked" }])
    })

    it("rejects invalid JSON and invalid registry shapes", async () => {
        const directory = await mkdtemp(join(tmpdir(), "code-everywhere-trust-"))
        const filePath = join(directory, "trust.json")

        try {
            await writeFile(filePath, "not json")
            expect(() => readLocalTrustRegistryFile(filePath)).toThrow(LocalTrustRegistryError)
            expect(() => readLocalTrustRegistryFile(filePath)).toThrow("Unable to read local trust registry")

            await writeFile(filePath, JSON.stringify({ version: 1, hosts: [], devices: [] }))
            expect(() => readLocalTrustRegistryFile(filePath)).toThrow("did not match the expected shape")
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })

    it("rolls back persistent mutations when writes fail", () => {
        const store = createPersistentLocalTrustRegistryStore(`/tmp/code-everywhere-unused-trust-${randomUUID()}.json`, {
            writeSnapshot: () => {
                throw new Error("disk full")
            },
        })

        expect(() => store.upsertHost(host)).toThrow("disk full")
        expect(store.getSnapshot().hosts).toEqual([])
    })
})
