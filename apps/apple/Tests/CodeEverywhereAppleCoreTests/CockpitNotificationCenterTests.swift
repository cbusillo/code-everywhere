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

        #expect(notification.id == "code-everywhere.pending.approval-9")
        #expect(notification.title == "Approval needed")
        #expect(notification.body == "Install dependencies?")
        #expect(notification.route == .pendingItem(pendingItemId: "approval-9", sessionId: "session-123"))
        #expect(notification.userInfo == [
            "codeEverywhere.routeURL": "code-everywhere://pending/approval-9?session=session-123",
        ])
    }

    @Test("rejects empty pending-work identifiers")
    func rejectsEmptyPendingWorkIdentifiers() {
        let factory = CockpitLocalNotificationFactory()

        #expect(factory.pendingWorkNotification(pendingItemId: " ", sessionId: "session-123") == nil)
        #expect(factory.pendingWorkNotification(pendingItemId: "approval-9", sessionId: " ") == nil)
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
        #expect(scheduler.cancelledIds == ["code-everywhere.pending.input-7"])
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
