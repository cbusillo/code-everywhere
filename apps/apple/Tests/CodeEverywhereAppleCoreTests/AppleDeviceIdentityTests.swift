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

    @Test("creates broker device trust registration payloads")
    func createsTrustRegistrationPayloads() throws {
        let identity = AppleDeviceIdentity(
            deviceId: "apple-device-1",
            displayName: "Casey's iPad",
            platform: "apple",
            createdAt: Date(timeIntervalSince1970: 100),
            lastSeenAt: Date(timeIntervalSince1970: 200)
        )

        #expect(identity.trustRegistrationPayload() == AppleDeviceTrustRegistrationPayload(device: AppleDeviceTrustRecord(
            deviceId: "apple-device-1",
            label: "Casey's iPad",
            platform: "apple",
            createdAt: Date(timeIntervalSince1970: 100),
            lastSeenAt: Date(timeIntervalSince1970: 200),
            status: .trusted
        )))

        let data = try identity.trustRegistrationPayload().brokerJSONData()
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let device = json?["device"] as? [String: Any]

        #expect(device?["deviceId"] as? String == "apple-device-1")
        #expect(device?["label"] as? String == "Casey's iPad")
        #expect(device?["platform"] as? String == "apple")
        #expect(device?["createdAt"] as? String == "1970-01-01T00:01:40Z")
        #expect(device?["lastSeenAt"] as? String == "1970-01-01T00:03:20Z")
        #expect(device?["status"] as? String == "trusted")
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
