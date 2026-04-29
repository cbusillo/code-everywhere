import Foundation

public enum CockpitDeepLinkRoute: Equatable, Sendable {
    case session(sessionId: String, pendingItemId: String?)
    case pendingItem(pendingItemId: String, sessionId: String?)
}

public struct CockpitDeepLinkParser: Sendable {
    public init() {}

    public func parse(_ url: URL) -> CockpitDeepLinkRoute? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }

        let pathParts = makePathParts(url: url)
        let query = makeQueryMap(components: components)

        if pathParts.first == "session", let sessionId = pathParts.dropFirst().first?.nilIfBlank {
            return .session(sessionId: sessionId, pendingItemId: query["pending"]?.nilIfBlank)
        }

        if pathParts.first == "pending", let pendingItemId = pathParts.dropFirst().first?.nilIfBlank {
            return .pendingItem(pendingItemId: pendingItemId, sessionId: query["session"]?.nilIfBlank)
        }

        return nil
    }

    public func webFragment(for route: CockpitDeepLinkRoute) -> String {
        switch route {
        case let .session(sessionId, pendingItemId):
            return makeFragment(path: ["session", sessionId], query: ["pending": pendingItemId])
        case let .pendingItem(pendingItemId, sessionId):
            return makeFragment(path: ["pending", pendingItemId], query: ["session": sessionId])
        }
    }

    private func makePathParts(url: URL) -> [String] {
        var parts: [String] = []
        if url.scheme == "code-everywhere", let host = url.host(percentEncoded: false), host != "" {
            parts.append(host)
        }

        parts.append(contentsOf: url.pathComponents.filter { $0 != "/" })
        return parts
    }

    private func makeQueryMap(components: URLComponents) -> [String: String] {
        Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).compactMap { item in
            guard let value = item.value else {
                return nil
            }
            return (item.name, value)
        })
    }

    private func makeFragment(path: [String], query: [String: String?]) -> String {
        var components = URLComponents()
        components.path = "/" + path.map(percentEncodePathPart).joined(separator: "/")
        let queryItems: [URLQueryItem] = query.compactMap { name, value in
            guard let value = value?.nilIfBlank else {
                return nil
            }
            return URLQueryItem(name: name, value: value)
        }
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        return components.string ?? components.path
    }

    private func percentEncodePathPart(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }
}
