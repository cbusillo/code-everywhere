import Foundation
import Testing

@testable import CodeEverywhereAppleCore

@Suite("Cockpit pending-work notification sync")
struct CockpitPendingWorkNotificationSyncTests {
    @Test("fetches pending work from the broker snapshot")
    func fetchesPendingWorkFromBrokerSnapshot() async throws {
        let transport = RecordingSnapshotTransport(responses: [
            CockpitSnapshotHTTPResponse(statusCode: 200, data: snapshotData(approvalIds: ["approval-1"], inputIds: ["input-1"])),
        ])
        let client = CockpitPendingWorkSnapshotClient(transport: transport)

        let candidates = try await client.fetchPendingWork(settings: settings(authToken: "token-value"))

        #expect(candidates == [
            CockpitPendingWorkNotificationCandidate(
                pendingItemId: "approval-1",
                sessionId: "session-1",
                title: "Approval needed",
                body: "Run pnpm validate?"
            ),
            CockpitPendingWorkNotificationCandidate(
                pendingItemId: "input-1",
                sessionId: "session-1",
                title: "Input needed",
                body: "Choose the next step."
            ),
        ])
        #expect(transport.requests.first?.url?.absoluteString == "http://127.0.0.1:4789/snapshot")
        #expect(transport.requests.first?.value(forHTTPHeaderField: "authorization") == "Bearer token-value")
    }

    @Test("synchronizer schedules new pending work once")
    func synchronizerSchedulesNewPendingWorkOnce() async throws {
        let transport = RecordingSnapshotTransport(responses: [
            CockpitSnapshotHTTPResponse(statusCode: 200, data: snapshotData(approvalIds: ["approval-1"])),
            CockpitSnapshotHTTPResponse(statusCode: 200, data: snapshotData(approvalIds: ["approval-1"])),
        ])
        let scheduler = RecordingNotificationScheduler()
        let synchronizer = CockpitPendingWorkNotificationSynchronizer(
            snapshotClient: CockpitPendingWorkSnapshotClient(transport: transport),
            permissionProvider: StaticNotificationPermissionProvider(.authorized),
            scheduler: scheduler
        )

        try await synchronizer.sync(settings: settings())
        try await synchronizer.sync(settings: settings())

        #expect(scheduler.scheduled.map(\.id) == ["code-everywhere.pending.session-1.approval-1"])
        #expect(scheduler.cancelledIds == [])
        #expect(await synchronizer.scheduledIdsForTesting() == ["code-everywhere.pending.session-1.approval-1"])
    }

    @Test("synchronizer cancels resolved pending work")
    func synchronizerCancelsResolvedPendingWork() async throws {
        let transport = RecordingSnapshotTransport(responses: [
            CockpitSnapshotHTTPResponse(statusCode: 200, data: snapshotData(approvalIds: ["approval-1"], inputIds: ["input-1"])),
            CockpitSnapshotHTTPResponse(statusCode: 200, data: snapshotData(inputIds: ["input-1"])),
        ])
        let scheduler = RecordingNotificationScheduler()
        let synchronizer = CockpitPendingWorkNotificationSynchronizer(
            snapshotClient: CockpitPendingWorkSnapshotClient(transport: transport),
            permissionProvider: StaticNotificationPermissionProvider(.authorized),
            scheduler: scheduler
        )

        try await synchronizer.sync(settings: settings())
        try await synchronizer.sync(settings: settings())

        #expect(scheduler.scheduled.map(\.id) == [
            "code-everywhere.pending.session-1.approval-1",
            "code-everywhere.pending.session-1.input-1",
        ])
        #expect(scheduler.cancelledIds == ["code-everywhere.pending.session-1.approval-1"])
        #expect(await synchronizer.scheduledIdsForTesting() == ["code-everywhere.pending.session-1.input-1"])
    }

    @Test("synchronizer cancels all notifications when permission is not schedulable")
    func synchronizerCancelsAllWhenPermissionIsNotSchedulable() async throws {
        let transport = RecordingSnapshotTransport(responses: [
            CockpitSnapshotHTTPResponse(statusCode: 200, data: snapshotData(approvalIds: ["approval-1"])),
        ])
        let permissionProvider = MutableNotificationPermissionProvider(.authorized)
        let scheduler = RecordingNotificationScheduler()
        let synchronizer = CockpitPendingWorkNotificationSynchronizer(
            snapshotClient: CockpitPendingWorkSnapshotClient(transport: transport),
            permissionProvider: permissionProvider,
            scheduler: scheduler
        )

        try await synchronizer.sync(settings: settings())
        permissionProvider.authorization = .denied
        try await synchronizer.sync(settings: settings())

        #expect(scheduler.scheduled.map(\.id) == ["code-everywhere.pending.session-1.approval-1"])
        #expect(scheduler.cancelledIds == ["code-everywhere.pending.session-1.approval-1"])
        #expect(await synchronizer.scheduledIdsForTesting() == [])
    }

    @Test("synchronizer cancels all notifications when broker settings are cleared")
    func synchronizerCancelsAllWhenBrokerSettingsAreCleared() async throws {
        let transport = RecordingSnapshotTransport(responses: [
            CockpitSnapshotHTTPResponse(statusCode: 200, data: snapshotData(approvalIds: ["approval-1"])),
        ])
        let scheduler = RecordingNotificationScheduler()
        let synchronizer = CockpitPendingWorkNotificationSynchronizer(
            snapshotClient: CockpitPendingWorkSnapshotClient(transport: transport),
            permissionProvider: StaticNotificationPermissionProvider(.authorized),
            scheduler: scheduler
        )

        try await synchronizer.sync(settings: settings())
        try await synchronizer.sync(settings: settings(brokerURL: nil))

        #expect(scheduler.scheduled.map(\.id) == ["code-everywhere.pending.session-1.approval-1"])
        #expect(scheduler.cancelledIds == ["code-everywhere.pending.session-1.approval-1"])
        #expect(await synchronizer.scheduledIdsForTesting() == [])
    }
}

