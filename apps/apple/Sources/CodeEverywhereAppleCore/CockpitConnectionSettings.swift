import Foundation

public struct CockpitConnectionSettings: Equatable, Sendable {
    public var cockpitURL: URL
    public var brokerURL: URL?
    public var brokerAuthToken: String?

    public init(cockpitURL: URL, brokerURL: URL? = nil, brokerAuthToken: String? = nil) {
        self.cockpitURL = cockpitURL
        self.brokerURL = brokerURL
        self.brokerAuthToken = brokerAuthToken?.nilIfBlank
    }
}

public struct CockpitConnectionSettingsStore {
    private let defaults: UserDefaults
    private let secrets: SecretStore
    private let cockpitURLKey: String
    private let brokerURLKey: String
    private let authTokenKey: String

    public init(
        defaults: UserDefaults = .standard,
        secrets: SecretStore,
        namespace: String = "CodeEverywhere"
    ) {
        self.defaults = defaults
        self.secrets = secrets
        self.cockpitURLKey = "\(namespace).cockpitURL"
        self.brokerURLKey = "\(namespace).brokerURL"
        self.authTokenKey = "\(namespace).brokerAuthToken"
    }

    public func load() throws -> CockpitConnectionSettings? {
        guard let cockpitURL = loadURL(forKey: cockpitURLKey) else {
            return nil
        }

        return CockpitConnectionSettings(
            cockpitURL: cockpitURL,
            brokerURL: loadURL(forKey: brokerURLKey),
            brokerAuthToken: try secrets.readSecret(account: authTokenKey)
        )
    }

    public func save(_ settings: CockpitConnectionSettings) throws {
        defaults.set(settings.cockpitURL.absoluteString, forKey: cockpitURLKey)
        if let brokerURL = settings.brokerURL {
            defaults.set(brokerURL.absoluteString, forKey: brokerURLKey)
        } else {
            defaults.removeObject(forKey: brokerURLKey)
        }

        if let token = settings.brokerAuthToken?.nilIfBlank {
            try secrets.saveSecret(token, account: authTokenKey)
        } else {
            try secrets.deleteSecret(account: authTokenKey)
        }
    }

    public func clear() throws {
        defaults.removeObject(forKey: cockpitURLKey)
        defaults.removeObject(forKey: brokerURLKey)
        try secrets.deleteSecret(account: authTokenKey)
    }

    private func loadURL(forKey key: String) -> URL? {
        guard let rawValue = defaults.string(forKey: key)?.nilIfBlank else {
            return nil
        }

        return URL(string: rawValue)
    }
}

extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
