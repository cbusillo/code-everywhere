import Foundation

public struct AppleDeviceIdentity: Codable, Equatable, Sendable {
    public var deviceId: String
    public var displayName: String
    public var platform: String
    public var createdAt: Date
    public var lastSeenAt: Date

    public init(
        deviceId: String,
        displayName: String,
        platform: String,
        createdAt: Date,
        lastSeenAt: Date
    ) {
        self.deviceId = deviceId
        self.displayName = displayName.nilIfBlank ?? "Apple Device"
        self.platform = platform.nilIfBlank ?? "apple"
        self.createdAt = createdAt
        self.lastSeenAt = lastSeenAt
    }
}

public struct AppleDeviceIdentityStore {
    private let defaults: UserDefaults
    private let identityKey: String
    private let makeUUID: () -> UUID
    private let now: () -> Date
    private let defaultDisplayName: () -> String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(
        defaults: UserDefaults = .standard,
        namespace: String = "CodeEverywhere",
        makeUUID: @escaping () -> UUID = UUID.init,
        now: @escaping () -> Date = Date.init,
        defaultDisplayName: @escaping () -> String = AppleDeviceIdentityStore.defaultDeviceName
    ) {
        self.defaults = defaults
        self.identityKey = "\(namespace).appleDeviceIdentity"
        self.makeUUID = makeUUID
        self.now = now
        self.defaultDisplayName = defaultDisplayName
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func load() throws -> AppleDeviceIdentity? {
        guard let data = defaults.data(forKey: identityKey) else {
            return nil
        }

        return try decoder.decode(AppleDeviceIdentity.self, from: data)
    }

    public func loadOrCreate() throws -> AppleDeviceIdentity {
        if let identity = try load() {
            return identity
        }

        let timestamp = now()
        let identity = AppleDeviceIdentity(
            deviceId: "apple-\(makeUUID().uuidString.lowercased())",
            displayName: defaultDisplayName(),
            platform: "apple",
            createdAt: timestamp,
            lastSeenAt: timestamp
        )
        try save(identity)
        return identity
    }

    public func touch() throws -> AppleDeviceIdentity {
        var identity = try loadOrCreate()
        identity.lastSeenAt = now()
        try save(identity)
        return identity
    }

    public func save(_ identity: AppleDeviceIdentity) throws {
        defaults.set(try encoder.encode(identity), forKey: identityKey)
    }

    public func clear() {
        defaults.removeObject(forKey: identityKey)
    }

    public static func defaultDeviceName() -> String {
        ProcessInfo.processInfo.hostName.nilIfBlank ?? "Apple Device"
    }
}