private final class RecordingSnapshotTransport: CockpitSnapshotHTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var responses: [CockpitSnapshotHTTPResponse]
    private var recordedRequests: [URLRequest] = []

    init(responses: [CockpitSnapshotHTTPResponse]) {
        self.responses = responses
    }

    var requests: [URLRequest] {
        lock.withLock { recordedRequests }
    }

    func send(_ request: URLRequest) async throws -> CockpitSnapshotHTTPResponse {
        try lock.withLock {
            recordedRequests.append(request)
            guard !responses.isEmpty else {
                throw CockpitPendingWorkNotificationSyncError.invalidSnapshot
            }
            return responses.removeFirst()
        }
    }
}

private final class RecordingNotificationScheduler: CockpitLocalNotificationScheduling, @unchecked Sendable {
    private let lock = NSLock()
    private var recordedScheduled: [CockpitLocalNotification] = []
    private var recordedCancelledIds: [String] = []

    var scheduled: [CockpitLocalNotification] {
        lock.withLock { recordedScheduled }
    }

    var cancelledIds: [String] {
        lock.withLock { recordedCancelledIds }
    }

    func schedule(_ notification: CockpitLocalNotification) async throws {
        lock.withLock {
            recordedScheduled.append(notification)
        }
    }

    func cancelNotification(id: String) {
        lock.withLock {
            recordedCancelledIds.append(id)
        }
    }
}

private struct StaticNotificationPermissionProvider: CockpitNotificationPermissionProviding {
    var authorization: CockpitNotificationAuthorizationState

    init(_ authorization: CockpitNotificationAuthorizationState) {
        self.authorization = authorization
    }

    func currentPermissionState() async -> CockpitNotificationPermissionState {
        CockpitNotificationPermissionState(authorization: authorization)
    }

    func requestPermission() async throws -> CockpitNotificationPermissionState {
        CockpitNotificationPermissionState(authorization: authorization)
    }
}

private final class MutableNotificationPermissionProvider: CockpitNotificationPermissionProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var storedAuthorization: CockpitNotificationAuthorizationState

    init(_ authorization: CockpitNotificationAuthorizationState) {
        self.storedAuthorization = authorization
    }

    var authorization: CockpitNotificationAuthorizationState {
        get { lock.withLock { storedAuthorization } }
        set { lock.withLock { storedAuthorization = newValue } }
    }

    func currentPermissionState() async -> CockpitNotificationPermissionState {
        CockpitNotificationPermissionState(authorization: authorization)
    }

    func requestPermission() async throws -> CockpitNotificationPermissionState {
        CockpitNotificationPermissionState(authorization: authorization)
    }
}

private func settings(brokerURL: URL? = URL(string: "http://127.0.0.1:4789")!, authToken: String? = nil) -> CockpitConnectionSettings {
    CockpitConnectionSettings(
        cockpitURL: URL(string: "http://127.0.0.1:5173")!,
        brokerURL: brokerURL,
        brokerAuthToken: authToken
    )
}

private func snapshotData(approvalIds: [String] = [], inputIds: [String] = []) -> Data {
    let approvals = approvalIds
        .map { id in
            "\"\(id)\":{\"id\":\"\(id)\",\"sessionId\":\"session-1\",\"title\":\"Approval needed\",\"body\":\"Run pnpm validate?\"}"
        }
        .joined(separator: ",")
    let inputs = inputIds
        .map { id in
            "\"\(id)\":{\"id\":\"\(id)\",\"sessionId\":\"session-1\",\"title\":\"Input needed\",\"questions\":[{\"prompt\":\"Choose the next step.\"}]}"
        }
        .joined(separator: ",")
    return Data("""
    {
      "state": {
        "pendingApprovals": {\(approvals)},
        "requestedInputs": {\(inputs)}
      }
    }
    """.utf8)
}
