import Foundation
@preconcurrency import UserNotifications

public enum CockpitNotificationAuthorizationState: String, Equatable, Sendable {
    case notDetermined
    case denied
    case authorized
    case provisional
    case ephemeral
    case unknown
}

public struct CockpitNotificationPermissionState: Equatable, Sendable {
    public var authorization: CockpitNotificationAuthorizationState

    public init(authorization: CockpitNotificationAuthorizationState) {
        self.authorization = authorization
    }

    public var canScheduleNotifications: Bool {
        authorization == .authorized || authorization == .provisional || authorization == .ephemeral
    }
}

public protocol CockpitNotificationPermissionProviding: Sendable {
    func currentPermissionState() async -> CockpitNotificationPermissionState
    func requestPermission() async throws -> CockpitNotificationPermissionState
}

public protocol CockpitLocalNotificationScheduling: Sendable {
    func schedule(_ notification: CockpitLocalNotification) async throws
    func cancelNotification(id: String)
}

public struct CockpitLocalNotification: Equatable, Sendable {
    public var id: String
    public var title: String
    public var body: String
    public var route: CockpitNotificationRoute
    public var userInfo: [String: String]

    public init(id: String, title: String, body: String, route: CockpitNotificationRoute, userInfo: [String: String]) {
        self.id = id
        self.title = title
        self.body = body
        self.route = route
        self.userInfo = userInfo
    }
}

public struct CockpitLocalNotificationFactory: Sendable {
    private let router: CockpitNotificationRouter

    public init(router: CockpitNotificationRouter = CockpitNotificationRouter()) {
        self.router = router
    }

    public func pendingWorkNotification(
        pendingItemId: String,
        sessionId: String,
        title: String = "Code Everywhere needs attention",
        body: String = "A session has pending work."
    ) -> CockpitLocalNotification? {
        guard let pendingItemId = pendingItemId.nilIfBlank,
              let sessionId = sessionId.nilIfBlank
        else {
            return nil
        }

        let route = CockpitNotificationRoute.pendingItem(pendingItemId: pendingItemId, sessionId: sessionId)
        return CockpitLocalNotification(
            id: "code-everywhere.pending.\(pendingItemId)",
            title: title,
            body: body,
            route: route,
            userInfo: router.userInfo(for: route)
        )
    }
}

public struct UserNotificationPermissionProvider: CockpitNotificationPermissionProviding, @unchecked Sendable {
    private let center: UNUserNotificationCenter

    public init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    public func currentPermissionState() async -> CockpitNotificationPermissionState {
        await withCheckedContinuation { continuation in
            center.getNotificationSettings { settings in
                continuation.resume(returning: CockpitNotificationPermissionState(settings: settings))
            }
        }
    }

    public func requestPermission() async throws -> CockpitNotificationPermissionState {
        _ = try await center.requestAuthorization(options: [.alert, .badge, .sound])
        return await currentPermissionState()
    }
}

public struct UserNotificationScheduler: CockpitLocalNotificationScheduling, @unchecked Sendable {
    private let center: UNUserNotificationCenter

    public init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    public func schedule(_ notification: CockpitLocalNotification) async throws {
        let content = UNMutableNotificationContent()
        content.title = notification.title
        content.body = notification.body
        content.userInfo = notification.userInfo

        let request = UNNotificationRequest(identifier: notification.id, content: content, trigger: nil)
        try await center.add(request)
    }

    public func cancelNotification(id: String) {
        center.removePendingNotificationRequests(withIdentifiers: [id])
    }
}

extension CockpitNotificationPermissionState {
    init(settings: UNNotificationSettings) {
        self.init(authorization: CockpitNotificationAuthorizationState(settings.authorizationStatus))
    }
}

extension CockpitNotificationAuthorizationState {
    init(_ status: UNAuthorizationStatus) {
        switch status {
        case .notDetermined:
            self = .notDetermined
        case .denied:
            self = .denied
        case .authorized:
            self = .authorized
        case .provisional:
            self = .provisional
        case .ephemeral:
            self = .ephemeral
        @unknown default:
            self = .unknown
        }
    }
}
