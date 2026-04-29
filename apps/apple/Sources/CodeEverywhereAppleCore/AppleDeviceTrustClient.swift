import Foundation

public struct AppleDeviceTrustHTTPResponse: Equatable, Sendable {
    public var statusCode: Int
    public var data: Data

    public init(statusCode: Int, data: Data) {
        self.statusCode = statusCode
        self.data = data
    }
}

public protocol AppleDeviceTrustHTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> AppleDeviceTrustHTTPResponse
}

public struct URLSessionAppleDeviceTrustHTTPTransport: AppleDeviceTrustHTTPTransport, @unchecked Sendable {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> AppleDeviceTrustHTTPResponse {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppleDeviceTrustClientError.invalidHTTPResponse
        }

        return AppleDeviceTrustHTTPResponse(statusCode: httpResponse.statusCode, data: data)
    }
}

public enum AppleDeviceTrustClientError: Error, Equatable {
    case missingBrokerURL
    case invalidHTTPResponse
    case requestFailed(Int)
    case invalidResponseBody
}

public struct AppleLocalTrustRegistrySnapshot: Decodable, Equatable, Sendable {
    public var version: Int
    public var devices: [AppleDeviceTrustRecord]

    public init(version: Int, devices: [AppleDeviceTrustRecord]) {
        self.version = version
        self.devices = devices
    }
}

public struct AppleDeviceTrustClient: Sendable {
    private let transport: any AppleDeviceTrustHTTPTransport

    public init(transport: any AppleDeviceTrustHTTPTransport = URLSessionAppleDeviceTrustHTTPTransport()) {
        self.transport = transport
    }

    public func fetchRegistry(settings: CockpitConnectionSettings) async throws -> AppleLocalTrustRegistrySnapshot {
        try await sendTrustRequest(pathComponents: ["trust"], settings: settings, method: "GET")
    }

    public func registerDevice(
        identity: AppleDeviceIdentity,
        settings: CockpitConnectionSettings
    ) async throws -> AppleLocalTrustRegistrySnapshot {
        let payload = identity.trustRegistrationPayload()
        return try await sendTrustRequest(
            pathComponents: ["trust", "devices"],
            settings: settings,
            method: "POST",
            body: payload.brokerJSONData()
        )
    }

    public func revokeDevice(
        identity: AppleDeviceIdentity,
        settings: CockpitConnectionSettings,
        revokedAt: Date = Date()
    ) async throws -> AppleLocalTrustRegistrySnapshot {
        let payload = AppleDeviceTrustRevocationPayload(deviceId: identity.deviceId, revokedAt: revokedAt)
        return try await sendTrustRequest(
            pathComponents: ["trust", "devices", "revoke"],
            settings: settings,
            method: "POST",
            body: payload.brokerJSONData()
        )
    }

    private func sendTrustRequest(
        pathComponents: [String],
        settings: CockpitConnectionSettings,
        method: String,
        body: Data? = nil
    ) async throws -> AppleLocalTrustRegistrySnapshot {
        guard let brokerURL = settings.brokerURL else {
            throw AppleDeviceTrustClientError.missingBrokerURL
        }

        var request = URLRequest(url: trustURL(baseURL: brokerURL, pathComponents: pathComponents))
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "accept")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
        }
        if let token = settings.brokerAuthToken?.nilIfBlank {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        }

        let response = try await transport.send(request)
        guard (200..<300).contains(response.statusCode) else {
            throw AppleDeviceTrustClientError.requestFailed(response.statusCode)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let snapshot = try? decoder.decode(AppleLocalTrustRegistrySnapshot.self, from: response.data),
              snapshot.version == 1
        else {
            throw AppleDeviceTrustClientError.invalidResponseBody
        }

        return snapshot
    }

    private func trustURL(baseURL: URL, pathComponents: [String]) -> URL {
        pathComponents.reduce(baseURL) { url, component in
            url.appendingPathComponent(component)
        }
    }
}

private struct AppleDeviceTrustRevocationPayload: Encodable {
    var deviceId: String
    var revokedAt: Date

    func brokerJSONData() throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(self)
    }
}
