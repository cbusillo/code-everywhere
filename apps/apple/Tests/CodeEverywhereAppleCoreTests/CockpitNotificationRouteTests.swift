import Foundation
import Testing

@testable import CodeEverywhereAppleCore

@Suite("Cockpit notification routing")
struct CockpitNotificationRouteTests {
    private let router = CockpitNotificationRouter()

    @Test("creates session notification deep links")
    func createsSessionDeepLinks() {
        let url = router.deepLinkURL(for: .session(sessionId: "session-123"))

        #expect(url.absoluteString == "code-everywhere://session/session-123")
        #expect(router.route(from: url)?.deepLinkRoute == .session(sessionId: "session-123", pendingItemId: nil))
    }

    @Test("creates pending item notification deep links")
    func createsPendingItemDeepLinks() {
        let url = router.deepLinkURL(for: .pendingItem(pendingItemId: "approval-9", sessionId: "session-123"))

        #expect(url.absoluteString == "code-everywhere://pending/approval-9?session=session-123")
        #expect(router.route(from: url)?.deepLinkRoute == .pendingItem(pendingItemId: "approval-9", sessionId: "session-123"))
    }

    @Test("round trips notification user info")
    func roundTripsNotificationUserInfo() {
        let route = CockpitNotificationRoute.pendingItem(pendingItemId: "input with spaces", sessionId: "session-123")
        let userInfo = router.userInfo(for: route)

        #expect(userInfo == ["codeEverywhere.routeURL": "code-everywhere://pending/input%20with%20spaces?session=session-123"])
        #expect(router.route(from: userInfo)?.deepLinkRoute == .pendingItem(pendingItemId: "input with spaces", sessionId: "session-123"))
    }

    @Test("preserves pending item from session links")
    func preservesPendingItemFromSessionLinks() throws {
        let url = try #require(URL(string: "code-everywhere://session/session-123?pending=approval-9"))

        #expect(router.route(from: url)?.deepLinkRoute == .pendingItem(pendingItemId: "approval-9", sessionId: "session-123"))
    }

    @Test("rejects unsupported notification user info")
    func rejectsUnsupportedUserInfo() {
        #expect(router.route(from: ["codeEverywhere.routeURL": "code-everywhere://settings"]) == nil)
        #expect(router.route(from: ["other": "code-everywhere://session/session-123"]) == nil)
    }
}
