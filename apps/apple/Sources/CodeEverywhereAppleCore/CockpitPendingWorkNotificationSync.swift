import Foundation

public struct CockpitSnapshotHTTPResponse: Equatable, Sendable {
    public var statusCode: Int
    public var data: Data

    public init(statusCode: Int, data: Data) {
        self.statusCode = statusCode
        self.data = data
    }
}

public protocol CockpitSnapshotHTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> CockpitSnapshotHTTPResponse
}

public struct URLSessionCockpitSnapshotHTTPTransport: CockpitSnapshotHTTPTransport, @unchecked Sendable {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> CockpitSnapshotHTTPResponse {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CockpitPendingWorkNotificationSyncError.invalidHTTPResponse
        }

        return CockpitSnapshotHTTPResponse(statusCode: httpResponse.statusCode, data: data)
    }
}

public enum CockpitPendingWorkNotificationSyncError: Error, Equatable {
    case missingBrokerURL
    case invalidHTTPResponse
    case requestFailed(Int)
    case invalidSnapshot
}

public struct CockpitPendingWorkNotificationCandidate: Equatable, Sendable {
    public var pendingItemId: String
    public var sessionId: String?
    public var title: String
    public var body: String

    public init(pendingItemId: String, sessionId: String?, title: String, body: String) {
        self.pendingItemId = pendingItemId
        self.sessionId = sessionId?.nilIfBlank
        self.title = title
        self.body = body
    }
}

public struct CockpitPendingWorkSnapshotClient: Sendable {
    private let transport: any CockpitSnapshotHTTPTransport

    public init(transport: any CockpitSnapshotHTTPTransport = URLSessionCockpitSnapshotHTTPTransport()) {
        self.transport = transport
    }

    public func fetchPendingWork(settings: CockpitConnectionSettings) async throws -> [CockpitPendingWorkNotificationCandidate] {
        guard let brokerURL = settings.brokerURL else {
            throw CockpitPendingWorkNotificationSyncError.missingBrokerURL
        }

        var request = URLRequest(url: brokerURL.appendingPathComponent("snapshot"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "accept")
        if let token = settings.brokerAuthToken?.nilIfBlank {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        }

        let response = try await transport.send(request)
        guard (200..<300).contains(response.statusCode) else {
            throw CockpitPendingWorkNotificationSyncError.requestFailed(response.statusCode)
        }

        let decoder = JSONDecoder()
        guard let snapshot = try? decoder.decode(CockpitPendingWorkSnapshot.self, from: response.data) else {
            throw CockpitPendingWorkNotificationSyncError.invalidSnapshot
        }

        return snapshot.pendingWorkCandidates()
    }
}

public actor CockpitPendingWorkNotificationSynchronizer {
    private let snapshotClient: CockpitPendingWorkSnapshotClient
    private let permissionProvider: any CockpitNotificationPermissionProviding
    private let scheduler: any CockpitLocalNotificationScheduling
    private let factory: CockpitLocalNotificationFactory
    private var scheduledNotificationIds: Set<String> = []

    public init(
        snapshotClient: CockpitPendingWorkSnapshotClient = CockpitPendingWorkSnapshotClient(),
        permissionProvider: any CockpitNotificationPermissionProviding = UserNotificationPermissionProvider(),
        scheduler: any CockpitLocalNotificationScheduling = UserNotificationScheduler(),
        factory: CockpitLocalNotificationFactory = CockpitLocalNotificationFactory()
    ) {
        self.snapshotClient = snapshotClient
        self.permissionProvider = permissionProvider
        self.scheduler = scheduler
        self.factory = factory
    }

    public func sync(settings: CockpitConnectionSettings) async throws {
        guard settings.brokerURL != nil else {
            cancelNotifications(ids: scheduledNotificationIds)
            scheduledNotificationIds = []
            return
        }

        let permission = await permissionProvider.currentPermissionState()
        guard permission.canScheduleNotifications else {
            cancelNotifications(ids: scheduledNotificationIds)
            scheduledNotificationIds = []
            return
        }

        let candidates = try await snapshotClient.fetchPendingWork(settings: settings)
        let notifications = candidates.compactMap { candidate in
            factory.pendingWorkNotification(
                pendingItemId: candidate.pendingItemId,
                sessionId: candidate.sessionId,
                title: candidate.title,
                body: candidate.body
            )
        }
        let nextNotificationIds = Set(notifications.map(\.id))

        cancelNotifications(ids: scheduledNotificationIds.subtracting(nextNotificationIds))

        for notification in notifications where !scheduledNotificationIds.contains(notification.id) {
            try await scheduler.schedule(notification)
        }

        scheduledNotificationIds = nextNotificationIds
    }

    public func cancelAll() {
        cancelNotifications(ids: scheduledNotificationIds)
        scheduledNotificationIds = []
    }

    public func scheduledIdsForTesting() -> Set<String> {
        scheduledNotificationIds
    }

    private func cancelNotifications(ids: Set<String>) {
        for id in ids {
            scheduler.cancelNotification(id: id)
        }
    }
}

private struct CockpitPendingWorkSnapshot: Decodable {
    var state: CockpitPendingWorkProjectionState

    func pendingWorkCandidates() -> [CockpitPendingWorkNotificationCandidate] {
        let approvals = state.pendingApprovals.values.map { approval in
            CockpitPendingWorkNotificationCandidate(
                pendingItemId: approval.id,
                sessionId: approval.sessionId,
                title: approval.title,
                body: approval.body
            )
        }
        let inputs = state.requestedInputs.values.map { input in
            CockpitPendingWorkNotificationCandidate(
                pendingItemId: input.id,
                sessionId: input.sessionId,
                title: input.title,
                body: input.questions.first?.prompt ?? "Every Code requested input."
            )
        }

        return (approvals + inputs).sorted { left, right in
            if left.sessionId == right.sessionId {
                return left.pendingItemId < right.pendingItemId
            }
            return (left.sessionId ?? "") < (right.sessionId ?? "")
        }
    }
}

private struct CockpitPendingWorkProjectionState: Decodable {
    var pendingApprovals: [String: CockpitPendingApprovalSnapshot]
    var requestedInputs: [String: CockpitRequestedInputSnapshot]
}

private struct CockpitPendingApprovalSnapshot: Decodable {
    var id: String
    var sessionId: String
    var title: String
    var body: String
}

private struct CockpitRequestedInputSnapshot: Decodable {
    var id: String
    var sessionId: String
    var title: String
    var questions: [CockpitRequestedInputQuestionSnapshot]
}

private struct CockpitRequestedInputQuestionSnapshot: Decodable {
    var prompt: String
}
