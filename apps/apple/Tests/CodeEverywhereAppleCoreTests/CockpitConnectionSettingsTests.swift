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
            cockpitURL: URL(string: "http://127.0.0.1:5173")!,
            brokerURL: URL(string: "http://127.0.0.1:4789")!,
            brokerAuthToken: " token-value "
        )

        try store.save(settings)

        #expect(defaults.string(forKey: "test.cockpitURL") == "http://127.0.0.1:5173")
        #expect(defaults.string(forKey: "test.brokerURL") == "http://127.0.0.1:4789")
        #expect(defaults.string(forKey: "test.brokerAuthToken") == nil)
        #expect(try store.load() == CockpitConnectionSettings(
            cockpitURL: URL(string: "http://127.0.0.1:5173")!,
            brokerURL: URL(string: "http://127.0.0.1:4789")!,
            brokerAuthToken: "token-value"
        ))
    }

    @Test("clears stored URLs and token")
    func clearsConnectionSettings() throws {
        let defaults = makeDefaults()
        let store = CockpitConnectionSettingsStore(defaults: defaults, secrets: InMemorySecretStore(), namespace: "clear")
        try store.save(CockpitConnectionSettings(
            cockpitURL: URL(string: "http://127.0.0.1:5173")!,
            brokerAuthToken: "secret"
        ))

        try store.clear()

        #expect(try store.load() == nil)
    }

    @Test("creates settings from editable URL text")
    func createsSettingsFromDraftText() throws {
        let draft = CockpitConnectionSettingsDraft(
            cockpitURLText: " http://127.0.0.1:5180 ",
            brokerURLText: " http://127.0.0.1:4789 ",
            brokerAuthTokenText: " secret-token "
        )

        #expect(try draft.connectionSettings() == CockpitConnectionSettings(
            cockpitURL: URL(string: "http://127.0.0.1:5180")!,
            brokerURL: URL(string: "http://127.0.0.1:4789")!,
            brokerAuthToken: "secret-token"
        ))
    }

    @Test("allows a blank broker URL but requires a valid cockpit URL")
    func validatesDraftURLs() throws {
        #expect(try CockpitConnectionSettingsDraft(
            cockpitURLText: "https://code-everywhere.local",
            brokerURLText: ""
        ).connectionSettings() == CockpitConnectionSettings(
            cockpitURL: URL(string: "https://code-everywhere.local")!,
            brokerURL: nil
        ))
        #expect(throws: CockpitConnectionSettingsDraftError.invalidCockpitURL) {
            try CockpitConnectionSettingsDraft(cockpitURLText: "not a url").connectionSettings()
        }
        #expect(throws: CockpitConnectionSettingsDraftError.invalidBrokerURL) {
            try CockpitConnectionSettingsDraft(
                cockpitURLText: "http://127.0.0.1:5180",
                brokerURLText: "file:///tmp/broker"
            ).connectionSettings()
        }
    }

    @Test("creates settings from launch arguments")
    func createsSettingsFromLaunchArguments() throws {
        #expect(try CockpitConnectionSettingsOverrides.settings(from: ["CodeEverywhere"]) == nil)
        #expect(try CockpitConnectionSettingsOverrides.settings(from: [
            "CodeEverywhere",
            "--code-everywhere-connection",
            "--cockpit-url",
            "http://192.168.1.3:5181",
            "--broker-url",
            "http://192.168.1.3:4790",
            "--broker-auth-token",
            " proof-token ",
        ]) == CockpitConnectionSettings(
            cockpitURL: URL(string: "http://192.168.1.3:5181")!,
            brokerURL: URL(string: "http://192.168.1.3:4790")!,
            brokerAuthToken: "proof-token"
        ))
    }

    @Test("rejects malformed launch argument overrides")
    func rejectsMalformedLaunchArgumentOverrides() throws {
        #expect(throws: CockpitConnectionSettingsDraftError.invalidCockpitURL) {
            try CockpitConnectionSettingsOverrides.settings(from: [
                "CodeEverywhere",
                "--code-everywhere-connection",
                "--broker-url",
                "http://192.168.1.3:4790",
            ])
        }
        #expect(throws: CockpitConnectionSettingsDraftError.invalidBrokerURL) {
            try CockpitConnectionSettingsOverrides.settings(from: [
                "CodeEverywhere",
                "--code-everywhere-connection",
                "--cockpit-url",
                "http://192.168.1.3:5182",
                "--broker-url",
                "ftp://192.168.1.3:4790",
            ])
        }
    }

    private func makeDefaults() -> UserDefaults {
        let suiteName = "CodeEverywhereAppleTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        defaults.removePersistentDomain(forName: suiteName)
        return defaults
    }
}
