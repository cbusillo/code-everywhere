import Foundation

public enum CockpitNotificationRoute: Equatable, Sendable {
    case session(sessionId: String)
    case pendingItem(pendingItemId: String, sessionId: String?)

    public init?(deepLinkRoute: CockpitDeepLinkRoute) {
        switch deepLinkRoute {
        case let .session(sessionId, pendingItemId):
            guard let sessionId = sessionId.nilIfBlank else {
                return nil
            }
            if let pendingItemId = pendingItemId?.nilIfBlank {
                self = .pendingItem(pendingItemId: pendingItemId, sessionId: sessionId)
            } else {
                self = .session(sessionId: sessionId)
            }
        case let .pendingItem(pendingItemId, sessionId):
            guard let pendingItemId = pendingItemId.nilIfBlank else {
                return nil
            }
            self = .pendingItem(pendingItemId: pendingItemId, sessionId: sessionId?.nilIfBlank)
        }
    }

    public var deepLinkRoute: CockpitDeepLinkRoute {
        switch self {
        case let .session(sessionId):
            .session(sessionId: sessionId, pendingItemId: nil)
        case let .pendingItem(pendingItemId, sessionId):
            .pendingItem(pendingItemId: pendingItemId, sessionId: sessionId)
        }
    }
}

public struct CockpitNotificationRouter: Sendable {
    private let deepLinkParser: CockpitDeepLinkParser
    private let routeURLUserInfoKey = "codeEverywhere.routeURL"

    public init(deepLinkParser: CockpitDeepLinkParser = CockpitDeepLinkParser()) {
        self.deepLinkParser = deepLinkParser
    }

    public func deepLinkURL(for route: CockpitNotificationRoute) -> URL {
        var components = URLComponents()
        components.scheme = "code-everywhere"
        switch route {
        case let .session(sessionId):
            components.host = "session"
            components.percentEncodedPath = "/\(percentEncodePathSegment(sessionId))"
        case let .pendingItem(pendingItemId, sessionId):
            components.host = "pending"
            components.percentEncodedPath = "/\(percentEncodePathSegment(pendingItemId))"
            if let sessionId = sessionId?.nilIfBlank {
                components.queryItems = [URLQueryItem(name: "session", value: sessionId)]
            }
        }

        return components.url ?? URL(string: "code-everywhere://")!
    }

    public func userInfo(for route: CockpitNotificationRoute) -> [String: String] {
        [routeURLUserInfoKey: deepLinkURL(for: route).absoluteString]
    }

    public func route(from url: URL) -> CockpitNotificationRoute? {
        guard let route = deepLinkParser.parse(url) else {
            return nil
        }
        return CockpitNotificationRoute(deepLinkRoute: route)
    }

    public func route(from userInfo: [AnyHashable: Any]) -> CockpitNotificationRoute? {
        guard let routeURL = userInfo[routeURLUserInfoKey] as? String,
              let url = URL(string: routeURL)
        else {
            return nil
        }

        return route(from: url)
    }

    private func percentEncodePathSegment(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}
