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

public enum CockpitConnectionSettingsDraftError: Error, Equatable {
    case invalidCockpitURL
    case invalidBrokerURL
}

public struct CockpitConnectionSettingsDraft: Equatable, Sendable {
    public var cockpitURLText: String
    public var brokerURLText: String
    public var brokerAuthTokenText: String

    public init(cockpitURLText: String, brokerURLText: String = "", brokerAuthTokenText: String = "") {
        self.cockpitURLText = cockpitURLText
        self.brokerURLText = brokerURLText
        self.brokerAuthTokenText = brokerAuthTokenText
    }

    public init(settings: CockpitConnectionSettings) {
        self.init(
            cockpitURLText: settings.cockpitURL.absoluteString,
            brokerURLText: settings.brokerURL?.absoluteString ?? "",
            brokerAuthTokenText: settings.brokerAuthToken ?? "",
        )
    }

    public func connectionSettings() throws -> CockpitConnectionSettings {
        guard let cockpitURL = validatedURL(cockpitURLText) else {
            throw CockpitConnectionSettingsDraftError.invalidCockpitURL
        }

        let brokerURL: URL?
        if let brokerURLText = brokerURLText.nilIfBlank {
            guard let parsedBrokerURL = validatedURL(brokerURLText) else {
                throw CockpitConnectionSettingsDraftError.invalidBrokerURL
            }
            brokerURL = parsedBrokerURL
        } else {
            brokerURL = nil
        }

        return CockpitConnectionSettings(
            cockpitURL: cockpitURL,
            brokerURL: brokerURL,
            brokerAuthToken: brokerAuthTokenText
        )
    }

    private func validatedURL(_ value: String) -> URL? {
        guard let text = value.nilIfBlank, let url = URL(string: text), url.host() != nil else {
            return nil
        }

        switch url.scheme?.lowercased() {
        case "http", "https":
            return url
        default:
            return nil
        }
    }
}

public enum CockpitConnectionSettingsOverrides {
    public static func settings(from arguments: [String]) throws -> CockpitConnectionSettings? {
        guard arguments.contains("--code-everywhere-connection") else {
            return nil
        }

        return try CockpitConnectionSettingsDraft(
            cockpitURLText: optionValue(after: "--cockpit-url", in: arguments) ?? "",
            brokerURLText: optionValue(after: "--broker-url", in: arguments) ?? "",
            brokerAuthTokenText: optionValue(after: "--broker-auth-token", in: arguments) ?? ""
        ).connectionSettings()
    }

    private static func optionValue(after option: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: option), arguments.indices.contains(index + 1) else {
            return nil
        }

        return arguments[index + 1]
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
