import Foundation
import Testing

@testable import CodeEverywhereAppleCore

@Suite("Cockpit notification center")
struct CockpitNotificationCenterTests {
    @Test("models schedulable permission states")
    func modelsSchedulablePermissionStates() {
        #expect(CockpitNotificationPermissionState(authorization: .notDetermined).canScheduleNotifications == false)
        #expect(CockpitNotificationPermissionState(authorization: .denied).canScheduleNotifications == false)
        #expect(CockpitNotificationPermissionState(authorization: .authorized).canScheduleNotifications)
        #expect(CockpitNotificationPermissionState(authorization: .provisional).canScheduleNotifications)
        #expect(CockpitNotificationPermissionState(authorization: .ephemeral).canScheduleNotifications)
    }

    @Test("creates local pending-work notifications with route user info")
    func createsPendingWorkNotifications() throws {
        let notification = try #require(CockpitLocalNotificationFactory().pendingWorkNotification(
            pendingItemId: "approval-9",
            sessionId: "session-123",
            title: "Approval needed",
            body: "Install dependencies?"
        ))

        #expect(notification.id == "code-everywhere.pending.session-123.approval-9")
        #expect(notification.title == "Approval needed")
        #expect(notification.body == "Install dependencies?")
        #expect(notification.route == .pendingItem(pendingItemId: "approval-9", sessionId: "session-123"))
        #expect(notification.userInfo == [
            "codeEverywhere.routeURL": "code-everywhere://pending/approval-9?session=session-123",
        ])
    }

    @Test("scopes pending-work notification ids by session")
    func scopesPendingWorkNotificationIdsBySession() throws {
        let factory = CockpitLocalNotificationFactory()
        let first = try #require(factory.pendingWorkNotification(pendingItemId: "approval-9", sessionId: "session-123"))
        let second = try #require(factory.pendingWorkNotification(pendingItemId: "approval-9", sessionId: "session-456"))

        #expect(first.id == "code-everywhere.pending.session-123.approval-9")
        #expect(second.id == "code-everywhere.pending.session-456.approval-9")
        #expect(first.id != second.id)
    }

    @Test("creates sessionless pending-work notifications")
    func createsSessionlessPendingWorkNotifications() throws {
        let notification = try #require(CockpitLocalNotificationFactory().pendingWorkNotification(
            pendingItemId: "approval-9",
            sessionId: nil
        ))

        #expect(notification.id == "code-everywhere.pending.approval-9")
        #expect(notification.route == .pendingItem(pendingItemId: "approval-9", sessionId: nil))
        #expect(notification.userInfo == [
            "codeEverywhere.routeURL": "code-everywhere://pending/approval-9",
        ])
    }

    @Test("rejects empty pending-work identifiers")
    func rejectsEmptyPendingWorkIdentifiers() {
        let factory = CockpitLocalNotificationFactory()

        #expect(factory.pendingWorkNotification(pendingItemId: " ", sessionId: "session-123") == nil)
        #expect(factory.pendingWorkNotification(pendingItemId: "approval-9", sessionId: " ") != nil)
    }

    @Test("schedules and cancels through the abstraction")
    func schedulesAndCancelsThroughAbstraction() async throws {
        let scheduler = RecordingNotificationScheduler()
        let notification = try #require(CockpitLocalNotificationFactory().pendingWorkNotification(
            pendingItemId: "input-7",
            sessionId: "session-123"
        ))

        try await scheduler.schedule(notification)
        scheduler.cancelNotification(id: notification.id)

        #expect(scheduler.scheduled == [notification])
        #expect(scheduler.cancelledIds == ["code-everywhere.pending.session-123.input-7"])
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
