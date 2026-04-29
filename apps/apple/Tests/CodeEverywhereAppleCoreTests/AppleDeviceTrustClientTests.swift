import Foundation
import Testing

@testable import CodeEverywhereAppleCore

@Suite("Apple device trust client")
struct AppleDeviceTrustClientTests {
    @Test("registers the local device with broker auth")
    func registersLocalDevice() async throws {
        let transport = RecordingDeviceTrustTransport(responses: [
            AppleDeviceTrustHTTPResponse(statusCode: 200, data: snapshotData(status: "trusted")),
        ])
        let client = AppleDeviceTrustClient(transport: transport)

        let snapshot = try await client.registerDevice(identity: identity, settings: settings(authToken: " -token "))

        let request = try #require(transport.requests.first)
        let body = try requestBody(request)
        let device = try #require(body["device"] as? [String: Any])

        #expect(request.url?.absoluteString == "http://127.0.0.1:4789/trust/devices")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "authorization") == "Bearer -token")
        #expect(device["deviceId"] as? String == "apple-device-1")
        #expect(device["label"] as? String == "Casey's iPad")
        #expect(device["platform"] as? String == "apple")
        #expect(device["createdAt"] as? String == "1970-01-01T00:01:40Z")
        #expect(device["lastSeenAt"] as? String == "1970-01-01T00:03:20Z")
        #expect(device["status"] as? String == "trusted")
        #expect(snapshot.devices.first?.status == .trusted)
    }

    @Test("fetches the broker trust registry")
    func fetchesBrokerTrustRegistry() async throws {
        let transport = RecordingDeviceTrustTransport(responses: [
            AppleDeviceTrustHTTPResponse(statusCode: 200, data: snapshotData(status: "trusted")),
        ])
        let client = AppleDeviceTrustClient(transport: transport)

        let snapshot = try await client.fetchRegistry(settings: settings(authToken: "token-value"))

        let request = try #require(transport.requests.first)

        #expect(request.url?.absoluteString == "http://127.0.0.1:4789/trust")
        #expect(request.httpMethod == "GET")
        #expect(request.httpBody == nil)
        #expect(request.value(forHTTPHeaderField: "authorization") == "Bearer token-value")
        #expect(snapshot.devices.first?.deviceId == "apple-device-1")
    }

    @Test("revokes the local device")
    func revokesLocalDevice() async throws {
        let transport = RecordingDeviceTrustTransport(responses: [
            AppleDeviceTrustHTTPResponse(statusCode: 200, data: snapshotData(status: "revoked")),
        ])
        let client = AppleDeviceTrustClient(transport: transport)

        let snapshot = try await client.revokeDevice(
            identity: identity,
            settings: settings(),
            revokedAt: Date(timeIntervalSince1970: 300)
        )

        let request = try #require(transport.requests.first)
        let body = try requestBody(request)

        #expect(request.url?.absoluteString == "http://127.0.0.1:4789/trust/devices/revoke")
        #expect(body["deviceId"] as? String == "apple-device-1")
        #expect(body["revokedAt"] as? String == "1970-01-01T00:05:00Z")
        #expect(snapshot.devices.first?.status == .revoked)
    }

    @Test("requires a broker URL")
    func requiresBrokerURL() async throws {
        let client = AppleDeviceTrustClient(transport: RecordingDeviceTrustTransport(responses: []))
        let settings = CockpitConnectionSettings(cockpitURL: URL(string: "http://127.0.0.1:5173")!)

        await #expect(throws: AppleDeviceTrustClientError.missingBrokerURL) {
            _ = try await client.registerDevice(identity: identity, settings: settings)
        }
    }

    @Test("rejects failed or malformed broker responses")
    func rejectsFailedResponses() async throws {
        let failingClient = AppleDeviceTrustClient(transport: RecordingDeviceTrustTransport(responses: [
            AppleDeviceTrustHTTPResponse(statusCode: 401, data: Data()),
        ]))

        await #expect(throws: AppleDeviceTrustClientError.requestFailed(401)) {
            _ = try await failingClient.registerDevice(identity: identity, settings: settings())
        }

        let malformedClient = AppleDeviceTrustClient(transport: RecordingDeviceTrustTransport(responses: [
            AppleDeviceTrustHTTPResponse(statusCode: 200, data: Data("{}".utf8)),
        ]))

        await #expect(throws: AppleDeviceTrustClientError.invalidResponseBody) {
            _ = try await malformedClient.registerDevice(identity: identity, settings: settings())
        }
    }

    private var identity: AppleDeviceIdentity {
        AppleDeviceIdentity(
            deviceId: "apple-device-1",
            displayName: "Casey's iPad",
            platform: "apple",
            createdAt: Date(timeIntervalSince1970: 100),
            lastSeenAt: Date(timeIntervalSince1970: 200)
        )
    }

    private func settings(authToken: String? = nil) -> CockpitConnectionSettings {
        CockpitConnectionSettings(
            cockpitURL: URL(string: "http://127.0.0.1:5173")!,
            brokerURL: URL(string: "http://127.0.0.1:4789")!,
            brokerAuthToken: authToken
        )
    }

    private func snapshotData(status: String) -> Data {
        Data(
            """
            {
              "version": 1,
              "operator": null,
              "hosts": [],
              "devices": [
                {
                  "deviceId": "apple-device-1",
                  "label": "Casey's iPad",
                  "platform": "apple",
                  "createdAt": "1970-01-01T00:01:40Z",
                  "lastSeenAt": "1970-01-01T00:03:20Z",
                  "status": "\(status)"
                }
              ]
            }
            """.utf8
        )
    }

    private func requestBody(_ request: URLRequest) throws -> [String: Any] {
        let data = try #require(request.httpBody)
        return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}

private final class RecordingDeviceTrustTransport: AppleDeviceTrustHTTPTransport, @unchecked Sendable {
    var requests: [URLRequest] {
        lock.withLock { capturedRequests }
    }

    private var capturedRequests: [URLRequest] = []
    private var responses: [AppleDeviceTrustHTTPResponse]
    private let lock = NSLock()

    init(responses: [AppleDeviceTrustHTTPResponse]) {
        self.responses = responses
    }

    func send(_ request: URLRequest) async throws -> AppleDeviceTrustHTTPResponse {
        lock.withLock {
            capturedRequests.append(request)
            return responses.isEmpty ? AppleDeviceTrustHTTPResponse(statusCode: 500, data: Data()) : responses.removeFirst()
        }
    }
}
