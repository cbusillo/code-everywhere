import Foundation
import Testing

@testable import CodeEverywhereAppleCore

@Suite("Cockpit connection settings")
struct CockpitConnectionSettingsTests {
    @Test("persists public URLs separately from secret broker token")
    func persistsConnectionSettings() throws {
        let defaults = makeDefaults()
        let secrets = InMemorySecretStore()
        let store = CockpitConnectionSettingsStore(defaults: defaults, secrets: secrets, namespace: "test")
        let settings = CockpitConnectionSettings(
            cockpitURL: try #require(URL(string: "http://127.0.0.1:5173")),
            brokerURL: try #require(URL(string: "http://127.0.0.1:4789")),
            brokerAuthToken: " token-value "
        )

        try store.save(settings)

        #expect(defaults.string(forKey: "test.cockpitURL") == "http://127.0.0.1:5173")
        #expect(defaults.string(forKey: "test.brokerURL") == "http://127.0.0.1:4789")
        #expect(defaults.string(forKey: "test.brokerAuthToken") == nil)
        #expect(try store.load() == CockpitConnectionSettings(
            cockpitURL: try #require(URL(string: "http://127.0.0.1:5173")),
            brokerURL: try #require(URL(string: "http://127.0.0.1:4789")),
            brokerAuthToken: "token-value"
        ))
    }

    @Test("clears stored URLs and token")
    func clearsConnectionSettings() throws {
        let defaults = makeDefaults()
        let store = CockpitConnectionSettingsStore(defaults: defaults, secrets: InMemorySecretStore(), namespace: "clear")
        try store.save(CockpitConnectionSettings(cockpitURL: try #require(URL(string: "http://127.0.0.1:5173")), brokerAuthToken: "secret"))

        try store.clear()

        #expect(try store.load() == nil)
    }

    private func makeDefaults() -> UserDefaults {
        let suiteName = "CodeEverywhereAppleTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        defaults.removePersistentDomain(forName: suiteName)
        return defaults
    }
}
