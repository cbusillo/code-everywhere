import Foundation
import Testing

@testable import CodeEverywhereAppleCore

@Suite("Cockpit deep links")
struct CockpitDeepLinkTests {
    private let parser = CockpitDeepLinkParser()

    @Test("parses session deep links")
    func parsesSessionLinks() throws {
        let route = parser.parse(try #require(URL(string: "code-everywhere://session/session-123?pending=approval-9")))

        #expect(route == .session(sessionId: "session-123", pendingItemId: "approval-9"))
    }

    @Test("parses pending-item deep links")
    func parsesPendingItemLinks() throws {
        let route = parser.parse(try #require(URL(string: "code-everywhere://pending/input-7?session=session-123")))

        #expect(route == .pendingItem(pendingItemId: "input-7", sessionId: "session-123"))
    }

    @Test("rejects links without a supported route")
    func rejectsUnsupportedLinks() throws {
        #expect(parser.parse(try #require(URL(string: "code-everywhere://settings"))) == nil)
    }

    @Test("creates web fragments for shared cockpit routing")
    func createsWebFragments() {
        #expect(parser.webFragment(for: .session(sessionId: "session-123", pendingItemId: "approval-9")) == "/session/session-123?pending=approval-9")
        #expect(parser.webFragment(for: .pendingItem(pendingItemId: "input-7", sessionId: nil)) == "/pending/input-7")
    }
}
