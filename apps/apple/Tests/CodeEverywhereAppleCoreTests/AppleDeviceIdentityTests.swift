import Foundation
import Testing

@testable import CodeEverywhereAppleCore

@Suite("Apple device identity")
struct AppleDeviceIdentityTests {
    @Test("creates and persists a stable local device identity")
    func createsStableIdentity() throws {
        let defaults = makeDefaults()
        let store = AppleDeviceIdentityStore(
            defaults: defaults,
            namespace: "device",
            makeUUID: { UUID(uuidString: "A7EF70B7-0255-47D6-82E5-8E7EA4E9A63E")! },
            now: { Date(timeIntervalSince1970: 100) },
            defaultDisplayName: { " Casey's iPad " }
        )

        let created = try store.loadOrCreate()
        let loaded = try store.loadOrCreate()

        #expect(created == loaded)
        #expect(created.deviceId == "apple-a7ef70b7-0255-47d6-82e5-8e7ea4e9a63e")
        #expect(created.displayName == "Casey's iPad")
        #expect(created.platform == "apple")
        #expect(created.createdAt == Date(timeIntervalSince1970: 100))
        #expect(created.lastSeenAt == Date(timeIntervalSince1970: 100))
    }

    @Test("updates last seen without changing the device id")
    func touchesIdentity() throws {
        var currentTime = Date(timeIntervalSince1970: 100)
        let store = AppleDeviceIdentityStore(
            defaults: makeDefaults(),
            namespace: "touch",
            makeUUID: { UUID(uuidString: "A7EF70B7-0255-47D6-82E5-8E7EA4E9A63E")! },
            now: { currentTime },
            defaultDisplayName: { "MacBook Pro" }
        )

        let created = try store.loadOrCreate()
        currentTime = Date(timeIntervalSince1970: 200)
        let touched = try store.touch()

        #expect(touched.deviceId == created.deviceId)
        #expect(touched.createdAt == Date(timeIntervalSince1970: 100))
        #expect(touched.lastSeenAt == Date(timeIntervalSince1970: 200))
    }

    @Test("stores only non-secret metadata in user defaults")
    func storesOnlyNonSecretMetadata() throws {
        let defaults = makeDefaults()
        let store = AppleDeviceIdentityStore(defaults: defaults, namespace: "plain")

        _ = try store.loadOrCreate()

        #expect(defaults.dictionaryRepresentation().keys.contains("plain.appleDeviceIdentity"))
        #expect(defaults.dictionaryRepresentation().keys.allSatisfy { !$0.localizedCaseInsensitiveContains("token") })
        #expect(defaults.dictionaryRepresentation().keys.allSatisfy { !$0.localizedCaseInsensitiveContains("secret") })
    }

    @Test("clears the local identity")
    func clearsIdentity() throws {
        let store = AppleDeviceIdentityStore(defaults: makeDefaults(), namespace: "clear")
        _ = try store.loadOrCreate()

        store.clear()

        #expect(try store.load() == nil)
    }

    private func makeDefaults() -> UserDefaults {
        let suiteName = "CodeEverywhereAppleDeviceIdentityTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        defaults.removePersistentDomain(forName: suiteName)
        return defaults
    }
}
